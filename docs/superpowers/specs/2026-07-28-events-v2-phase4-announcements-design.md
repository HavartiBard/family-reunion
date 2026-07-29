# Events v2 Phase 4: Announcements & Poll Notifications

## Context

Events v2 Phase 1 (invites/audience, #88-96), Phase 2 (date poll, #112-115), and Phase 3 (location poll, #122-125) are all merged. This is Phase 4 (tracking issue #99), originally scoped as "notifications, reminders & polish." Brainstormed with James 2026-07-28.

The original sketch (from #99) proposed an automated cron-based reminder system (day-before/week-before nudges) plus poll-opened/poll-closed notifications plus a small pre-existing bug fix. Mid-brainstorm, James reframed the reminder piece: a fixed system-generated "event is tomorrow" message is rigid and generic, and a coordinator-authored **Announcements** feature (ad-hoc or scheduled) is more useful in practice — the coordinator can say something that actually matters ("parking is now confirmed at X", "bring a chair") rather than a canned reminder. Automated reminders are dropped entirely in favor of this. Poll-opened/poll-closed notifications and the unrelated bug fix from the original sketch are unaffected and remain in scope.

## Data model

**New collection `event_announcements`**:
- `event` — relation → `events`, required, `maxSelect: 1`, `cascadeDelete: true`
- `created_by` — relation → `users`, required, `maxSelect: 1`, `cascadeDelete: true`
- `title` — text, required
- `body` — text, required
- `send_at` — date, required (the compose UI defaults this to "now" for an ad-hoc send, or lets the organizer pick a future date/time to schedule)
- `sent` — bool, default `false`

Rules: `createRule`/`deleteRule` = `@request.auth.id != "" && @request.auth.approved = true` (broad rule, precisely scoped to organizers/`family_admin` in a hook — same broad-rule-plus-hook pattern used throughout this codebase, e.g. `event_invites`). No `updateRule` — editing a pending announcement is delete-and-recreate, not a mutation, matching the precedent set by `event_location_votes` in Phase 3 (a record with no mutable state doesn't need one). `listRule`/`viewRule` = `APPROVED`, narrowed by hook: organizers/`family_admin` see every announcement for events they organize (including pending/unsent, so they can review or cancel); everyone else only ever sees `sent = true` rows, so a scheduled-but-not-yet-fired announcement isn't visible early to its eventual recipients.

**`notifications.type`** (existing select field, currently `new_member`/`birthday`/`news`/`photo`/`rsvp`/`admin`) gains two new values:
- `event_announcement` — a coordinator's announcement was sent
- `event_poll` — a date or location poll opened, or was finalized/closed (one type covers both events; the `body` text differentiates which happened, e.g. "A date poll opened for {event}" vs. "{event}'s date has been finalized: {date}")

## Backend hooks

**Audience for both `event_announcement` and `event_poll` notifications is the same**: the union of (a) every `user` on an `event_rsvps` row with `status` in `going`/`maybe`, and (b) every `user` on a `user`-type `event_invites` row for that event. No additional visibility check is needed when computing this audience — being in either set already implies access to the event, since both `event_rsvps` and `event_invites` rows are themselves scoped to people with legitimate access.

**New `backend/pb_hooks/event_announcements_tree_visibility.pb.js`**:
- `onRecordsListRequest`/`onRecordViewRequest`: visible to `family_admin`, to an organizer of the announcement's `event`, or (for anyone else) only if `sent = true`.
- `onRecordBeforeCreateRequest`: validates the requester is an organizer of the target event or `family_admin`; rejects otherwise.
- `onRecordBeforeDeleteRequest`: same organizer/`family_admin` check (this is how a pending scheduled announcement gets cancelled).
- `onRecordAfterCreateRequest`: if `send_at <= now`, fans out immediately (see below) and marks the record `sent = true` via a follow-up save. If `send_at` is in the future, does nothing — the cron job (below) picks it up later.

**Fan-out logic** (duplicated inline in both the immediate-send path above and the cron job below, per this codebase's hook self-containment constraint — PocketBase's JSVM re-evaluates each registered callback in isolation, so a shared top-level helper function referenced from two different callbacks throws `ReferenceError` at runtime): compute the going/maybe+invited audience for the event, and for each user create one `notifications` row (`type: 'event_announcement'`, `title`/`body` copied from the announcement, `related_id`/`related_type` pointing at the event). Wrapped in try/catch per-recipient — a failure sending to one person must not block the others or fail the triggering write, matching the existing invite-notification hook's convention (`event_invites_tree_visibility.pb.js`'s `onRecordAfterCreateRequest`, which never lets a notification failure crash the invite write).

**Cron job** (`cronAdd`, new to this codebase — every prior hook in this repo has been request-triggered, never scheduled. Must empirically verify the exact PocketBase 0.22.20 JSVM `cronAdd` syntax against a scratch container before relying on it; do not assume 0.23+ API shape, per this repo's own standing caution about this PocketBase version): registered once, runs every 15 minutes. Queries `event_announcements` where `sent = false && send_at <= now`, runs the same fan-out logic per matching row, marks each `sent = true` immediately after its own fan-out completes (single-instance deployment, synchronous within one job run, so back-to-back ticks can't double-send the same row).

**Extend `backend/pb_hooks/events_tree_visibility.pb.js`**: add an `onRecordBeforeUpdateRequest` check (or extend the existing one) that fetches the persisted record before the update lands, compares `date_poll_status` and `location_poll_status` against the incoming values, and — if either transitions into `'open'` or `'closed'` — runs the same audience computation and fans out an `event_poll`-typed notification with body text appropriate to what changed. This is additive to the existing before-update tree-authorization check already in that file, not a replacement.

Intentionally update-only, not also hooked into `onRecordBeforeCreateRequest`: a brand-new event has no `event_rsvps`/`event_invites` rows yet at the instant it's created (nobody can RSVP to or be invited to an event that doesn't exist yet), so the audience for a poll opened at creation time would always be empty — there's no one to notify. Poll-opened notifications only have a real audience once triggered by an edit to an event that already has some going/maybe RSVPs or invitees, which is exactly what the update hook covers.

**Fix the pre-existing delete-rule bug** (also `events_tree_visibility.pb.js`): `onRecordBeforeDeleteRequest` currently requires `admin_trees.includes(recordTreeId)` for every non-`family_admin` requester with no fallback for a tree-less event, unlike the list/view/create/update callbacks in the same file (which all correctly treat "no tree" as broadcast-with-an-organizer-check-only). This means a plain organizer (not a branch admin) can never delete their own tree-less event, even though the base PocketBase `deleteRule` (`organizers ~ self || family_admin`) would otherwise permit it. Align the delete callback's tree-less handling with the pattern already used by its sibling callbacks in the same file.

## Frontend (`app.js`)

**Compose form** (event detail page, organizer/`family_admin` only): title + body inputs, plus a "Send now" / "Schedule for later" toggle — unchecked posts with `send_at` set to now; checked reveals a datetime picker (defaulting to a sensible near-future value, e.g. tomorrow 9am) and posts with that value instead. Submitting POSTs an `event_announcements` row and re-renders.

**Announcements card** on the event detail page, visible to everyone with visibility into the event: lists sent announcements (title, body, sender name, sent time), newest first, styled consistently with the existing invite/suggestion cards on this page. Organizers/`family_admin` additionally see a "Pending" section above the sent list, showing not-yet-fired scheduled announcements with a cancel (delete) button per row.

**Notifications UI**: no new component — `event_announcement` and `event_poll` notifications flow through the existing notifications feed/bell like every other type. Add icon/label handling for these two new `type` values wherever the notifications UI currently branches on `type` (the same place `rsvp`/`admin`/etc. are already handled), so they render with an appropriate label instead of falling through as generic/unlabeled.

## Verification

- Disposable scratch PocketBase container (mandatory per this repo's convention) for: the new collection's schema/rules, the fan-out logic on the immediate-send path, the poll-opened/poll-closed detection hook, and the delete-rule fix (confirm a plain organizer can now delete their own tree-less event).
- Specifically and separately: verify `cronAdd`'s exact 0.22.20 syntax works at all in isolation (a trivial scheduled job that writes something detectable) before wiring the real reminder-fan-out logic into it — this is new, unverified territory for this codebase.
- `node --test helpers.test.js` if any new pure helper (e.g. the audience-computation logic, if factored out as a testable function rather than living only inline in hooks) is added.
- Real-browser pass (Camoufox) for the compose form, the pending/sent announcement cards, and the notifications feed rendering the two new types — flag explicitly if the remote browser's auth token isn't available in whatever session implements this, per the precedent set in Phase 3.
