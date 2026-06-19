# Kelsall Family App Redesign

**Date:** 2026-06-19
**Source:** `family.zip` — Claude Design handoff (`Bender Family` prototype, adapted for Kelsall Family)

---

## Goal

Replace the current orange-accented, top-nav SPA with a dark-sidebar design matching the Claude Design handoff. Fully implement all 12 screens including three new ones (Gallery, Notifications, Search). Keep the no-build-step, vanilla JS/CSS architecture and GitHub Pages deploy unchanged.

---

## File Structure

```
index.html                                  ← shell only (head, fonts, <div id="app">)
app.css                                     ← all styles, CSS custom properties
app.js                                      ← all screen render*() functions + routing
merge.js                                    ← unchanged
backend/pb_migrations/
  1718500004_add_gallery.js                ← albums + photos collections
  1718500005_add_notifications.js          ← notifications collection
```

`index.html` goes from 1390 lines → ~30 lines (shell). All existing inline `<style>` and `<script>` content moves to `app.css` / `app.js`, rewritten to match the new design.

---

## Design Tokens

### Colors (CSS custom properties on `:root`)

```css
--bg-app:           #f4f1ea;
--bg-card:          #ffffff;
--bg-sidebar:       #1f2d27;
--bg-subtle:        #faf8f3;
--accent-gold:      #c8952a;
--accent-gold-hover:#a87a22;
--accent-green:     #2d4a38;
--text-primary:     #20231f;
--text-secondary:   #8c857a;
--text-muted:       #a99f8c;
--text-sidebar:     rgba(244,241,234,0.62);
--text-sidebar-active: #f4f1ea;
--border-default:   #ece6da;
--border-input:     #e2ddd3;
--border-focus:     #c8952a;
--focus-shadow:     rgba(200,149,42,0.12);
--danger:           #c04040;
--danger-bg:        #fdf2f2;
--danger-border:    #f5d5d5;
```

Avatar tint palette (6 tints, rotate by `index % 6`): warm `#e7d9bd`, green `#d8e0d2`, peach `#e8dcd2`, slate `#dfe2e6`, sand `#ece0cf`, sage `#dde4dd`.

### Typography

Google Fonts import (in `index.html` `<head>`):
```
Newsreader: ital,opsz,wght — display/headings (page titles, card titles, person names)
Schibsted Grotesk: wght 400–700 — UI/body (nav, labels, buttons, body copy)
```

### Radii / Shadows

| Element | Radius |
|---|---|
| Page cards / hero | 16–18px |
| Buttons | 10px |
| Inputs | 10px |
| Avatars | 50% |
| Sidebar logo chip | 11px |
| Badges / pills | 999px |
| Album thumbnails | 14px |

Card shadow: `0 1px 6px rgba(31,45,39,0.05)`  
Hover card shadow: `0 4px 18px rgba(31,45,39,0.12)`  
Detail drawer shadow: `-10px 0 40px rgba(31,45,39,0.18)`

---

## Layout

### App Shell (authenticated)

```
┌──────────────────────────────────────────────┐
│  sidebar (248px fixed) │  main (flex-1)       │
│                        │  overflow-y: auto     │
│  logo chip             │  screen content       │
│  nav items             │                       │
│  user footer           │                       │
└──────────────────────────────────────────────┘
```

**Sidebar:**
- Background: `#1f2d27` + diagonal texture overlay (pseudo-element, `repeating-linear-gradient(135deg, rgba(200,149,42,0.09) 0 1px, transparent 1px 22px)`, `opacity: 0.4`)
- Logo chip: 38×38 `border-radius: 11px`, `background: #c8952a`, Newsreader "K" in `#1f2d27`
- App name: "Kelsall" (Newsreader 19px `#f4f1ea`) + "FAMILY PORTAL" (11px uppercase `rgba(244,241,234,0.45)`)
- Nav items: `padding: 11px 14px`, `border-radius: 10px`. Active: `background: rgba(200,149,42,0.18)`, text `#f4f1ea` weight 700. Inactive: `rgba(244,241,234,0.62)` weight 400.
- Badge chips (Notifications, Admin): 18×18px `background: #c8952a`, `color: #1f2d27`, 10px bold
- User footer: 34×34 avatar + name + branch + sign-out icon

**Nav items:**
| Screen | Label |
|---|---|
| home | Home |
| tree | Family Tree |
| reunion | Reunion |
| directory | Directory |
| gallery | Photo Gallery |
| notifications | Notifications (badge = unread count) |
| search | Search |
| settings | Settings |
| admin | Admin Panel (badge = pending count, admin users only) |

### Mobile (< 768px)

Sidebar hidden; bottom tab bar (56px tall, white bg) with 5 items: Home, Tree, Directory, Gallery, Profile. Active color `#c8952a`. Nav items not in the bottom bar accessible from a "More" overflow or profile screen.

