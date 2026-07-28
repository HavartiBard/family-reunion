# Events v2 Phase 3: Location Poll

## Context

Events v2 Phase 1 (invites/audience targeting, #88-96) and Phase 2 (date availability poll, #112-115) are both merged. This is Phase 3: letting an organizer open a location up for suggestion-and-vote, mirroring the date poll's shape (open → suggest/discuss/vote → organizer finalizes → closes) rather than inventing a different interaction pattern.

Brainstormed and confirmed with James 2026-07-28:
- **No link-preview scraping in v1.** Suggesters fill in name/address/notes/URL themselves. VRBO/Airbnb often block scraping and Google Maps has no useful OpenGraph tags, so a scraping feature would frequently just not work — not worth building until there's real usage data suggesting it's worth the reliability risk. Since there's no scraping to key off of, the `source_type` field from the original tracking-issue sketch is dropped — nothing in v1 behaves differently based on where a suggestion's URL points.
- **Simple upvote toggle, one per user per suggestion**, no downvote. Click to upvote, click again to remove your vote. If you don't like a suggestion, don't vote for it (or say why in a comment) — matches the low-ceremony pattern already used elsewhere in this codebase (e.g. `event_invites`).
- **Organizer finalize, mirroring the date poll exactly**: an explicit "Open a location poll" toggle in the event form (parallel to "Open a date poll"), a `location_poll_status` field (`none`/`open`/`closed`) that gates whether the suggestions/voting UI renders at all, and an organizer-only finalize action that picks one suggestion, copies its address into `events.location`, and closes the poll (suggestions UI disappears afterward, same as the date poll's grid disappearing on finalize).

## Data model

**`events` collection** (extend via migration): `location_poll_status` — select, values `["none", "open", "closed"]`, default `"none"`. No placeholder-value concern here (unlike the date poll's `start_date`) since `events.location` is not a required field — it can simply stay whatever it was (blank or previously set) until finalized.

**New collection `event_location_suggestions`**:
- `event` — relation → `events`, required, maxSelect 1, cascadeDelete true
- `suggested_by` — relation → `users`, required, maxSelect 1, cascadeDelete true
- `name` — text, required (e.g. "Grandma's backyard", "Riverside Cabin #4")
- `address` — text, not required
- `url` — text, not required (any link — Maps, VRBO, Airbnb, a website, whatever; just a plain link, no categorization since nothing treats different URL sources differently without scraping)
- `notes` — text, not required
- `capacity` — number, not required

Rules: `listRule`/`viewRule` = `APPROVED` (narrowed by hook, same established pattern as every other event-scoped collection). `createRule` = `@request.auth.id != "" && @request.auth.approved = true` (any approved user who can see the event can suggest — precise event-visibility scoping happens in the hook's before-create callback, mirroring `event_invites`' pattern of broad rule + hook-enforced precision). `updateRule`/`deleteRule` = `@request.auth.id != "" && suggested_by = @request.auth.id` (only the suggester can edit/remove their own suggestion — family_admin bypass handled by the hook, not the rule, matching established convention).

**New collection `event_location_votes`**:
- `suggestion` — relation → `event_location_suggestions`, required, maxSelect 1, cascadeDelete true
- `user` — relation → `users`, required, maxSelect 1, cascadeDelete true

One row = one upvote. Toggle-off is a delete, not a status flip (simpler than `event_availability`'s array-of-slots model — a vote is binary per suggestion, no need for a mutable field). Rules: `listRule`/`viewRule` = `APPROVED` (hook-narrowed); `createRule`/`deleteRule` = `@request.auth.id != "" && user = @request.auth.id` (self-only, same shape as `event_rsvps`); no `updateRule` needed (a vote has no mutable state — you delete and re-create rather than "edit" a vote, so PocketBase's default deny-by-omission for update is correct, not an oversight). A unique index on `(suggestion, user)` prevents double-voting at the database level, not just the UI.

## Backend hooks

**New `backend/pb_hooks/event_location_suggestions_tree_visibility.pb.js`**: list/view scoped via the `event` relation (same derive-via-relation pattern as `event_availability_tree_visibility.pb.js`/`event_rsvps_tree_visibility.pb.js`/`event_invites_tree_visibility.pb.js` — mirror the *current* `events_tree_visibility.pb.js` audience logic, not the older single-`tree` pattern some earlier hooks still have). Before-create: validate the requester can actually see the parent event (same audience check, reused inline per the self-containment constraint) before allowing a suggestion to be created against it — this is the "precise" half of the broad-rule-plus-hook pattern mentioned above.

**New `backend/pb_hooks/event_location_votes_tree_visibility.pb.js`**: list/view derived via a *two-hop* relation lookup (`vote.suggestion` → `suggestion.event` → apply the same event-audience check) — the one genuinely new wrinkle relative to prior phases' hooks, since every previous derive-via-relation hook was only one hop (`record.event`) rather than two. No before-create authorization hook needed beyond the collection rule's self-only ownership (same reasoning as `event_rsvps`: a hidden suggestion's id being needed to vote on it is UX-only, not a security concern) — but the unique-index-enforced one-vote-per-user-per-suggestion constraint at the schema level is the actual integrity guarantee here, not a hook.

**Extend the polymorphic `comments` collection**: add a new value to `comments.related_type`'s enum for location suggestions (mirrors the existing `photo`/`album` pattern). Update `comments_tree_visibility.pb.js`'s inline related_type→collection-name mapping to handle this new value in every callback (per the self-containment constraint, this mapping is duplicated per-callback already for `photo`/`album` — add the new case the same way in each place, do not factor it out). A comment on a location suggestion resolves visibility via suggestion → event, one hop further than the existing photo/album cases.

**No hook needed for finalization** — same reasoning as the date poll: the organizer finalizing is just a normal `PATCH /api/collections/events/records/{id}` setting `location` (from the chosen suggestion's `address` or `name`) and `location_poll_status: "closed"`, already covered by existing `events` update authorization.

## Frontend (`app.js`)

**Event form**: add an "Open a location poll" checkbox toggle (parallel to the existing "Open a date poll" toggle, independent of it — an event can have a date poll, a location poll, both, or neither). When checked on save, send `location_poll_status: "open"`.

**Event detail page**: a new "Suggested locations" card, shown while `event.location_poll_status === "open"`, listing all suggestions for the event (each showing name/address/url-as-link/notes/capacity, an upvote button with current count, and a comment thread reusing the existing polymorphic comment UI already used for photos/albums elsewhere in this codebase). A "Suggest a location" form (name/address/url/notes/capacity fields) lets any approved user with visibility into the event add a new suggestion. Organizer/admin gets a "Finalize" action per suggestion (mirroring the date poll's per-cell "Pick" button) that confirms, then PATCHes the event's `location` and closes the poll — suggestions UI disappears afterward, same as the date poll's grid.

## Verification

- Scratch-PocketBase testing (mandatory per this repo's convention for any migration/hook change) for both new collections' migrations and both new hooks: confirm visibility scoping matches the event's own audience (tree/extra_trees/invite_only), confirm the two-hop vote-visibility derivation specifically, confirm the unique index actually rejects a duplicate vote.
- Real-browser testing (via the existing Camoufox pipeline) for the frontend: submit two suggestions as two different users, upvote as a third user, confirm vote counts update correctly and reflect in the UI for everyone who can see the event; finalize as organizer, confirm `events.location`/`location_poll_status` update correctly via the API and the suggestions UI disappears on reload.
- `node --test helpers.test.js` if any new pure helpers are added.
