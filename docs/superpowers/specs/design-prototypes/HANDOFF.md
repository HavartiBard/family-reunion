# Handoff: Bender Family Reunion Web App

## Overview
A private web portal for an extended family (the Benders and related branches) to stay connected across generations. Members can view news and announcements, explore an interactive family tree, RSVP to the annual reunion, browse a photo gallery, search the member directory, and manage their profile and settings. Admins can approve new member requests.

## About the Design Files
The `.dc.html` files in this bundle are **HTML design prototypes** — they show the intended look, layout, and interactive behavior of the app. They are **not** production code to copy directly. The task is to **recreate these designs in your existing codebase** (React, Next.js, Vue, etc.) using its established patterns, routing, and component libraries. Where a real backend is needed (auth, photo storage, member data), replace the mock data with real API calls.

---

## Fidelity
**High-fidelity.** These are pixel-perfect mocks with final colors, typography, spacing, interactions, and copy. Implement them as close to spec as possible using the design tokens below, then wire in real data.

---

## Design Tokens

### Colors
| Token | Value | Usage |
|---|---|---|
| `bg-app` | `#f4f1ea` | Page/app background |
| `bg-card` | `#ffffff` | Card backgrounds |
| `bg-sidebar` | `#1f2d27` | Left nav sidebar |
| `bg-subtle` | `#faf8f3` | Secondary panel bg (settings sidebar, table headers) |
| `accent-gold` | `#c8952a` | Primary accent — active states, badges, CTAs |
| `accent-gold-hover` | `#a87a22` | Hover on gold text links |
| `accent-green` | `#2d4a38` | Hover on dark green buttons |
| `text-primary` | `#20231f` | Body text |
| `text-secondary` | `#8c857a` | Subtitles, meta text |
| `text-muted` | `#a99f8c` | Labels, timestamps, placeholders |
| `text-sidebar` | `rgba(244,241,234,0.62)` | Inactive sidebar nav items |
| `text-sidebar-active`| `#f4f1ea` | Active sidebar nav items |
| `border-default` | `#ece6da` | Card borders |
| `border-input` | `#e2ddd3` | Form field borders |
| `border-focus` | `#c8952a` | Input focus ring color |
| `focus-shadow` | `rgba(200,149,42,0.12)` | Input focus box-shadow |
| `danger` | `#c04040` | Destructive actions, danger zone |
| `danger-bg` | `#fdf2f2` | Danger hover bg |
| `danger-border` | `#f5d5d5` | Danger section border |
| `tint-warm` | `#e7d9bd` | Avatar bg — warm |
| `tint-green` | `#d8e0d2` | Avatar bg — green |
| `tint-peach` | `#e8dcd2` | Avatar bg — peach |
| `tint-slate` | `#dfe2e6` | Avatar bg — slate |
| `tint-sand` | `#ece0cf` | Avatar bg — sand |
| `tint-sage` | `#dde4dd` | Avatar bg — sage |

Avatar tints rotate through the 6 tints above by `index % 6`.

### Typography
| Role | Family | Weights | Notes |
|---|---|---|---|
| Display / headings | `Newsreader` (Google Fonts) | 400, 500, 600; italic 400, 500 | Optical size 6–72. Use for page titles, card titles, hero text, person names. |
| UI / body | `Schibsted Grotesk` (Google Fonts) | 400, 500, 600, 700 | Everything else — nav, labels, body copy, buttons. |

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap
```

### Spacing & Radii
| Element | Border Radius |
|---|---|
| Page cards / hero | 16–18px |
| Buttons (primary) | 9–11px |
| Inputs | 10–11px |
| Avatars (circle) | 50% |
| Sidebar logo chip | 11px |
| Badges / pills | 999px |
| Album thumbnails | 14px |
| Notification rows | 16px |

### Shadows
- Cards: `0 1px 6px rgba(31,45,39,0.05)`
- Hover cards: `0 4px 18px rgba(31,45,39,0.12)`
- Detail drawer: `-10px 0 40px rgba(31,45,39,0.18)`

### Sidebar texture overlay
The dark sidebar uses a repeating diagonal rule pattern as a subtle texture:
```css
background: repeating-linear-gradient(
  135deg,
  rgba(200,149,42,0.09) 0 1px,
  transparent 1px 22px
);
opacity: 0.4;
```
Apply as an absolutely-positioned overlay inside the sidebar.

---

## Screens / Views

### 1. Auth — Sign In (`/login`)
**Layout:** Two-column, 42% brand wall left / 58% form right.

**Brand wall (left):**
- Background: `#1f2d27` with diagonal texture overlay (opacity 0.5)
- Animated surname roller: the word in the middle cycles through `["Bender", "Kelsall", "Warfel", "Flannigan", "Hubber"]` using a vertical translateY slide (CSS transform, 0.85s `cubic-bezier(0.7,0,0.2,1)`). Text color `#c8952a`, Newsreader 72px weight 500.
- Above/below: "The" / "Family" in `#f4f1ea`, same size
- Tagline: *"Every branch, one root."* — Newsreader italic 21px `#c8952a`
- Footer: branch list in small uppercase muted text

