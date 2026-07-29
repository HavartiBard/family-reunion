# Event Edit Page Redesign: Modal → Tabbed Full Page

## Context

Events v2 (Phases 1-5, plus two follow-up authorization fixes) shipped and deployed 2026-07-29. Live testing immediately surfaced UX feedback on `openEventForm` — the single modal that handles event create/edit, audience/tree targeting, invites (including the Phase 5 depth-suggester), and date/location poll settings all in one narrow panel:

1. The modal is too narrow for how much it now has to hold.
2. The Tree/audience section is confusing — unclear that it controls visibility scope (who can see the event without a direct invite), separate from the Invite-only toggle and the explicit invite list.
3. The accountless-unit email input's placeholder is confusing: it reads `Email for <surname>`, but `<surname>` comes from `groupIntoFamilyUnits`'s grouping key (`birth_surname`, falling back to `family_name` — the stable family line, not necessarily the person's current/married name). For a single accountless individual this can show a surname that doesn't match their displayed name at all (e.g. "Jen Lynn Kelsall" showing "Email for Barrett" if Barrett is her birth surname). **This is a plain bug, not a design question — fixed independently of this redesign** (see Implementation note below).

James's real ask, once the above was on the table: replace the modal with a dedicated event config page with tabs, not just a wider modal.

## Decisions (brainstormed with James 2026-07-29)

**Full page, not a modal.** Extends the existing `SCREENS.events` dispatcher (`app.js:3678`) — which already branches on `params.event` to show the events list vs. `renderEventDetail` — with a new `params.edit` branch, rather than introducing a whole new top-level screen. Consistent with this app's existing single-dispatcher-per-tab pattern.

**Routing: query params, matching this app's existing convention.** `?tab=events&event=<id>&edit=1` for editing an existing event, `?tab=events&event=new&edit=1` for creating one. This is a GitHub Pages static site with no build step and no server-side routing — a URI-slug scheme (`/events/123/edit`) would need a `404.html`-redirect hack to route arbitrary paths back to `index.html` for zero real benefit here (not a public/SEO-facing site). The tree view already deep-links via `?person=<id>` (`treeFocusId`); this follows the same shape.

**Three tabs:**
- **Details** — name/type/dates/location/description/cover photo. Carries the page-level Save button.
- **Audience & Invites** — tree/extra_trees/invite_only picker (with new clarifying copy, below), the invite panel (manual user search, email add, Phase 5 depth-suggester), and the pending-invites list.
- **Polls** — the existing date-poll and location-poll toggle/settings blocks, currently crammed into the same single-column form as everything else.

**Create flow: same page for create and edit, no separate code path.** All 3 tabs are visible immediately when creating a new event. Audience & Invites and Polls tabs are visible but their interactive controls are disabled, with a banner ("Save event details first") explaining why — since invites/poll settings need a real event ID to attach POSTs to (matches the current `openEventForm`/`saveEvent` behavior of creating the event record before any invite POSTs). Once Details is saved, the page navigates to `?tab=events&event=<newId>&edit=1` and all tabs unlock. This avoids maintaining a distinct "create mode" layout — the disabled-state banner is the only conditional, everything else renders identically either way.

**Tree/audience section gets explanatory copy**, directly addressing point 2's confusion, in place of (not in addition to) a UI restructure: *"Anyone in these trees (or linked to them by marriage) can see this event, even without a direct invite. Use Invite-only to restrict visibility to just the people you invite below."* Placed directly under the Audience tab's tree-picker heading.

## Non-goals

- No change to the underlying data model, hooks, or invite/poll semantics — this is purely a frontend presentation/layout change over the existing `events`/`event_invites`/`event_availability`/`event_location_suggestions` collections and their save flows.
- No change to the guest RSVP page (separate, unauthenticated, out of scope).
- No new validation logic beyond what `saveEvent` already does — same fields, same required-ness, just reorganized into tabs.
- The events **list** view (`SCREENS.events` with no `event` param) and the **detail** view (`renderEventDetail`, viewing an event you're not editing) are unchanged — this redesign only touches the create/edit path currently behind `openEventForm`.

## Implementation notes

- **Email-placeholder bug fix is independent of this redesign** and lands first, directly: in the accountless-unit branch of `_eventFormPreviewDepthInvites` (`app.js`, the `else` branch under `if (unit.hasAnyAccount)`), the placeholder must use the person's own `display_name` when `unit.personIds.length === 1` (matching what the checkbox label already correctly does), and only fall back to `unit.surnameLabel` for an actual multi-person family unit. This code moves into the new Audience & Invites tab as part of the redesign, but the fix itself doesn't depend on tabs existing.
- `openEventForm(eventId)` (the current modal opener, `app.js:4289`) is being fully replaced — its internals (field population, `saveEvent`, invite-panel logic including all of Phase 5's depth-suggest functions) get restructured into the new tabbed screen's render function, not kept as a parallel path. `openModal`/`closeModal` no longer apply to events at all once this ships.
- Existing `evf-*` element IDs and the `_eventForm*` state variables can mostly carry over unchanged (they're just moving from a modal's innerHTML into a full-page screen's innerHTML) — this keeps the diff smaller and avoids re-deriving all of Phase 5's already-hardened depth-suggest logic (10 rounds of Codex review across PR #157) from scratch.

## Testing

- `node --check app.js` (no automated test coverage exists for screen rendering/routing in this codebase — verified manually).
- Real-browser pass (Camoufox, per this project's established pattern) covering: create flow end-to-end (Details save → tabs unlock → add invites → add poll), edit flow (deep link via `?event=<id>&edit=1`, confirm all 3 tabs populate correctly), and the email-placeholder fix specifically (a single accountless person whose birth_surname differs from their current surname).
