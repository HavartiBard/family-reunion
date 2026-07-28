# Events v2 Phase 2: Date Availability Poll

## Context

Events v2 Phase 1 (issues #88-96, all merged) added invites, tree/branch audience targeting, and a public guest-RSVP page. This is Phase 2 of that same effort: letting an organizer open a date up for group scheduling instead of picking one unilaterally, modeled on When2meet's overlap-grid approach — invitees paint the specific days/times they're free, and the organizer picks a final date informed by a heatmap of maximum overlap, rather than guessing at candidate dates up front.

Brainstormed and confirmed 2026-07-28:
- Poll range is a continuous date range + daily time window + slot size (not a short pre-picked list of candidate days) — matches When2meet's actual model and directly serves "look for best dates based on maximum availability."
- Scoped to site users only for this phase — email-invited guests (the #95 guest RSVP page) do not get an availability-painting UI; they see the finalized date once the poll closes, same as they do today.
- Finalization is organizer-driven: the organizer reviews a heatmap and manually picks a slot (not necessarily the single highest-overlap one — other constraints like venue availability may matter), rather than the system auto-selecting the top slot.

## Data model

**`events` collection** (extend via migration):
- `date_poll_status` — select, values `["none", "open", "closed"]`, default `"none"` (backward compatible — existing/ordinary events are unaffected).
- `date_poll_range_start` — text (ISO date, e.g. `"2026-08-01"`)
- `date_poll_range_end` — text (ISO date)
- `date_poll_day_start_hour` — number, 0-24 (start of the daily availability window, e.g. `9` for 9am)
- `date_poll_day_end_hour` — number, 0-24 (end of the daily availability window, e.g. `21` for 9pm)
- `date_poll_slot_minutes` — number (slot granularity, e.g. `30` or `60`)

`events.start_date` is already `required: true` and used throughout the app (list sorting, home-dashboard "next event" card, etc.) — while a poll is `open`, `start_date` is set to `date_poll_range_start` as a placeholder so nothing else in the codebase breaks; it's overwritten with the real chosen date on finalize.

**New collection `event_availability`**:
- `event` — relation → `events`, required, maxSelect 1, cascadeDelete true
- `user` — relation → `users`, required, maxSelect 1, cascadeDelete true (site users only, per the scoping decision above — no `guest_name`/`email` fields, unlike `event_invites`)
- `slots` — json, array of ISO datetime strings, each the start of one slot this user marked available (e.g. `["2026-08-08T14:00:00Z", "2026-08-08T14:30:00Z"]`)

Rules: `listRule`/`viewRule` = `APPROVED` (narrowed by hook, see below); `createRule`/`updateRule`/`deleteRule` = `@request.auth.id != "" && user = @request.auth.id` (self-only, mirrors `event_rsvps`' existing pattern exactly — one row per user per event, upsert via PATCH-if-exists-else-POST on the frontend, same as `setEventRsvp`).

## Backend hooks

**New `backend/pb_hooks/event_availability_tree_visibility.pb.js`**: list/view only, deriving the event's visibility via the `event` relation lookup — same pattern as `event_rsvps_tree_visibility.pb.js` and `event_invites_tree_visibility.pb.js` (family_admin bypass first, then the event's own tree/`extra_trees`/`invite_only`/individual-invite audience check). No write-path hook needed: the collection rule's self-only ownership already fully owns write authorization, and (per the same reasoning already documented for `event_rsvps`) a hidden event's id being required to submit availability is a UX-only concern, not a security one.

**No new hook for finalization.** The organizer finalizing a poll is just a normal `PATCH /api/collections/events/records/{id}` setting `start_date`/`end_date`/`date_poll_status: "closed"` — already covered by the existing `events` update rule (organizer/family_admin) and `events_tree_visibility.pb.js`'s existing write-scoping hook. No changes needed there.

## Frontend (`app.js`)

**Event create/edit form** (`openEventForm`/`saveEvent`): add an "Open a date poll" alternative to setting the date directly — a toggle that, when on, replaces the start/end date inputs with range-start, range-end, daily-window-start/end, and slot-size inputs. On save with the poll enabled: `date_poll_status: "open"`, the four poll config fields, and `start_date` set to `date_poll_range_start` as the required-field placeholder.

**New "Availability" section on the event detail page** (`renderEventDetail`), shown only while `event.date_poll_status === "open"`:
- A grid: columns = each day in `[date_poll_range_start, date_poll_range_end]`, rows = each slot in `[date_poll_day_start_hour, date_poll_day_end_hour)` at `date_poll_slot_minutes` increments. Each cell click-toggles (v1 scope: click-per-cell, not drag-select — keeps the interaction and its testing surface simple; drag-select is a nice-to-have, not required) whether the current user is marking that slot available, then upserts their `event_availability` row (fetch-existing-then-PATCH-or-POST, same shape as `setEventRsvp`).
- An aggregate heatmap over the same grid, visible to anyone who can see the event: each cell shaded by how many `event_availability` rows include that slot (fetch all rows for the event, tally client-side — dataset size here is bounded by tree membership, no pagination concerns expected).
- Organizer/admin-only: a "Finalize" affordance — click any cell (not restricted to the top-overlap ones) and confirm, which PATCHes the event with the chosen slot's start (and an end computed by adding a reasonable default duration, or leaving `end_date` blank/unset — organizer can still edit it normally afterward via the existing edit form) and `date_poll_status: "closed"`.

Once `date_poll_status` is `"closed"` (or `"none"`), the event behaves exactly as it does today — the Availability section doesn't render at all.

## Error handling

- Finalizing with zero `event_availability` submissions is allowed — real-world scheduling sometimes requires picking a date despite incomplete responses; the UI doesn't block this.
- A user visiting a `closed` poll's event just sees the normal date, no different from any other event today.

## Verification

- Scratch-PocketBase testing (per this repo's mandatory pre-merge verification for any migration/hook change) for the new migration and `event_availability_tree_visibility.pb.js`: confirm self-only write ownership, confirm visibility scoping matches the event's own audience (tree/extra_trees/invite_only/individual invite), confirm family_admin bypass.
- Real-browser testing (via the Camoufox pipeline already set up for Phase 1) for the frontend: open a poll, submit availability as two different users, confirm the heatmap reflects both, finalize as organizer, confirm the event's `start_date`/`end_date`/`date_poll_status` update correctly and the Availability section disappears afterward.
- `node --test helpers.test.js` if any new pure helpers are added (e.g. slot-grid generation, if factored out as a testable pure function rather than inlined in the render function).