**Form (right):**
- Centered, `max-width: 380px`
- Social buttons: Google (light border) + Apple (dark fill), equal width, `height: 52px`, `border-radius: 11px`
- Divider: "or with email" between horizontal rules
- Email + Password fields: `height: 52px`, `border-radius: 11px`, bg `#faf8f3`
- Primary CTA: "Sign in" — full width, `height: 54px`, `background: #1f2d27`, `color: #f4f1ea`, `font-weight: 700`
- Footer: "New to the family page? **Create your account**" — underlined with 1.5px `#c8952a` border-bottom

---

### 2. Auth — Create Account / Details (`/signup`)
**Layout:** Same two-column shell as sign-in.

**Brand wall:** Simpler — headline "Join the Bender circle." + bulleted benefits + member count footer.

**Form:**
- `max-width: 480px`
- Grid: 2-column for First/Last name; full-width for Email; 2-column for Phone/Branch; full-width for Address
- Field height: `50px`, `border-radius: 11px`, bg `#faf8f3`
- CTA: "Create account" — same full-width dark green style
- Footer note: "Your details are visible only to verified family members." — centered, 12px muted

---

### 3. App Shell
**Layout:** Fixed sidebar (248px) + scrollable main content area.

**Sidebar:**
- Background: `#1f2d27` + diagonal texture overlay (opacity 0.4)
- Logo chip: 38×38px, `border-radius: 11px`, `background: #c8952a`, Newsreader "B" in `#1f2d27`
- App name: "Bender" (Newsreader 19px `#f4f1ea`) + "FAMILY PORTAL" (11px uppercase `rgba(244,241,234,0.45)`)
- Nav items: `padding: 11px 14px`, `border-radius: 10px`. Active: `background: rgba(200,149,42,0.18)`, text `#f4f1ea`, weight 700. Inactive: text `rgba(244,241,234,0.62)`, weight 400.
- Badge chips: `background: #c8952a`, `color: #1f2d27`, 18×18px, `border-radius: 9px`, 10px bold text
- User footer: 34×34px avatar (`background: #3a4a40`), name + branch, sign-out icon

**Navigation items (Hi-Fi Screens file):**
| Icon | Label | Badge |
|---|---|---|
| ◎ | Member Profile | — |
| ⬡ | Photo Gallery | — |
| ◉ | Notifications | 4 (unread count) |
| ⌕ | Search | — |
| ⚙ | Settings | — |
| ⚑ | Admin Panel | pending count |

**Navigation items (Main App file):**
| Icon | Label |
|---|---|
| ⌂ | Home |
| ⧉ | Family Tree |
| ◆ | Reunion |
| ☰ | Directory |

---

### 4. Home / News Feed (`/`)
**Layout:** `max-width: 1180px`, centered, `padding: 36px 44px 60px`

**Reunion hero card:**
- Full-width, `background: #1f2d27`, `border-radius: 18px`, `padding: 34px 38px`
- Diagonal texture overlay
- Left: section label "NEXT GATHERING" in gold uppercase, then event name (Newsreader 30px), then details in `rgba(244,241,234,0.7)` 14.5px
- Right: large countdown number (Newsreader 60px `#c8952a`) + "days to go" label
- CTA button: `background: #c8952a`, `color: #1f2d27`, `height: 48px`, `padding: 0 26px`, `border-radius: 11px`

**Two-column body:** `grid-template-columns: 1fr 320px`

**Announcements (left):**
- Section label: 13px uppercase tracking `.12em` muted
- Cards: white, `border-radius: 16px`, optional image placeholder (188px tall striped bg), then content area with tag chip + timestamp, Newsreader title 23px, meta 14px muted, body 14.5px color `#4f4b44`
- Tag chip: `background: #f1ebdd`, `color: #1f2d27`, 11px uppercase + 6px gold dot

