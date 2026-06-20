# Events System Design

**Goal:** Replace the hardcoded Reunion screen with a generic per-event system supporting reunions, birthdays, weddings, holidays, and more.

**Architecture:** Two new PocketBase collections (`events`, `event_rsvps`) replace the `rsvp` field on `users` and the hardcoded `REUNION_DATE` / `REUNION_SCHEDULE` constants. The Reunion nav item becomes Events. Home hero shows the next upcoming event dynamically.

**Tech Stack:** PocketBase migrations, raw JS/CSS, existing `apiFetch` + `SCREENS` patterns.

---

## Global Constraints

- No build step — raw HTML/CSS/JS only
- All user-supplied strings pass through `esc()`
- `apiFetch` always sends `Authorization: token`
- PocketBase access rule base: `@request.auth.id != "" && @request.auth.approved = true`
- Design tokens from `:root` — no hardcoded colors
- Fonts: Newsreader (display) + Schibsted Grotesk (UI)
- Family name: "Kelsall" (not prototype names)

---

## Data Model

### `events` collection
| Field | Type | Notes |
|---|---|---|
| `name` | text, required | Event title |
| `type` | select | reunion / birthday / wedding / holiday / other |
| `description` | text | |
| `start_date` | text | ISO 8601 date-time string |
| `end_date` | text | ISO 8601 date-time string, optional |
| `location` | text | |
| `cover_photo` | file | max 5MB, image/* |
| `organizers` | relation →users, multi | Users who can edit/delete |
| `created_by` | relation →users | |

**Access rules:**
- `listRule` / `viewRule`: `@request.auth.id != "" && @request.auth.approved = true`
- `createRule`: same (any approved member)
- `updateRule`: `approved && (organizers ~ @request.auth.id || @request.auth.family_admin = true)`
- `deleteRule`: same as update

### `event_rsvps` collection
| Field | Type | Notes |
|---|---|---|
| `event` | relation →events, cascade delete | |
| `user` | relation →users, cascade delete | |
| `status` | select | going / maybe / no |

**Access rules:**
- `listRule` / `viewRule`: `@request.auth.id != "" && @request.auth.approved = true`
- `createRule` / `updateRule` / `deleteRule`: `@request.auth.id != "" && user = @request.auth.id`

### Removed
- `users.rsvp` field (superseded by `event_rsvps`) — migration adds a down step to remove it
- `REUNION_DATE` and `REUNION_SCHEDULE` constants in `app.js`

---

## Screens

### Events list (`SCREENS.events`)
- Header: "Events" + "Create event" button (any approved member)
- Upcoming events (start_date ≥ today) sorted ascending, shown as cards
- Past events collapsed under a "Past events" toggle, sorted descending
- Each card: cover photo or type-icon placeholder, name, type pill, date, location, RSVP count badge
- Click card → navigate to event detail (`?tab=events&event=<id>`)

### Event detail (`params.event` set)
- Back button → events list
- Cover photo hero (or placeholder with type icon)
- Name (Newsreader 32px), type pill, organizer name(s)
- Date/time + location bar (card)
- Description
- RSVP row: Going / Maybe / Can't make it buttons (saves to `event_rsvps`)
- Attendee count: "N going · M maybe"
- Edit button (organizers + site admins only) → create/edit modal

### Create/edit modal
- Fields: name, type (select), start date/time, end date/time (optional), location, description, cover photo
- Organizers field pre-populated with creator; admins can add more
- Save → POST to `events`; edit → PATCH

### Home hero update
- Replace hardcoded countdown with: fetch next upcoming event (start_date ≥ today, sort asc, perPage=1); show name + date + "RSVP" button → navigate to that event detail. If no upcoming event: show generic "Welcome to the Kelsall Family" message.

---

## Navigation

- `NAV` item: `{ tab:'events', label:'Events', ico:'◆' }` (replaces `reunion`)
- `MOBILE_NAV`: no change (profile slot stays)

---

## Migrations

1. `1718500007_add_events.js` — creates `events` and `event_rsvps` collections
2. `1718500008_remove_user_rsvp.js` — removes `rsvp` field from `users`
