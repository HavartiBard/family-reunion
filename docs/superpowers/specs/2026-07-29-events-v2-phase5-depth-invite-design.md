# Events v2 Phase 5: Depth-Based Neighborhood Invite

## Context

Events v2 Phases 1-4 (invites/audience, date poll, location poll, announcements/poll-notifications) are all merged. This is Phase 5 (tracking issue #100), the last and most speculative phase of the original feature request — "invite based on generational depth from a person." Deliberately deferred: even the original feature requester was unsure of the right semantics ("does 2 generations get too aggressive? does it invite all spousal links 2 generations deep?"). Brainstormed with James 2026-07-29 to resolve that.

## Semantics

**Depth is measured from a chosen root person, walking up then back down.** For a given depth N: walk up from the root by N generations via `persons.father`/`.mother` to find the ancestor(s) that far back, then walk down from those ancestors by N generations (via `persons where father = X || mother = X`, since children aren't stored on the parent record) to find everyone within that span. This is the standard genealogical "degree of relation" shape (the same one "Nth cousins" is defined by) — it naturally captures siblings, cousins, aunts/uncles, not just direct lineage, which is what "invite my extended family" actually means for a reunion. A pure ancestors-and-descendants-of-the-root walk (no up-then-down) was considered and rejected — it would miss all lateral relatives.

**Spouses are included at their own generation, not recursed into.** For every person found by the up-then-down walk (including the root), their spouse(s) — via `couples`, one hop only — are added to the result set. The walk does **not** continue into a spouse's own separate ancestry/tree. This is what keeps the "too aggressive" concern from the original brainstorm contained: inviting your cousin's spouse is fine; auto-cascading into that spouse's entire unrelated family line is not.

**Scoped to one tree only.** The walk operates entirely within the root person's own tree (via `father`/`mother`/`couples`, which are themselves tree-scoped by the existing data model). Cross-tree reach stays an explicit choice via Phase 1's `extra_trees` mechanism, never something this feature triggers automatically.

**One shared depth number, not separate up/down controls.** Depth=1 → root's parents (up), and back down to the parents' other children (root's siblings) plus root's own children. Depth=2 → grandparents' whole line: aunts/uncles, cousins, grandchildren. A single input, matching how people already talk about this ("go back 2 generations"), not two separate knobs.

**Root person is organizer-selected, not fixed.** The organizer picks any person via the existing person-search UI (same one used for claiming/tagging), defaulting to their own linked person if they have one. The organizer isn't always the most central person for a given event (e.g. a reunion centered on a grandparent's line).

## Data model / architecture

**No new backend work.** The walk runs entirely client-side in `app.js`, over `persons`/`couples` data the browser already fetches for the tree view — data that's already tree-visibility-scoped by the existing backend hooks (`persons_tree_visibility.pb.js` etc.). A walk over already-fetched, already-authorized data respects who the organizer can see with zero new backend authorization logic, and at this dataset's scale (~80-90 persons per the last Neo4j evaluation) is trivially fast in JS. A backend route was considered and rejected: it would need its own multi-tenant tree-visibility layer on top, more of the hand-rolled JS-hook complexity this codebase already has plenty of, for a computation that doesn't need to be server-side at this scale.

**Output feeds the existing Phase 1 pending-invites mechanism.** Suggested invitees are added to the same `_eventFormPendingInvites` array the manual user-search and email-add controls already populate in the event form — same review/remove UX, same POST-per-invite flow on save. No new submission path, no new `event_invites` semantics.

## Algorithm

Implemented as a pure, DOM-free function (belongs in `helpers.js` alongside `merge.js`'s own pure-logic precedent — unit-testable against a fixture person/couple dataset without a browser, not inline in `app.js`):

1. BFS up from the root person by `depth` generations via `father`/`mother` → ancestor set (0, 1, or 2 people depending on how far the tree data actually extends; incomplete lineage data just yields a smaller ancestor set, not an error).
2. BFS down from each ancestor by `depth` generations via children → union into a result set, deduped by person id (matters when multiple ancestor paths converge, e.g. intermarriage within the tree).
3. For every person in the result set (including the root), add their spouse(s) via `couples`, one hop only.
4. Exclude the organizer's own linked person from the final set (no self-invite).
5. Group the result set into **nuclear family units** — a `couples` pair (or single parent) plus their direct children, or a lone individual with no partner/children in the set — for the aggregation step below.

## Frontend UX

- A "Suggest invites by family depth" button in the event form's existing invite panel (Phase 1), alongside the existing user-search and email-add controls.
- Opens an inline control: person-search for the root (defaults to the organizer's own linked person), and a depth number input (range 1-5, default 2 — capped in the UI for sane/predictable results, not a performance necessity at this scale).
- **Preview** runs the algorithm and renders the grouped results:
  - **Invitable individuals** (have a linked account): a normal row, checkbox to include, ready to add as a `user`-type invite.
  - **Fully accountless nuclear family units**: one aggregated row (e.g. "The Smith family — 4 members, no accounts yet") instead of one informational row per person, to avoid clutter on branches of the tree where nobody's claimed an account. The family label uses the unit's surname — the couple/parent's `birth_surname` (falling back to `family_name`), the same grouping convention already established for tree-line grouping elsewhere in this codebase (`tools/backfill_tree`). Includes an optional email input — if filled, creates a single `email`-type invite for the household (`guest_name` = that label, e.g. "The Smith Family"), matching how people actually send one invite to a household in practice. If left blank, the row is informational only and adds nothing.
  - **Mixed units** (some members have accounts, some don't): the account-holding member(s) show as normal invitable rows; the accountless co-members are listed as a short note attached to that row (no separate email input there — the organizer can still reach them individually via the existing manual "+ Email" add flow if they want to).
  - **Standalone accountless individuals** (no partner/children in the result set): same optional-email-to-convert-to-a-guest-invite treatment as an aggregated unit, just for one person.
- Confirming adds every checked/emailed entry to `_eventFormPendingInvites`. Already-present entries (manually added earlier, or reached via more than one ancestor path) are deduped, never added twice.

## Edge cases & scope boundaries

- Depth capped at 1-5 in the UI.
- Organizer's own linked person never appears in suggestions.
- A person already in the pending-invites list is never added twice, regardless of how the walk reached them.
- A root person with no linked accounts anywhere in range isn't an error — the preview simply shows only aggregated/informational rows, and the organizer can still act via email or skip entirely.
- Mixed-unit accountless co-members get a note, not their own email input, to keep the preview UI's scope bounded — full per-person email assignment for every accountless relative is what the existing manual add flow is for.

## Testing

- `node --test helpers.test.js`: the walk algorithm (ancestor/descendant/spouse traversal, dedup, nuclear-family-unit grouping) against a fixture person/couple dataset covering — at minimum — a straightforward 2-generation family, an intermarriage case (two ancestor paths converging on the same descendant), a person with no linked account, and a mixed-accountability nuclear family unit.
- Real-browser pass (Camoufox) for the actual UI flow (root search, depth input, preview rendering, checkbox/email selection, confirming into the pending-invites list) — flag explicitly if the remote browser's auth token isn't available in whatever session implements this, per this backlog's established precedent.