**Right rail:**
- Upcoming birthdays card: avatar + name + date + "turns N" label
- Family at a glance card: large Newsreader numbers (392 members, 5 branches, 4 generations), "Open the family tree →" button (outline style)

---

### 5. Family Tree (`/tree`)
**Layout:** Full viewport, no scroll. Fixed header bar + infinite canvas below.

**Header bar:**
- `background: rgba(244,241,234,0.85)`, `backdrop-filter: blur(6px)`, 1px bottom border
- Title "Family Tree" (Newsreader 26px) + subtitle
- Zoom controls: `−` / `+` buttons with percentage display, "Fit to screen" button

**Canvas:**
- Background: `#efe9dd` with radial dot grid (`radial-gradient(#ddd5c4 1.4px, transparent 1.4px)`, `background-size: 26px 26px`)
- Pan with mouse drag; zoom with scroll wheel or buttons; `cursor: grab` / `grabbing`
- Canvas content positioned with `transform: translate(panX, panY) scale(scale)` on a single absolute div

**Person cards (nodes):**
- 156px wide, `padding: 11px 13px`, `border-radius: 14px`, `border: 2px solid #ece6da`, `background: #fff`, `box-shadow: 0 4px 14px rgba(31,45,39,0.10)`
- Selected: `background: #fffaf0`, `border-color: #c8952a`
- 36×36px avatar (tinted circle), first name bold 13.5px, birth year 11px muted
- Draggable per-node

**Connectors (SVG overlay):**
- Marriage lines: straight horizontal, `stroke: #c8952a`, `stroke-width: 2.5`
- Parent→child: elbow path (down → horizontal → down), `stroke: #c4bba8`, `stroke-width: 2`

**Detail drawer (on node click):**
- 360px right drawer, `z-index: 21`, white, `-10px 0 40px rgba(31,45,39,0.18)` shadow
- Overlay backdrop: `rgba(31,45,39,0.28)`
- 84×84px avatar, full name (Newsreader 28px), role 14px muted
- Facts list: Born, Branch, Generation, Lives in — two-column label/value rows with `border-bottom`
- "View full profile" outline button at bottom

**Family data structure:**
```js
// 4 generations, 16 people
// Gen 1: Walter & Margaret Bender
// Gen 2: Robert+Linda (Chicago), Susan+David Kelsall (Milwaukee), James+Patricia (Denver)
// Gen 3: Sarah, Tom (Robert/Linda); Emily, Jack Kelsall (Susan/David); Grace, Owen (James/Patricia)
// Gen 4: Mia (Sarah); Noah Kelsall (Emily)
```

---

### 6. Reunion RSVP (`/reunion`)
**Layout:** `max-width: 920px`, centered

**Hero:** Venue photo placeholder (240px tall striped bg) + details bar (When / Where / Headcount) in white below

**RSVP block:**
- Three equal buttons: "I'm going" / "Maybe" / "Can't make it"
- Active: `background: #1f2d27`, `color: #f4f1ea`, `border: 2px solid #1f2d27`
- Inactive: `background: #faf8f3`, `color: #20231f`, `border: 2px solid #e2ddd3`
- Height: `54px`, `border-radius: 12px`

**Schedule:** White card, rows of Day label (gold, bold) + Event title + Detail subtitle, 1px bottom borders

---

### 7. Directory (`/directory`)
**Layout:** `max-width: 1180px`, `grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))`

**Person card:** Avatar (46×46px) + name (15.5px bold) + role (12.5px muted) + location + "Message" / "Call" buttons side by side (equal width, outline style, `border-radius: 9px`)

---

### 8. Member Profile (`/members/:id`)
**Layout:** `max-width: 1100px`, breadcrumb nav, `grid-template-columns: 1fr 280px`

**Hero card:**
- White, `border-radius: 18px`, flex row
- 76×76px avatar with double ring: `box-shadow: 0 0 0 3px #fff, 0 0 0 5px rgba(200,149,42,0.25)`
- Name (Newsreader 32px), subtitle (parent relationship, birth year, city)
- Pill badges: "BENDER BRANCH", "3RD GENERATION", "MEMBER SINCE YYYY" — small uppercase, tinted backgrounds
- Action buttons: "Message" (dark green fill), "Call" (outline), "View in tree →" (outline)