---

## Screens

### 1. Auth — Sign In

Two-column (42% brand wall / 58% form). On mobile: stack vertically (brand wall collapses to a header strip).

**Brand wall:** `#1f2d27` + diagonal texture. Animated surname roller: fixed-height container `overflow: hidden`, words cycle with `transform: translateY` (CSS animation, 0.85s `cubic-bezier(0.7,0,0.2,1)`) through family branch surnames drawn from the `persons` collection family names (fallback hardcoded: `["Kelsall", "Warfel", "Flannigan", "Hubber"]`). Tagline: *"Every branch, one root."* Newsreader italic 21px gold.

**Form:** Max-width 380px centered. Google + Apple OAuth buttons (height 52px, border-radius 11px). "or with email" divider. Email + Password fields (height 52px). "Sign in" CTA (full-width, height 54px, `#1f2d27` bg, `#f4f1ea` text). "New to the family page? **Create your account**" link.

### 2. Auth — Sign Up

Same two-column shell. Form max-width 480px. 2-col grid: First/Last name; full-width Email; 2-col Phone/Branch; full-width Address. "Create account" CTA. Footer note about visibility.

### 3. Home / News Feed

Max-width 1180px, `padding: 36px 44px 60px`.

- **Reunion hero card:** full-width dark green card, diagonal texture, left=event details, right=countdown days (Newsreader 60px gold) + RSVP CTA button. Countdown computed from `reunion_date` (hardcoded or from a settings record).
- **Two-column body:** `grid-template-columns: 1fr 320px`
  - Left: "Announcements" section, news cards from `news` collection (image placeholder if no photo, tag chip, Newsreader title 23px, body 14.5px)
  - Right rail: Upcoming birthdays (from `persons` with upcoming `birth_date`) + "Family at a glance" stats (member count, branch count from API)

### 4. Family Tree

Full-viewport, no scroll. Existing pan/zoom/drag canvas logic preserved. Visual update only:
- Header bar: `backdrop-filter: blur(6px)`, Newsreader title
- Canvas bg: `#efe9dd` with radial dot grid (`radial-gradient(#ddd5c4 1.4px, transparent 1.4px)`, `26px 26px`)
- Person cards: 156px wide, `border-radius: 14px`, tinted avatar circles
- SVG connectors: marriage = gold `#c8952a`, parent→child = `#c4bba8`
- Detail drawer: 360px right panel, 84×84 avatar, Newsreader name 28px, facts grid, "View full profile" button

### 5. Reunion RSVP

