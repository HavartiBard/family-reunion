# Event Detail Page: Two-Column Layout

## Context

Live testing feedback on the event detail page (`renderEventDetail` in `app.js`), after the availability-poll grid fixes shipped in PR #176: "the overall event view has a lot of wasted canvas space, should we go 2/3 column layout? wider columns?" The page is currently a single column capped at `max-width:860px`, stacking every section (RSVP, availability-poll grid, location-poll suggestions, invited list, announcements feed, compose-announcement form) top to bottom regardless of how much horizontal room each actually needs.

Presented two options: a wider single column (my recommendation — most of the sidebar-candidate content doesn't independently justify a whole column, and the sections are inherently sequential) versus a 2-column layout. **James chose 2-column.**

## Decisions (brainstormed with James 2026-07-30)

**Page width increases from `max-width:860px` to ~1200px.** Without this, a 2-column split just produces two cramped ~400px strips — the whole point is using the reclaimed canvas space. Narrow/mobile viewports stack to one column, matching this app's existing responsive pattern elsewhere.

**The availability-poll grid and location-poll suggestions each break out to full width**, rather than living inside either column. Both have content that genuinely wants width: the availability grid's day/time table gets cramped in a half-width column on any date range wider than a couple of days, and each location suggestion card carries address/link/notes plus its own comment thread. Confining either to half-width would recreate the exact cramped-canvas complaint that started this work, just at a different scale.

**Remaining sections split into a 65/35 two-column block:**
- **Left (primary, ~65%):** RSVP card ("Will you be there?"), Invited list (organizer-only)
- **Right (sidebar, ~35%):** Announcements feed (sent + pending), Compose-announcement form (organizer-only)

Grouping logic is "engagement vs. communication" — left column is about who's coming (RSVP status, invited list), right column is about what's being communicated about the event (announcements). This was chosen over an alternative "everyone vs. organizer-only" grouping (which would have put RSVP+Announcements on the left and Invited-list+Compose on the right) because it groups by *topic* rather than by *permission level*, which matches how the sections already read as two natural clusters rather than an admin/non-admin split.

**Section order top to bottom:**
1. Breadcrumb, hero image, info bar (When/Where/Headcount), title block, description card — all full-width, unchanged from today.
2. Availability-poll grid (full-width, only when `date_poll_status === 'open'`).
3. Location-poll suggestions (full-width, only when `location_poll_status === 'open'`).
4. Two-column block: RSVP + Invited list (left) | Announcements + Compose (right).

This keeps the polls as the primary above-the-fold call-to-action when either is open, exactly matching today's flow (RSVP → poll content, immediately under the header) — the 2-column block was chosen to come *after* the polls rather than before, so opening the page doesn't change what the organizer/attendee sees first, just how the standing information beneath it is arranged.

## Non-goals

- No change to any section's internal markup, data-fetching, or behavior (RSVP buttons, availability drag-paint grid, location-vote/comment threads, invite status badges, announcement compose/cancel flow) — this is a pure layout/CSS reorganization of `renderEventDetail`'s existing pieces.
- No change to `showGuestRsvpPage` (the separate, unauthenticated guest RSVP view) — out of scope, not mentioned in the original feedback.
- No change to the events **list** view (`renderEventsList`) — only the detail page.
- No change to `renderEventEditPage` (the tabbed create/edit form) — separate screen, already redesigned in a prior pass.

## Implementation notes

- `renderEventDetail`'s template literal (`app.js` ~3883-4160) is restructured: the full-width header block stays as-is at the top; the availability-grid IIFE and location-poll IIFE (currently emitting their own `.card` divs inline in sequence) move to render as standalone full-width rows; the RSVP card, invited-list IIFE, announcements card, and compose-announcement IIFE get wrapped in a new two-column grid container (e.g. `.event-detail-columns` with `.edc-primary`/`.edc-sidebar` children, CSS grid `grid-template-columns: 65fr 35fr` collapsing to a single column under a mobile breakpoint — follow whatever breakpoint convention `app.css` already uses elsewhere).
- Page wrapper's `style="max-width:860px"` (currently inline on the `mountMain(...)` call, two occurrences — `renderEventDetail` and the structurally similar `showGuestRsvpPage`, though only the former is in scope) changes to the new ~1200px value for `renderEventDetail` only.
- No new IDs/functions needed — this is a reorganization of existing output, not new interactive behavior. The existing `evf-*`-style ID audit doesn't apply here (this function doesn't use `el()`-by-id lookups the way the edit-form does), but the drag-paint availability grid's cell selectors (`_availabilityCellDown`, etc., keyed by `data-slot`) must keep working unchanged since the grid's own internal markup isn't touched, only its container's position on the page.

## Testing

- `node --check app.js` (no automated test coverage exists for screen rendering/layout in this codebase — verified manually, consistent with how `renderEventDetail`'s prior changes in this session were tested).
- Real-browser pass (Camoufox, per this project's established pattern) covering: an event with both polls closed (baseline 2-column block only), an event with the availability poll open (grid renders full-width above the columns), an event with the location poll open, and a narrow/mobile viewport to confirm the column collapse.