**Left column:**
- About card: prose, `font-size: 14.5px`, `line-height: 1.7`, `color: #4f4b44`
- Contact card: rows of icon + label + value (email, phone, address), 1px bottom borders
- Family connections card: avatar + name + relationship, chevron `›` at right

**Right column:**
- Life events: vertical timeline with `position: absolute` left rule (`linear-gradient(to bottom, #c8952a, #ece6da)`), dot markers (12×12px circles), event title + year
- Photos grid: 3-column, 78px tall cells, striped placeholders, "See all N →" link in gold

---

### 9. Photo Gallery (`/gallery`)
**Albums view:**
- Header: "Albums" (Newsreader 38px) + count subtitle + "New album" button
- Grid: `repeat(4, 1fr)`, cards with 120px tall thumbnail placeholder + label + count + year
- NEW badge: `background: #c8952a`, `color: #1f2d27`, absolute top-right
- Active selection: `border: 2px solid #c8952a` on the card

**Open album view:**
- Back button + album title + filter chips (All / year filters) + Upload button
- Photo grid: `repeat(4, 1fr)` with `grid-auto-rows: 120px`, some photos span 2 cols or 2 rows

---

### 10. Notifications (`/notifications`)
**Layout:** `max-width: 780px`, three sections: Today (unread), This week, Earlier

**Row anatomy:** 42×42px icon avatar (tinted) + text block + optional CTA button
- Unread rows: `background: rgba(200,149,42,0.04)`
- Earlier section: `opacity: 0.6`, reduced size, `background: #faf8f3`

**"Mark all read":** text button, `color: #c8952a`, top right of header

---

### 11. Search (`/search`)
**Layout:** `max-width: 900px`

**Search bar:** Full width, `height: 58px`, `border-radius: 15px`, 2px border, search icon at left
**Filter tabs:** Pill/chip row — All / People / Photos / Events / Posts. Active: `background: #1f2d27`, `color: #f4f1ea`.

**Empty state:** Recent searches (pill chips with ↺ icon) + "Browse all people" 3-column person grid
**Results:** "People · N" section label + same 3-column person grid
**No results:** Centered empty state with icon, Newsreader message, muted hint

---

### 12. Settings (`/settings`)
**Layout:** Fixed inner two-column — 224px left tab nav + scrollable content right

**Settings tabs:** Profile / Privacy / Notifications / Account
Active tab: `background: #1f2d27`, `color: #f4f1ea`. Sign out item in `color: #c04040`.

**Profile tab:**
- Profile photo row: avatar + "Upload photo" / "Remove" buttons
- 2-column form grid: First/Last, Email/Phone, full-width Bio textarea, full-width Address, full-width read-only "Family position"
- Inputs: `height: 46px`, `border-radius: 10px`
- "Save changes" button top right (dark green fill)

**Privacy tab:**
- Rows for: Phone number / Home address / Profile in directory
- Each row has segmented button group: "All family" / "My branch" / "Admins only"
- Active option: `background: #f1ebdd`, `border: 1px solid #c8952a`, `color: #c8952a`

**Notifications tab:**
- Toggle rows for: Birthday reminders / New members / Photo uploads / Reunion updates
- Toggle track: ON = `background: #c8952a`, OFF = `#e2ddd3`. Knob: 18×18px white circle, `left: 3px` (off) → `left: 23px` (on). Transition: 0.2s.

**Account tab:**
- Sign-in section: Email + "Change email" side-by-side, Password + "Change password" side-by-side
- Danger zone section: `border: 1.5px solid #f5d5d5`, "Remove my account" in `color: #c04040`

---

### 13. Admin Panel (`/admin`) — protected route
**Layout:** `max-width: 1100px`

**Stats row:** 4 equal cards — Pending approvals (gold number), Active members, Flagged content, Branches

**Tab bar:** Pending approvals (with badge) / All members / Reports — underline-style tabs, `border-bottom: 2px solid`

**Pending approvals tab:**
- Table with columns: Member (avatar + name + email) / Requested / Branch / Connected by / Actions
- Actions per row: "Approve" (dark green fill) + "Deny" (danger outline) + "Review" (neutral outline)
- Empty state: "All caught up" with checkmark

**All members tab:**
- Search input + branch filter `<select>`
- Table: Member / Email / Branch / Joined — hover `background: #faf8f3`

---