Max-width 920px. Venue photo placeholder (240px). When/Where/Headcount details bar. Three equal RSVP buttons (Going / Maybe / Can't make it) — active: `#1f2d27` bg; one selected at a time, persisted to user record (`rsvp` field — add in migration or store in `pb_data` key-value). Schedule card: gold day labels + event rows.

Note: RSVP state persisted as a new `rsvp` field on the `users` collection (value: `going | maybe | no | ""`).

### 6. Directory

Max-width 1180px, `grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))`. Person cards: 46×46 avatar + name bold + role muted + location + "Message" / "Call" buttons.

### 7. Member Profile

Max-width 1100px, breadcrumb, `grid-template-columns: 1fr 280px`. Hero card: 76×76 avatar + double ring box-shadow, Newsreader name 32px, branch/generation/member-since pills. Left: About, Contact, Family connections. Right: Life events timeline + photos grid (from `photos` collection filtered by tagged person).

### 8. Photo Gallery (NEW)

Two views within one screen, toggled by state:

**Albums view:** Header "Albums" + count + "New album" button (admin only). `repeat(4, 1fr)` grid. Each card: 120px thumbnail (`<img>` from `cover_photo`), label, count, year. Click → open album.

**Open album view:** Back button + album title + year filter chips + "Upload photo" button. `repeat(4, 1fr)` photo grid with `grid-auto-rows: 120px`, some photos span 2 cols or rows (implemented with a `span` class on every 5th photo). Click photo → lightbox (simple full-screen overlay).

**PocketBase queries:**
- Albums list: `GET /api/collections/albums/records?sort=-created`
- Album photos: `GET /api/collections/photos/records?filter=(album='${id}')&expand=tagged_persons`
- Upload: `POST /api/collections/photos/records` (multipart)

### 9. Notifications (NEW)

Max-width 780px. Three sections: Today (unread, gold-tinted bg), This week, Earlier (60% opacity). "Mark all read" text button top-right.

**Row anatomy:** 42×42 tinted avatar + text (title + subtitle) + optional CTA button.

**Data:** `GET /api/collections/notifications/records?filter=(user='${authId}')&sort=-created`. "Mark all read" → `PATCH` all unread records (`read=true`). Unread count drives sidebar badge.

### 10. Search (NEW)

Max-width 900px. Full-width search bar (height 58px, border-radius 15px). Filter tabs: All / People / Posts. Active tab: `#1f2d27` bg.

**Behavior:**
- On empty query: recent searches (stored in `localStorage`, max 8) as pill chips + "Browse all people" 3-col person grid (full persons list)
- On query: real-time client-side filter against cached persons array + news array (both fetched once on mount). Filter matches `display_name`, `given_name`, `family_name`, `bio`, `birth_date` (year).
- Filter tab "People" → persons only; "Posts" → news only; "All" → both
- No-results state: centered empty state with Newsreader message

### 11. Settings

Inner two-column: 224px left tab nav + scrollable content. Tabs: Profile / Privacy / Notifications / Account. Sign out in danger red.

- **Profile:** Photo upload row + 2-col form grid (same fields as current profile screen)
- **Privacy:** Per-field segmented button (All family / My branch / Admins only) — persisted to `users` record as JSON field `privacy_settings`
- **Notifications prefs:** Toggle rows — persisted to `users` record as JSON field `notification_prefs`
- **Account:** Change email/password + Danger zone (delete account confirmation modal)

### 12. Admin Panel (family_admin only)

Max-width 1100px. Stats row (4 equal cards). Tab bar: Pending approvals (badge) / All members / Reports (placeholder).

- **Pending tab:** Table — Member / Requested / Branch / Connected by / Actions (Approve/Deny/Review). Approve → `PATCH users/{id} {approved: true}`, Deny → `DELETE users/{id}`. Optimistic row removal.
- **All members tab:** Search input + branch filter `<select>` + table (Member / Email / Branch / Joined). Client-side filter from full users list.

---

## New PocketBase Migrations

### `1718500004_add_gallery.js`

**`albums` collection:**
| Field | Type | Notes |
|---|---|---|
| name | text | required |
| description | text | optional |
| year | number | optional |
| cover_photo | file | single |

**`photos` collection:**
| Field | Type | Notes |
|---|---|---|
| album | relation → albums | required |
| image | file | required, single |
| caption | text | optional |
| taken_date | date | optional |
| tagged_persons | relation → persons | multiple, optional |

API rules:
- `albums`: list/view = any approved member. Create/update/delete = `family_admin` only.
- `photos`: list/view = any approved member. Create (upload) = any approved member. Update/delete = uploader or `family_admin`.

### `1718500005_add_notifications.js`

**`notifications` collection:**
| Field | Type | Notes |
|---|---|---|
| user | relation → users | required |
| type | select | `new_member`, `birthday`, `news`, `photo`, `rsvp`, `admin` |
| title | text | required |
| body | text | optional |
| read | bool | default false |
| related_id | text | optional — ID of related record |
| related_type | text | optional — collection name |

API rule: list/view = `@request.auth.id = user.id`. Update = `@request.auth.id = user.id` (for marking read). Create = admin only or server-side hooks.

### New fields on `users` — migration `1718500006_add_user_fields.js`

- `rsvp`: select — `going | maybe | no`, default empty
- `privacy_settings`: JSON text — default `{"phone":"family","address":"admins","directory":"family"}`
- `notification_prefs`: JSON text — default `{"birthdays":true,"new_members":true,"photos":true,"reunion":true}`

Note: Reunion date is a constant `REUNION_DATE = '2026-08-15'` in `app.js` for v1 (update each year).

---

## State & Routing

Routing stays URL hash-based (`?tab=home`, `?tab=tree`, etc.) consistent with current `?person=<id>` deep link. New params: `?tab=gallery&album=<id>`, `?tab=search&q=<query>`.

| State | Where |
|---|---|
| Auth token / user | PocketBase SDK (`pb.authStore`) |
| Current tab/screen | URL `?tab=` param |
| RSVP selection | `users` record `rsvp` field |
| Unread notification count | fetched on auth, refreshed on Notifications tab open |
| Tree zoom/pan/positions | local JS vars (existing behavior preserved) |
| Settings active tab | local JS var (not in URL) |
| Gallery open album | URL `?tab=gallery&album=<id>` |
| Search query + filter | URL `?tab=search&q=<query>&filter=<type>` |
| Recent searches | `localStorage['kelsall_recent_searches']` |

---

## Migration / Compatibility Notes

- `merge.js` is not touched — it has no DOM dependencies and its tests continue to pass
- All existing PocketBase collections and their API rules remain unchanged
- The `?person=<id>` deep link for tree focus is preserved in `app.js`
- OAuth flow (Google + Apple) URLs and sessionStorage keys unchanged — only the UI rendering changes

---

## Out of Scope

- Real-time notifications (WebSocket/SSE) — polling on tab focus is sufficient for v1
- Photo upload progress bar — standard form POST
- Branch management UI — branches derived from `family_name` field on persons
- Mobile "More" overflow menu — v2
