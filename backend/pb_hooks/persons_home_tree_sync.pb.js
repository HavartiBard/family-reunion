/// <reference path="../pb_data/types.d.ts" />

// Fills users.home_tree from the linked person's tree whenever a persons record with
// linked_user AND tree both set is created or updated -- fill-blank-only, never
// overwrites an already-set home_tree.
//
// Why this exists: every tree-visibility hook in this repo reads authRecord.get('home_tree')
// to compute a user's visible/writable tree set, but nothing ever WROTE home_tree going
// forward -- the one-time Phase 2 backfill script (tools/backfill_tree/) set it once for
// historical data, and nothing since has kept it current for new users. Concretely,
// adminApproveClaim() (app.js) links a person to a user (persons.linked_user PATCH) but
// never touches users.home_tree, so every claim approved after the initial backfill leaves
// the approved user permanently untreed -- silently visible to everyone (and seeing
// everyone) under the fail-open-for-untreed policy, with no error or indication anything
// is wrong. Confirmed as a live bug: a real registrant (jma8chz@gmail.com) went through
// exactly this path and ended up untreed.
//
// Runs on BOTH create and update because a person can be created already linked
// (skipClaim's self-link path sets linked_user at creation time), not just linked via a
// later update (adminApproveClaim's normal claim-review path).
//
// Same self-contained-closure convention as every other pb_hooks file; same
// recompute-and-fill pattern as branch_admins_sync_admin_trees.pb.js, wrapped in try/catch
// so this hook can never break a persons write.

onRecordAfterCreateRequest((e) => {
  try {
    const linkedUserId = e.record.get('linked_user');
    const treeId = e.record.get('tree');
    if (!linkedUserId || !treeId) {
      return;
    }
    const dao = $app.dao();
    const user = dao.findRecordById('users', linkedUserId);
    if (!user) {
      return;
    }
    const currentHomeTree = user.get('home_tree');
    if (currentHomeTree && currentHomeTree !== '') {
      return;
    }
    user.set('home_tree', treeId);
    dao.saveRecord(user);
  } catch (err) {
    // No-op: this hook must never crash persons writes.
  }
}, 'persons');

onRecordAfterUpdateRequest((e) => {
  try {
    const linkedUserId = e.record.get('linked_user');
    const treeId = e.record.get('tree');
    if (!linkedUserId || !treeId) {
      return;
    }
    const dao = $app.dao();
    const user = dao.findRecordById('users', linkedUserId);
    if (!user) {
      return;
    }
    const currentHomeTree = user.get('home_tree');
    if (currentHomeTree && currentHomeTree !== '') {
      return;
    }
    user.set('home_tree', treeId);
    dao.saveRecord(user);
  } catch (err) {
    // No-op: this hook must never crash persons writes.
  }
}, 'persons');