## Mobile Layout
The design includes a mobile overlay preview (375px iPhone frame) that mirrors all 6 screens of the Hi-Fi file. On mobile:
- The sidebar is replaced by a bottom tab bar (5 items, icon + label, 56px tall, `background: #fff`)
- Cards use full-width layout with reduced padding (16px)
- The family tree and admin table are simplified for small screens
- Active tab color: `#c8952a`

If building a responsive app, treat `< 768px` as mobile and switch to bottom nav.

---

## Interactions & Behavior

### Auth
- "Sign in" / social buttons → navigate to app home
- "Create your account" → navigate to details form
- "Create account" → navigate to app home (pending approval in real app)

### Family Tree
- **Pan:** mousedown on canvas + mousemove → translate the canvas element
- **Zoom:** scroll wheel → scale (min 0.35, max 1.8). `+` / `−` buttons step by ±15% / ±13%. "Fit to screen" auto-calculates scale and offset to fill the viewport.
- **Node drag:** mousedown on a card → drag repositions that node's absolute position
- **Node click:** select → opens detail drawer from right. Click backdrop or × to dismiss.
- All tree mouse events use window-level mousemove + mouseup listeners to avoid stuck states

### Notifications
- "Mark all read" → hides unread "Today" section, clears badge count

### Admin pending
- "Approve" / "Deny" per row → removes that row from the pending list, decrements badge counter

### Settings — Notifications
- Toggle click → flips boolean, animates track color and knob position

### Gallery
- Click album card → opens album grid view
- "← Albums" button → returns to albums list
- Filter chips (year) → filter visible photos (mock only in prototype)

### Search
- Text input → filters the people list in real-time (against name + location)
- Filter tabs → switch result type (mock only in prototype)
- Recent search chips → populate the input

### RSVP
- One of three options selected at a time, persisted in state

---

## State Management Needs
| State | Type | Notes |
|---|---|---|
| Current screen / route | string / router | Use real routing (Next.js App Router, React Router, etc.) |
| Auth user | object | Name, initials, branch, email, role (admin/member) |
| RSVP selection | `'going' \| 'maybe' \| 'no'` | Persist to DB |
| Unread notifications | number | From real-time or polling |
| Tree node positions | `{[id]: {x, y}}` | Persist per-user to DB if custom layout desired |
| Tree zoom/pan | `{scale, panX, panY}` | Local UI state only |
| Selected tree node | string id | Local UI state |
| Settings toggles | booleans per key | Persist to user profile |
| Privacy settings | enum per field | Persist to user profile |
| Pending members | array | From DB; optimistic removal on approve/deny |
| Gallery open album | string id | Router param |
| Search query + tab | string + enum | URL query string recommended |
| Settings active tab | string | URL hash or local state |

---

## Assets
No external image assets — the prototype uses striped CSS placeholder patterns (`repeating-linear-gradient`) wherever photos would appear. Replace with real `<img>` tags in production.

Icons used are Unicode/emoji characters — replace with your icon system (Lucide, Heroicons, etc.):
| Char | Meaning |
|---|---|
| ◎ | Profile |
| ⬡ | Gallery |
| ◉ | Notifications |
| ⌕ | Search |
| ⚙ | Settings |
| ⚑ | Admin |
| ⌂ | Home |
| ⧉ | Family Tree |
| ◆ | Reunion |
| ☰ | Directory |

---

## Files in This Package
| File | Description |
|---|---|
| `Bender Family App.dc.html` | Full interactive prototype: Auth flow, Home/News, Family Tree, Reunion, Directory |
| `Bender Family - Hi-Fi Screens.dc.html` | Hi-fi screens: Profile, Gallery, Notifications, Search, Settings, Admin Panel |
| `Bender Family Auth.dc.html` | Auth flow explorations — three visual directions (Hearth, Archive, Minimal) |

Open these files in any modern browser to interact with the prototype. They are self-contained HTML files.

---

## Implementation Notes
- The family tree is the most technically complex piece — consider a library like **React Flow** or **D3** for the draggable/pannable canvas in production rather than rolling your own.
- The animated surname roller on the sign-in screen is a CSS `transform: translateY` animation — wrap surnames in a fixed-height container with `overflow: hidden`.
- All member data, announcements, photos, and events should come from a real database. The prototype hardcodes the Bender family as sample data only.
- Privacy settings should control what fields are visible in API responses, not just hidden in the UI.
- The admin panel should be route-guarded to users with the `admin` role.
