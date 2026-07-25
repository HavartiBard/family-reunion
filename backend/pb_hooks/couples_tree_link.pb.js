/// <reference path="../pb_data/types.d.ts" />

// PocketBase 0.22.x uses the pre-0.23 JSVM hook API: onRecordAfterCreateRequest /
// onRecordAfterUpdateRequest, event object exposes `.record` and `.dao` (originally
// `.httpContext` too, unused here). Record field access goes through `.get()`/`.set()`,
// not direct property access, and persistence goes through `dao.saveRecord(record)` —
// there is no `dao.update(...)`/`dao.findById(...)` in this version's JSVM surface;
// the lookup helper is `dao.findRecordById(collectionIdOrName, id)`.
//
// Findings from live smoke-testing against the dev PocketBase container (per the
// Phase 1 verification plan) — all confirmed against the actual running 0.22.20 binary,
// not assumed from docs:
//
// 1. PocketBase 0.22.x's JSVM re-evaluates each onRecord* callback in isolation and does
//    NOT retain sibling top-level `function` declarations from the rest of the file — a
//    call out to an external helper function fails at runtime with "ReferenceError:
//    <helper> is not defined at <eval>:...". Fix: keep the handler fully self-contained
//    in the one closure passed to onRecord*Request, no references to other top-level
//    declarations.
// 2. The event object has no `.dao` in this version — use the global `$app.dao()`.
// 3. This repo's multi-select relation convention is `maxSelect: null` (see
//    1718500004_add_gallery.js's tagged_persons field), NOT `maxSelect: -1` — the
//    latter does not behave as "unlimited" and instead makes writes silently overwrite
//    instead of append, which looks like the hook doing nothing.
// 4. Only unioning the two directly-linked trees' existing sets into each other (as
//    originally written) does NOT achieve full transitive closure: if tree A already
//    links to tree B, and a new marriage links tree B to tree C, tree A never learns
//    about tree C unless every tree in the merged connected component gets updated, not
//    just the two trees touched by this specific couples record. Fixed below by
//    computing the full merged component (A's existing links ∪ B's existing links ∪
//    {A, B}) and writing that (minus self) to every tree in it.

const linkCouplesTrees = (e) => {
  try {
    const record = e.record;
    const dao = $app.dao();

    const partnerAId = record.get("partner_a");
    const partnerBId = record.get("partner_b");
    if (!partnerAId || !partnerBId) {
      return;
    }

    const personA = dao.findRecordById("persons", partnerAId);
    const personB = dao.findRecordById("persons", partnerBId);
    if (!personA || !personB) {
      return;
    }

    const treeAId = personA.get("tree");
    const treeBId = personB.get("tree");
    if (!treeAId || !treeBId || treeAId === treeBId) {
      return;
    }

    const treeA = dao.findRecordById("trees", treeAId);
    const treeB = dao.findRecordById("trees", treeBId);
    if (!treeA || !treeB) {
      return;
    }

    // Full connected-component union, not just the two directly-linked trees, so every
    // tree in the merged component ends up with a single-hop-complete linked_trees set.
    const merged = new Set([
      treeAId,
      treeBId,
      ...(treeA.get("linked_trees") || []),
      ...(treeB.get("linked_trees") || []),
    ]);

    merged.forEach((id) => {
      const rec = id === treeAId ? treeA : id === treeBId ? treeB : dao.findRecordById("trees", id);
      if (!rec) {
        return;
      }
      const others = [...merged].filter((x) => x !== id);
      rec.set("linked_trees", others);
      dao.saveRecord(rec);
    });
  } catch (err) {
    // No-op: this hook must never crash record creation/update.
  }
};

onRecordAfterCreateRequest(linkCouplesTrees, "couples");
onRecordAfterUpdateRequest(linkCouplesTrees, "couples");
