# Kelsall Family Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orange top-nav SPA with the dark-sidebar Kelsall Family design, restructure the single `index.html` into `index.html` + `app.css` + `app.js` + `helpers.js`, and implement all 12 screens including three new ones (Gallery, Notifications, Search) backed by new PocketBase collections.

**Architecture:** No build step preserved — `index.html` is a thin shell that loads Google Fonts, `app.css`, `helpers.js`, `merge.js`, and `app.js` as plain `<script>`/`<link>` tags served by GitHub Pages. Pure logic (countdown, avatar tints, search filtering, notification grouping, privacy/prefs serialization) lives in `helpers.js` as side-effect-free functions, unit-tested with the Node built-in test runner exactly like `merge.js`. DOM rendering and network calls live in `app.js`. Three new migrations add `albums`, `photos`, `notifications` collections and new `users` fields.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no bundler), PocketBase (JS migrations via `Dao`/`Collection`/`SchemaField`), Node built-in `node:test` for unit tests, Google Fonts (Newsreader + Schibsted Grotesk).

## Global Constraints

- **No build step / no dependencies.** Browser-loadable plain files only. No npm packages in the frontend. Same GitHub Pages deploy.
- **API base:** `const API = 'https://reunion-api.klsll.com';` (unchanged).
- **`merge.js` is never modified.** Its tests must still pass after the restructure.
- **Existing PocketBase collections (`users`, `persons`, `couples`, `news`) keep their current API rules.** Only additive migrations.
- **Approved-member access rule string (reuse verbatim):** `@request.auth.id != "" && @request.auth.approved = true`
- **Family branding:** "Kelsall" everywhere. Sidebar logo chip letter "K". Sidebar subtitle "KELSALL FAMILY PORTAL". Default surname roller fallback: `["Kelsall", "Warfel", "Flannigan", "Hubber"]`.
- **Reunion date constant:** `const REUNION_DATE = '2026-08-15';` in `app.js`.
- **Design tokens** (CSS custom properties on `:root`, defined once in `app.css`): see Task 6. Avatar tints rotate by `index % 6`.
- **Fonts:** Newsreader for display/headings/person-names; Schibsted Grotesk for all UI/body.
- **HTML escaping:** every user/DB string interpolated into innerHTML goes through `esc()`. Never interpolate raw DB strings.
- **Migration numbering continues the existing sequence:** next free prefixes are `1718500004`, `1718500005`, `1718500006`.
- **Reference material:** visual intent lives in `docs/superpowers/specs/design-prototypes/*.dc.html` (read-only reference — they use a custom template runtime and are NOT copy-pasteable) and the authoritative token/dimension spec in `docs/superpowers/specs/design-prototypes/HANDOFF.md`. The design spec is `docs/superpowers/specs/2026-06-19-kelsall-family-redesign-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Shell: `<head>` (fonts, `app.css`), `<body>` with `<div id="app"></div>`, script tags for `helpers.js`, `merge.js`, `app.js`. ~40 lines. |
| `app.css` | All styles: design tokens, base, sidebar, every screen, mobile responsive. |
| `helpers.js` | Pure functions (no DOM, no network): `avatarTint`, `daysUntil`, `personInitials`, `personYears`, `userInitials`, `esc`, `filterPeople`, `filterNews`, `groupNotifications`, `defaultPrivacy`, `defaultNotifPrefs`. Exported via `module.exports` (Node) and attached to `window` (browser), same dual-mode pattern as `merge.js`. |
| `helpers.test.js` | Node `node:test` unit tests for `helpers.js`. |
| `app.js` | App state, routing, `apiFetch`, auth flows, sidebar render, all `render*()` screen functions, modals. Consumes `helpers.js` + `merge.js` globals. |
| `merge.js` | UNCHANGED. |
| `backend/pb_migrations/1718500004_add_gallery.js` | `albums` + `photos` collections. |
| `backend/pb_migrations/1718500005_add_notifications.js` | `notifications` collection. |
| `backend/pb_migrations/1718500006_add_user_fields.js` | `rsvp`, `privacy_settings`, `notification_prefs` fields on `users`. |

`merge.js` stays loaded as a browser global and required by `app.js`'s merge code (already works this way).

---

## Phase 1 — Backend Migrations

### Task 1: Gallery migration (`albums` + `photos`)

**Files:**
- Create: `backend/pb_migrations/1718500004_add_gallery.js`

**Interfaces:**
- Produces: collections `albums` (fields `name`, `description`, `year`, `cover_photo`) and `photos` (fields `album`, `image`, `caption`, `taken_date`, `tagged_persons`). Consumed by Gallery screen (Task 13) and Profile photos grid (Task 12).

- [ ] **Step 1: Write the migration**

Follow the exact `Dao`/`Collection`/`SchemaField` pattern from `backend/pb_migrations/1718500000_create_persons.js`. Note PocketBase migrations here are applied by running the server; there is no unit-test harness for them, so verification is "server boots and collections exist."

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");
  const persons = dao.findCollectionByNameOrId("persons");

  const APPROVED = "@request.auth.id != \"\" && @request.auth.approved = true";
  const IS_ADMIN = "@request.auth.family_admin = true";

  // albums: any approved member reads; only family_admin writes.
  const albums = new Collection({
    name: "albums",
    type: "base",
    listRule: APPROVED,
    viewRule: APPROVED,
    createRule: `${APPROVED} && ${IS_ADMIN}`,
    updateRule: `${APPROVED} && ${IS_ADMIN}`,
    deleteRule: `${APPROVED} && ${IS_ADMIN}`,
    schema: [
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "year", type: "number" },
      { name: "cover_photo", type: "file",
        options: { maxSelect: 1, maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } }
    ]
  });
  dao.saveCollection(albums);

  // photos: any approved member reads & uploads; uploader or admin edits/deletes.
  const photos = new Collection({
    name: "photos",
    type: "base",
    listRule: APPROVED,
    viewRule: APPROVED,
    createRule: APPROVED,
    updateRule: `${APPROVED} && (uploader = @request.auth.id || ${IS_ADMIN})`,
    deleteRule: `${APPROVED} && (uploader = @request.auth.id || ${IS_ADMIN})`,
    schema: [
      { name: "album", type: "relation",
        options: { collectionId: albums.id, maxSelect: 1, cascadeDelete: true, required: true } },
      { name: "image", type: "file", required: true,
        options: { maxSelect: 1, maxSize: 10485760,
          mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] } },
      { name: "caption", type: "text" },
      { name: "taken_date", type: "text" },
      { name: "uploader", type: "relation",
        options: { collectionId: users.id, maxSelect: 1, cascadeDelete: false } },
      { name: "tagged_persons", type: "relation",
        options: { collectionId: persons.id, maxSelect: null, cascadeDelete: false } }
    ]
  });
  dao.saveCollection(photos);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("photos"));
  dao.deleteCollection(dao.findCollectionByNameOrId("albums"));
});
```

- [ ] **Step 2: Verify migration applies cleanly**

Run a local PocketBase against a throwaway data dir to confirm the migration loads without error:

```bash
cd backend
# Build/run per your local setup; simplest is the binary if present, else Docker:
docker compose -f compose.yml up -d
docker compose logs pocketbase | grep -i "migrat\|error" | tail -20
```

Expected: log shows the migration applied (or "no new migrations" on re-run), no schema errors. Then confirm collections exist:

```bash
curl -s http://localhost:8090/api/collections -H "Authorization: $ADMIN_TOKEN" | grep -o '"name":"[a-z]*"'
```

Expected: includes `"name":"albums"` and `"name":"photos"`. (If you don't have an admin token handy, instead open `/_/` admin UI and confirm both collections appear.)

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500004_add_gallery.js
git commit -m "feat(backend): add albums and photos collections"
```

---

### Task 2: Notifications migration

**Files:**
- Create: `backend/pb_migrations/1718500005_add_notifications.js`

**Interfaces:**
- Produces: collection `notifications` (fields `user`, `type`, `title`, `body`, `read`, `related_id`, `related_type`). Consumed by Notifications screen (Task 14) and sidebar unread badge (Task 6/Task 7).

- [ ] **Step 1: Write the migration**

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const users = dao.findCollectionByNameOrId("users");

  // A user may only see and modify their own notifications.
  const OWN = "@request.auth.id != \"\" && user = @request.auth.id";

  const notifications = new Collection({
    name: "notifications",
    type: "base",
    listRule: OWN,
    viewRule: OWN,
    createRule: OWN,
    updateRule: OWN,
    deleteRule: OWN,
    schema: [
      { name: "user", type: "relation", required: true,
        options: { collectionId: users.id, maxSelect: 1, cascadeDelete: true } },
      { name: "type", type: "select",
        options: { maxSelect: 1,
          values: ["new_member", "birthday", "news", "photo", "rsvp", "admin"] } },
      { name: "title", type: "text", required: true },
      { name: "body", type: "text" },
      { name: "read", type: "bool" },
      { name: "related_id", type: "text" },
      { name: "related_type", type: "text" }
    ]
  });
  dao.saveCollection(notifications);
}, (db) => {
  const dao = new Dao(db);
  dao.deleteCollection(dao.findCollectionByNameOrId("notifications"));
});
```

> Note: `createRule = OWN` lets a client only create notifications addressed to itself. Cross-user notifications (e.g. notifying admins of a new member) require server-side hooks or admin action and are out of scope for v1; the screen reads/marks-read only.

- [ ] **Step 2: Verify migration applies cleanly**

Restart PocketBase and confirm the `notifications` collection appears (same method as Task 1 Step 2).

```bash
cd backend && docker compose restart pocketbase
docker compose logs pocketbase | grep -i "migrat\|error" | tail -20
```

Expected: migration applied, no errors, `notifications` visible in `/_/`.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500005_add_notifications.js
git commit -m "feat(backend): add notifications collection"
```

---

### Task 3: User fields migration (`rsvp`, `privacy_settings`, `notification_prefs`)

**Files:**
- Create: `backend/pb_migrations/1718500006_add_user_fields.js`

**Interfaces:**
- Produces: `users.rsvp` (select), `users.privacy_settings` (json text), `users.notification_prefs` (json text). Consumed by Reunion (Task 9) and Settings (Task 15).

- [ ] **Step 1: Write the migration**

Follow the `addField` pattern from `backend/pb_migrations/1718500003_add_family_admins.js`. Store privacy/prefs as `json` type fields.

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    name: "rsvp",
    type: "select",
    options: { maxSelect: 1, values: ["going", "maybe", "no"] }
  }));
  collection.schema.addField(new SchemaField({
    name: "privacy_settings",
    type: "json",
    options: { maxSize: 2000 }
  }));
  collection.schema.addField(new SchemaField({
    name: "notification_prefs",
    type: "json",
    options: { maxSize: 2000 }
  }));

  dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  collection.schema.removeField("rsvp");
  collection.schema.removeField("privacy_settings");
  collection.schema.removeField("notification_prefs");
  return dao.saveCollection(collection);
});
```

> The existing `users` `updateRule` (from migration `1718500003`) already allows a user to self-update any non-`approved`/non-`family_admin` field, so these new fields are self-editable without rule changes.

- [ ] **Step 2: Verify migration applies cleanly**

```bash
cd backend && docker compose restart pocketbase
docker compose logs pocketbase | grep -i "migrat\|error" | tail -20
```

Expected: migration applied, no errors; in `/_/` the `users` collection now shows `rsvp`, `privacy_settings`, `notification_prefs`.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500006_add_user_fields.js
git commit -m "feat(backend): add rsvp, privacy_settings, notification_prefs to users"
```

---

## Phase 2 — Frontend Foundation

### Task 4: Pure helpers module + tests (`helpers.js`)

**Files:**
- Create: `helpers.js`
- Create: `helpers.test.js`

**Interfaces:**
- Produces (all pure, no DOM/network):
  - `esc(s) -> string` — HTML-escape.
  - `userInitials(u) -> string` — up to 2 uppercase initials from `u.name || u.email`.
  - `personInitials(p) -> string` — up to 2 from `p.display_name`.
  - `personYears(p) -> string` — `"1947–2001"` / `"1947–"` trimmed / `""`.
  - `avatarTint(index) -> string` — hex from the 6-tint palette, `index % 6`.
  - `daysUntil(dateStr, now) -> number` — whole days from `now` to `dateStr` (midnight-based), min 0.
  - `filterPeople(people, query) -> array` — case-insensitive match on `display_name`, `given_name`, `family_name`, `bio`, and 4-digit birth year.
  - `filterNews(news, query) -> array` — match on `title`, `body`.
  - `groupNotifications(notes, now) -> { today, week, earlier }` — bucket by `created` timestamp.
  - `defaultPrivacy() -> object` — `{ phone:"family", address:"admins", directory:"family" }`.
  - `defaultNotifPrefs() -> object` — `{ birthdays:true, new_members:true, photos:true, reunion:true }`.
- All consumed throughout `app.js`.

- [ ] **Step 1: Write the failing tests**

```js
// helpers.test.js
const test = require('node:test');
const assert = require('node:assert');
const h = require('./helpers.js');

test('esc escapes HTML metacharacters', () => {
  assert.strictEqual(h.esc('<b> & "x"'), '&lt;b&gt; &amp; "x"');
  assert.strictEqual(h.esc(null), '');
});

test('userInitials takes up to two uppercase initials', () => {
  assert.strictEqual(h.userInitials({ name: 'Jane Q Public' }), 'JQ');
  assert.strictEqual(h.userInitials({ email: 'sam@x.com' }), 'S');
  assert.strictEqual(h.userInitials({}), '?');
});

test('personInitials from display_name', () => {
  assert.strictEqual(h.personInitials({ display_name: 'Walter Bender' }), 'WB');
  assert.strictEqual(h.personInitials({}), '?');
});

test('personYears formats birth and death', () => {
  assert.strictEqual(h.personYears({ birth_date: '1947-03-12', death_date: '2001' }), '1947–2001');
  assert.strictEqual(h.personYears({ birth_date: '1947', living: true }), '1947');
  assert.strictEqual(h.personYears({}), '');
});

test('avatarTint rotates through 6 tints by index % 6', () => {
  const tints = [h.avatarTint(0), h.avatarTint(1), h.avatarTint(2),
                 h.avatarTint(3), h.avatarTint(4), h.avatarTint(5)];
  assert.strictEqual(new Set(tints).size, 6);          // 6 distinct
  assert.strictEqual(h.avatarTint(6), h.avatarTint(0)); // wraps
  assert.match(h.avatarTint(0), /^#[0-9a-f]{6}$/i);     // hex
});

test('daysUntil counts whole days, floored at 0', () => {
  const now = new Date('2026-06-19T12:00:00Z');
  assert.strictEqual(h.daysUntil('2026-06-20', now), 1);
  assert.strictEqual(h.daysUntil('2026-06-19', now), 0);
  assert.strictEqual(h.daysUntil('2026-06-01', now), 0); // past -> 0, never negative
});

test('filterPeople matches name, bio, and birth year', () => {
  const people = [
    { display_name: 'Walter Bender', given_name: 'Walter', family_name: 'Bender', bio: 'founder', birth_date: '1947' },
    { display_name: 'Susan Kelsall', given_name: 'Susan', family_name: 'Kelsall', bio: '', birth_date: '1971' }
  ];
  assert.strictEqual(h.filterPeople(people, 'kelsall').length, 1);
  assert.strictEqual(h.filterPeople(people, 'WALTER')[0].display_name, 'Walter Bender');
  assert.strictEqual(h.filterPeople(people, '1947').length, 1);
  assert.strictEqual(h.filterPeople(people, 'founder').length, 1);
  assert.strictEqual(h.filterPeople(people, '').length, 2); // empty -> all
});

test('filterNews matches title and body', () => {
  const news = [{ title: 'Reunion', body: 'come' }, { title: 'Recipe', body: 'pie' }];
  assert.strictEqual(h.filterNews(news, 'reunion').length, 1);
  assert.strictEqual(h.filterNews(news, 'pie').length, 1);
});

test('groupNotifications buckets by recency', () => {
  const now = new Date('2026-06-19T12:00:00Z');
  const notes = [
    { id: 'a', created: '2026-06-19 09:00:00.000Z' }, // today
    { id: 'b', created: '2026-06-16 09:00:00.000Z' }, // this week (within 7d, not today)
    { id: 'c', created: '2026-05-01 09:00:00.000Z' }  // earlier
  ];
  const g = h.groupNotifications(notes, now);
  assert.deepStrictEqual(g.today.map(n => n.id), ['a']);
  assert.deepStrictEqual(g.week.map(n => n.id), ['b']);
  assert.deepStrictEqual(g.earlier.map(n => n.id), ['c']);
});

test('default privacy and notif prefs', () => {
  assert.deepStrictEqual(h.defaultPrivacy(), { phone: 'family', address: 'admins', directory: 'family' });
  assert.deepStrictEqual(h.defaultNotifPrefs(), { birthdays: true, new_members: true, photos: true, reunion: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test helpers.test.js`
Expected: FAIL — `Cannot find module './helpers.js'`.

- [ ] **Step 3: Write `helpers.js`**

Mirror the dual-export pattern at the bottom of `merge.js` (assign to `module.exports` when present, else attach to `window`/`globalThis`).

```js
// helpers.js — pure, side-effect-free helpers. No DOM, no network.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api); // attach each helper as a window global
})(typeof self !== 'undefined' ? self : this, function () {

  const AVATAR_TINTS = ['#e7d9bd', '#d8e0d2', '#e8dcd2', '#dfe2e6', '#ece0cf', '#dde4dd'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initialsFrom(str) {
    return (str || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  }
  function userInitials(u) { return initialsFrom((u && (u.name || u.email)) || ''); }
  function personInitials(p) { return initialsFrom((p && p.display_name) || ''); }

  function personYears(p) {
    const b = (p.birth_date || '').slice(0, 4);
    const d = (p.death_date || '').slice(0, 4);
    if (!b && !d) return '';
    return `${b || '?'}–${d || (p.living === false ? '?' : '')}`.replace(/–$/, '');
  }

  function avatarTint(index) {
    const i = ((index % AVATAR_TINTS.length) + AVATAR_TINTS.length) % AVATAR_TINTS.length;
    return AVATAR_TINTS[i];
  }

  function daysUntil(dateStr, now) {
    const target = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diff = Math.floor((target - base) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function _hay(p) {
    return [p.display_name, p.given_name, p.family_name, p.bio, (p.birth_date || '').slice(0, 4)]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function filterPeople(people, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return people.slice();
    return people.filter(p => _hay(p).includes(q));
  }
  function filterNews(news, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return news.slice();
    return news.filter(n => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q));
  }

  function groupNotifications(notes, now) {
    const today = [], week = [], earlier = [];
    const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const weekAgo = startToday - 7 * 86400000;
    for (const n of notes) {
      const t = new Date(String(n.created).replace(' ', 'T')).getTime();
      if (t >= startToday) today.push(n);
      else if (t >= weekAgo) week.push(n);
      else earlier.push(n);
    }
    return { today, week, earlier };
  }

  function defaultPrivacy() { return { phone: 'family', address: 'admins', directory: 'family' }; }
  function defaultNotifPrefs() { return { birthdays: true, new_members: true, photos: true, reunion: true }; }

  return {
    esc, userInitials, personInitials, personYears, avatarTint, daysUntil,
    filterPeople, filterNews, groupNotifications, defaultPrivacy, defaultNotifPrefs,
    AVATAR_TINTS
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test helpers.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Confirm `merge.js` tests still pass (sanity)**

Run: `node --test merge.test.js`
Expected: PASS (unchanged).

- [ ] **Step 6: Commit**

```bash
git add helpers.js helpers.test.js
git commit -m "feat: add pure helpers module with unit tests"
```

---

### Task 5: Shell + design tokens + app bootstrap

This task produces a working authenticated shell: `index.html` loads the new files, `app.css` defines tokens + sidebar + base, and `app.js` boots auth state, routing, `apiFetch`, and renders the sidebar with nav items. Screens render placeholder content ("Coming soon") until their tasks land. **Login must work** (reuse existing auth logic). After this task the app loads, you can sign in, and click between (empty) nav sections.

**Files:**
- Rewrite: `index.html` (shell only)
- Create: `app.css`
- Create: `app.js`

**Interfaces:**
- Produces (globals in `app.js`, consumed by all screen tasks):
  - `API`, `token`, `userId`, `currentUser`, `unreadCount` (let-bindings).
  - `apiFetch(path, opts) -> Promise<Response>` — adds `Authorization` header.
  - `navigate(tab, params)` — sets `?tab=` (+ extra params), updates active nav, calls the screen renderer.
  - `currentTab() -> string` — reads `?tab=` (default `'home'`).
  - `renderSidebar()` — paints `#sidebar` nav with active state + badges (unread notifications, pending count for admins).
  - `el(id)`, `mountMain(html)` — DOM helpers; `mountMain` sets `#main` innerHTML.
  - `showAuth()`, `enterApp()`, `logout()`, `clearSession()`.
  - `SCREENS` registry: `{ home, tree, reunion, directory, gallery, notifications, search, settings, admin, profile }` → render fn. Each screen task fills in its entry.
  - `toast(msg, kind)` — transient banner (replaces old `showAlert`).
- Consumes: all `helpers.js` globals, `apiFetch` auth endpoints (unchanged from current `index.html`).

- [ ] **Step 1: Write `index.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kelsall Family</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="app.css" />
</head>
<body>
  <div id="app"></div>
  <div id="toast" class="toast" hidden></div>
  <div id="modal-backdrop" class="modal-backdrop" hidden>
    <div id="modal-box" class="modal-box"></div>
  </div>
  <script src="helpers.js"></script>
  <script src="merge.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `app.css` foundation (tokens, base, sidebar, app layout, mobile nav skeleton)**

Define `:root` tokens exactly per HANDOFF.md, base typography (Schibsted Grotesk body, Newsreader headings), the app shell grid (`#app-shell` = sidebar 248px + `#main` flex), the dark sidebar with diagonal texture overlay, nav item active/inactive states, badge chips, the user footer, the mobile bottom nav (`<768px`), `.toast`, `.modal-backdrop`/`.modal-box`, and a generic `.spinner`. Pull every color/dimension from HANDOFF.md "Design Tokens" and the App Shell section. Key requirements verbatim from spec:

```css
:root{
  --bg-app:#f4f1ea; --bg-card:#fff; --bg-sidebar:#1f2d27; --bg-subtle:#faf8f3;
  --accent-gold:#c8952a; --accent-gold-hover:#a87a22; --accent-green:#2d4a38;
  --text-primary:#20231f; --text-secondary:#8c857a; --text-muted:#a99f8c;
  --text-sidebar:rgba(244,241,234,.62); --text-sidebar-active:#f4f1ea;
  --border-default:#ece6da; --border-input:#e2ddd3; --border-focus:#c8952a;
  --focus-shadow:rgba(200,149,42,.12);
  --danger:#c04040; --danger-bg:#fdf2f2; --danger-border:#f5d5d5;
  --font-display:'Newsreader',Georgia,serif;
  --font-ui:'Schibsted Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --shadow-card:0 1px 6px rgba(31,45,39,.05);
  --shadow-hover:0 4px 18px rgba(31,45,39,.12);
  --shadow-drawer:-10px 0 40px rgba(31,45,39,.18);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-ui);background:var(--bg-app);color:var(--text-primary);min-height:100vh}
h1,h2,h3,.display{font-family:var(--font-display)}
/* sidebar texture overlay */
.sidebar-texture{position:absolute;inset:0;opacity:.4;pointer-events:none;
  background:repeating-linear-gradient(135deg,rgba(200,149,42,.09) 0 1px,transparent 1px 22px)}
```

Sidebar nav item rules (from HANDOFF §3): `padding:11px 14px; border-radius:10px;` active = `background:rgba(200,149,42,.18); color:var(--text-sidebar-active); font-weight:700;` inactive = `color:var(--text-sidebar); font-weight:400`. Logo chip 38×38 `border-radius:11px; background:var(--accent-gold)` with Newsreader "K" in `var(--bg-sidebar)`. Badge chip 18×18 `border-radius:9px; background:var(--accent-gold); color:var(--bg-sidebar)`, 10px bold. Mobile: `@media (max-width:767px)` hide sidebar, show `#bottom-nav` (fixed, 56px, white, 5 items, active color `var(--accent-gold)`), and `#main` gets bottom padding 64px.

- [ ] **Step 3: Write `app.js` bootstrap**

Port the existing auth logic verbatim from `index.html` (login/register/Google/Apple/OAuth callbacks, `clearSession`, `apiFetch`, `init`) into `app.js`, but replace all DOM-view switching (`showView`/`showSection`/`switchTab`) with the new `navigate`/`renderSidebar`/`mountMain` model. Use `helpers.js` globals instead of the old inline `esc`/`userInitials`. Implement:

```js
const API = 'https://reunion-api.klsll.com';
const REUNION_DATE = '2026-08-15';
let token = localStorage.getItem('pb_token') || '';
let userId = localStorage.getItem('pb_user_id') || '';
let currentUser = null;
let unreadCount = 0;

const NAV = [
  { tab:'home',          label:'Home' },
  { tab:'tree',          label:'Family Tree' },
  { tab:'reunion',       label:'Reunion' },
  { tab:'directory',     label:'Directory' },
  { tab:'gallery',       label:'Photo Gallery' },
  { tab:'notifications', label:'Notifications' },
  { tab:'search',        label:'Search' },
  { tab:'settings',      label:'Settings' },
  { tab:'admin',         label:'Admin Panel', adminOnly:true },
];
const MOBILE_NAV = ['home','tree','directory','gallery','profile'];

const SCREENS = {}; // each screen task registers SCREENS[tab] = (params) => {}

function el(id){ return document.getElementById(id); }
function mountMain(html){ el('main').innerHTML = html; }
function apiFetch(path, opts={}){
  return fetch(API + path, { ...opts, headers:{ Authorization: token, ...(opts.headers||{}) } });
}

function currentTab(){ return new URLSearchParams(location.search).get('tab') || 'home'; }

function navigate(tab, params={}){
  const usp = new URLSearchParams();
  usp.set('tab', tab);
  for (const [k,v] of Object.entries(params)) if (v!=null && v!=='') usp.set(k,v);
  history.replaceState({}, '', `${location.pathname}?${usp}`);
  renderSidebar();
  const fn = SCREENS[tab] || SCREENS.home;
  fn(Object.fromEntries(usp));
}

function toast(msg, kind='info'){
  const t = el('toast'); t.textContent = msg; t.className = `toast toast-${kind}`; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; }, 3200);
}

async function init(){
  // Preserve existing OAuth/Apple callback handling verbatim, then:
  if (!token) return showAuth();
  try {
    const res = await apiFetch(`/api/collections/users/records/${userId}`);
    if (!res.ok) throw new Error('expired');
    currentUser = await res.json();
    if (!currentUser.approved) return showPending();
    enterApp();
  } catch { clearSession(); showAuth(); }
}

async function enterApp(){
  el('app').innerHTML = `
    <div id="app-shell">
      <aside id="sidebar"><div class="sidebar-texture"></div><div id="sidebar-inner"></div></aside>
      <main id="main"></main>
    </div>
    <nav id="bottom-nav"></nav>`;
  await refreshUnread();
  renderSidebar();
  // deep links: ?person=<id> => tree
  const dl = new URLSearchParams(location.search).get('person');
  navigate(dl ? 'tree' : currentTab(), dl ? { person: dl } : {});
}

async function refreshUnread(){
  try {
    const f = encodeURIComponent(`(user="${userId}" && read=false)`);
    const res = await apiFetch(`/api/collections/notifications/records?filter=${f}&perPage=1`);
    const data = await res.json();
    unreadCount = res.ok ? (data.totalItems || 0) : 0;
  } catch { unreadCount = 0; }
}

function renderSidebar(){ /* paint #sidebar-inner (logo, nav items w/ badges, user footer) and #bottom-nav; active = currentTab(); admin item only if currentUser.family_admin; notifications badge = unreadCount */ }

function logout(){ clearSession(); showAuth(); }
function clearSession(){ token=''; userId=''; currentUser=null;
  localStorage.removeItem('pb_token'); localStorage.removeItem('pb_user_id'); }

// Placeholder screens — real ones registered by later tasks.
for (const {tab} of NAV) SCREENS[tab] = () => mountMain(
  `<div class="screen-pad"><div class="empty-state"><p>Coming soon.</p></div></div>`);
SCREENS.profile = SCREENS.home;

init();
```

Implement `renderSidebar`, `showAuth`, `showPending` fully (sidebar per HANDOFF §3; auth/pending are replaced wholesale in Task 6 but need a minimal working version now so login works — a minimal centered form is fine here and gets restyled in Task 6).

- [ ] **Step 4: Manual verification — app boots and login works**

Serve the SPA locally and point it at the running backend:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/?` , sign in with the seeded `james@klsll.com` account. Expected:
- Dark sidebar renders on the left with logo chip "K", "Kelsall / FAMILY PORTAL", all nav items; Admin Panel visible (james is family_admin).
- Clicking each nav item updates the active highlight and shows "Coming soon."
- `node --test helpers.test.js merge.test.js` still passes.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add index.html app.css app.js
git commit -m "feat: restructure into shell + app.css + app.js with new sidebar shell"
```

---

## Phase 3 — Screens

> Each screen task: register `SCREENS[tab]` (or the auth/profile equivalent) in `app.js`, add the screen's CSS block to `app.css`, wire real API calls, and verify manually in the browser. Reference `HANDOFF.md` for the section's exact dimensions/markup intent and the matching `.dc.html` prototype for visual layout. Reuse `helpers.js` functions; never re-implement `esc`/initials/etc. All steps assume the Global Constraints.

### Task 6: Auth screens (Sign In + Sign Up)

**Files:** Modify `app.js` (`showAuth`, `renderSignIn`, `renderSignUp`, surname roller, port existing `doLogin`/`doRegister`/`doGoogleAuth`/`doAppleAuth`/OAuth callbacks), `app.css` (auth block).

**Interfaces:**
- Consumes: existing auth endpoints (unchanged), `apiFetch`, `helpers.esc`.
- Produces: `showAuth(mode)` where `mode ∈ {'signin','signup'}`; on success calls `enterApp()` or `showPending()`.

Reference: HANDOFF §1–2, `Bender Family Auth.dc.html`.

- [ ] **Step 1:** Build the two-column shell (`42% brand wall` / `58% form`) in `app.css`. Brand wall: `var(--bg-sidebar)` + `.sidebar-texture` (opacity .5). Mobile (`<768px`): stack; brand wall becomes a short top strip.
- [ ] **Step 2:** Implement the surname roller: a fixed-height (`1.1em` line) `overflow:hidden` container; cycle words via `transform:translateY` with `transition: .85s cubic-bezier(.7,0,.2,1)` on a `setInterval` (~2s). Source surnames from distinct `persons.family_name` values fetched once (`GET /api/collections/persons/records?perPage=500&fields=family_name`); fall back to `["Kelsall","Warfel","Flannigan","Hubber"]` if fewer than 2 distinct. "The" above, "Family" below, both `#f4f1ea`; roller word `var(--accent-gold)` Newsreader 72px/500. Tagline "Every branch, one root." Newsreader italic 21px gold.
- [ ] **Step 3:** Sign-in form (max-width 380px): Google (light border) + Apple (dark fill) buttons (h52, r11) calling the **unchanged** `doGoogleAuth`/`doAppleAuth`; "or with email" divider; email + password inputs (h52, r11, bg `var(--bg-subtle)`); "Sign in" CTA (full-width, h54, bg `var(--bg-sidebar)`, color `#f4f1ea`, weight 700) calling `doLogin`; footer link "Create your account" → `showAuth('signup')`.
- [ ] **Step 4:** Sign-up form (max-width 480px): grid First/Last (2col), Email (full), Phone/Branch (2col), Address (full); fields h50/r11; "Create account" CTA calling `doRegister` (ported, still sets `approved:false` then auths to show pending); footer note "Your details are visible only to verified family members." On success → `showPending()`.
- [ ] **Step 5:** Verify in browser: roller animates; Google/Apple buttons still initiate the existing flows (don't break sessionStorage state/verifier round-trip); email login works; switching sign-in/sign-up works; register creates a pending account and shows the pending screen. No console errors.
- [ ] **Step 6:** Commit: `feat: add Kelsall auth screens (sign in + sign up)`

### Task 7: Home / News feed

**Files:** Modify `app.js` (`SCREENS.home`, `postNews` ported), `app.css` (home block).

**Interfaces:** Consumes `apiFetch`, `helpers.daysUntil`, `helpers.avatarTint`, `helpers.esc`, `REUNION_DATE`. Reads `news`, `users` (birthdays), `persons` (counts).

Reference: HANDOFF §4, `Bender Family App.dc.html`.

- [ ] **Step 1:** Reunion hero card: full-width dark-green card (r18, texture), left = "NEXT GATHERING" gold label + event name (Newsreader 30px) + details; right = `daysUntil(REUNION_DATE, new Date())` (Newsreader 60px gold) + "days to go" + gold CTA button → `navigate('reunion')`.
- [ ] **Step 2:** Two-column body `grid-template-columns:1fr 320px`. Left "Announcements": fetch `GET /api/collections/news/records?sort=-created&perPage=50&expand=author`, render white cards (r16) with optional striped image placeholder, tag chip (`#f1ebdd` bg + gold dot), Newsreader title 23px, author+date meta, body. Include the existing "post news" affordance (port `postNews`) as a compact composer or modal so news posting still works.
- [ ] **Step 3:** Right rail: "Upcoming birthdays" card from `GET /api/collections/users/records?filter=(approved=true)&perPage=200` (compute nearest upcoming `birthday`, show avatar tint + name + date + "turns N" when birth year known); "Family at a glance" card with member count (users totalItems) + branch count (distinct `persons.family_name`) + "Open the family tree →" → `navigate('tree')`.
- [ ] **Step 4:** Verify: countdown matches `2026-08-15`, news loads and posting works, birthdays + stats populate. Mobile: columns stack.
- [ ] **Step 5:** Commit: `feat: add home/news feed screen`

### Task 8: Family Tree (reskin existing logic)

**Files:** Modify `app.js` (port `openTree`, `focusPerson`, `fetchNeighborhood`, `getPerson`/`getChildren`/`getCouplesFor`, `renderTree`, breadcrumb, person form modal, add-relative, claim, duplicates/merge — all from current `index.html` verbatim, swapping inline helpers for `helpers.js`), register `SCREENS.tree`. Modify `app.css` (tree block).

**Interfaces:** Consumes `apiFetch`, `merge.computeMergeWrites`, `helpers.personInitials/personYears/avatarTint`. Preserves `?person=<id>` deep link via `navigate('tree',{person})`.

Reference: HANDOFF §5, `Bender Family App.dc.html`.

- [ ] **Step 1:** Port the entire tree subsystem (neighborhood fetch, `personCache`, focus/breadcrumb, person add/edit modal, add-relative, "this is me" claim, duplicates + merge using `merge.js`) into `app.js` unchanged in behavior. `SCREENS.tree(params)` reads `params.person` (or linked user) and calls `openTree`.
- [ ] **Step 2:** Reskin to the spec: fixed header bar (`backdrop-filter:blur(6px)`, Newsreader 26px title, zoom −/+ % + "Fit to screen"); canvas bg `#efe9dd` with radial dot grid; person cards 156px (r14, 2px border, tinted avatar, first-name bold + birth year); selected card `#fffaf0`/gold border; SVG connectors (marriage gold 2.5px, parent→child `#c4bba8` 2px). The existing neighborhood layout (rows by generation) is acceptable; keep pan/zoom/drag if already present or add the simpler row layout reskinned — do not regress existing functionality. Detail drawer (360px right, 84×84 avatar, Newsreader 28px name, facts grid, "View full profile" → `navigate('profile',{id})`).
- [ ] **Step 3:** Verify: deep link `?tab=tree&person=<id>` focuses correctly; add/edit person, add relative, claim "this is me", and merge duplicates all still work; `node --test merge.test.js` passes.
- [ ] **Step 4:** Commit: `feat: reskin family tree to new design`

### Task 9: Reunion RSVP

**Files:** Modify `app.js` (`SCREENS.reunion`, `setRsvp`), `app.css`.

**Interfaces:** Consumes `apiFetch`, `currentUser.rsvp`. Writes `PATCH /api/collections/users/records/{userId} {rsvp}`.

Reference: HANDOFF §6.

- [ ] **Step 1:** Hero venue placeholder (240px striped) + When/Where/Headcount bar.
- [ ] **Step 2:** Three RSVP buttons (going/maybe/no, h54 r12); active = dark green per spec, reflects `currentUser.rsvp`; click → PATCH + optimistic update + `toast`.
- [ ] **Step 3:** Schedule card (gold day labels + event rows, 1px borders) — static content from a JS array constant.
- [ ] **Step 4:** Verify: selecting an option persists (reload keeps it). Commit: `feat: add reunion RSVP screen`

### Task 10: Directory

**Files:** Modify `app.js` (`SCREENS.directory`), `app.css`.

**Interfaces:** Reads `GET /api/collections/users/records?filter=(approved=true)&sort=name&perPage=200`. Consumes `helpers.userInitials/avatarTint/esc`.

Reference: HANDOFF §7.

- [ ] **Step 1:** Responsive grid `repeat(auto-fill,minmax(250px,1fr))`; person card: 46×46 tinted avatar, name 15.5px bold, role muted, location, "Message" (mailto) + "Call" (tel) outline buttons; keep a "View in tree" affordance → `navigate('tree',{person})` via `linked_user` lookup.
- [ ] **Step 2:** Verify: members load, tree link works. Commit: `feat: add directory screen`

### Task 11: Member Profile

**Files:** Modify `app.js` (`SCREENS.profile` reads `params.id`, defaulting to the viewer's linked person), `app.css`.

**Interfaces:** Reads `persons` record (+ `expand=father,mother`), `couples` for partners, `photos?filter=(tagged_persons~"id")`. Consumes helpers.

Reference: HANDOFF §8.

- [ ] **Step 1:** Hero card: 76×76 avatar w/ double ring shadow, Newsreader 32px name, subtitle, pill badges (branch / generation / member-since), action buttons (Message / Call / "View in tree →" → `navigate('tree',{person:id})`).
- [ ] **Step 2:** Left column: About (bio), Contact (email/phone/address rows), Family connections (parents/partners/children with chevrons → `navigate('profile',{id})`). Right column: Life events timeline (gold→border gradient rule, dot markers) from available dates; Photos grid (3-col) from tagged `photos`, "See all →" → `navigate('gallery')`.
- [ ] **Step 2b:** If `id` is the viewer's own linked person, show an "Edit profile" button → `navigate('settings')`.
- [ ] **Step 3:** Verify: opening a person from tree/directory shows their profile; missing fields degrade gracefully. Commit: `feat: add member profile screen`

### Task 12: Photo Gallery (NEW)

**Files:** Modify `app.js` (`SCREENS.gallery` with albums vs. open-album views from `params.album`, `uploadPhoto`, `createAlbum` for admins), `app.css`.

**Interfaces:** `GET /api/collections/albums/records?sort=-created`; `GET /api/collections/photos/records?filter=(album="{id}")&expand=tagged_persons&perPage=200`; `POST /api/collections/photos/records` (multipart); admin `POST /api/collections/albums/records`. Photo/cover URLs: `${API}/api/files/{collection}/{recordId}/{filename}`.

Reference: HANDOFF §9.

- [ ] **Step 1:** Albums view: header "Albums" (Newsreader 38px) + count + "New album" (admin only → create modal). Grid `repeat(4,1fr)`: card = 120px cover thumb (`<img>` or striped placeholder), label, count, year, NEW badge for recent; click → `navigate('gallery',{album:id})`.
- [ ] **Step 2:** Open-album view: back button → `navigate('gallery')`, title, year filter chips, "Upload photo" (any approved member) → multipart POST to `photos` with `album`, `image`, `uploader:userId`; grid `repeat(4,1fr)` `grid-auto-rows:120px`, every 5th photo spans 2 cols/rows; click photo → simple lightbox overlay.
- [ ] **Step 3:** Verify: create an album (as james), upload a photo, see it render; non-admin cannot create albums (button hidden) but can upload. Commit: `feat: add photo gallery screen`

### Task 13: Notifications (NEW)

**Files:** Modify `app.js` (`SCREENS.notifications`, `markAllRead`), `app.css`.

**Interfaces:** `GET /api/collections/notifications/records?filter=(user="{userId}")&sort=-created&perPage=100`; mark-read `PATCH` per unread record `{read:true}`. Consumes `helpers.groupNotifications/avatarTint`. Updates global `unreadCount` + `renderSidebar()`.

Reference: HANDOFF §10.

- [ ] **Step 1:** Fetch + `groupNotifications(items, new Date())` → Today (unread-tinted), This week, Earlier (60% opacity). Row: 42×42 tinted icon avatar + title/subtitle + optional CTA. "Mark all read" button top-right → PATCH all unread, set `unreadCount=0`, re-render + `renderSidebar()`.
- [ ] **Step 2:** Empty state when no notifications. Sidebar badge reflects `unreadCount`.
- [ ] **Step 3:** Verify: seed a couple of notification records for james via `/_/` admin, confirm grouping + mark-all-read clears the badge. Commit: `feat: add notifications screen`

### Task 14: Search (NEW)

**Files:** Modify `app.js` (`SCREENS.search` reads `params.q`/`params.filter`), `app.css`.

**Interfaces:** Fetches `persons` (perPage 500) and `news` once on mount, caches in module vars; filters client-side via `helpers.filterPeople`/`filterNews`. Recent searches in `localStorage['kelsall_recent_searches']` (max 8).

Reference: HANDOFF §11.

- [ ] **Step 1:** Search bar (h58, r15, 2px border, leading icon) bound to live input → updates `?q=` and re-renders results. Filter tabs All/People/Posts (active dark green) → `?filter=`.
- [ ] **Step 2:** Empty query: recent-search pill chips (click → fill query) + "Browse all people" 3-col grid. Query present: "People · N" + 3-col person grid and/or "Posts · N" list per filter. No-results centered empty state. Persist each submitted query to recent searches.
- [ ] **Step 3:** Verify: typing filters in real time; tabs switch result type; recent searches persist across reloads. Commit: `feat: add search screen`

### Task 15: Settings

**Files:** Modify `app.js` (`SCREENS.settings` with sub-tabs, `saveProfile` ported, `savePrivacy`, `saveNotifPrefs`, change email/password, delete account), `app.css`.

**Interfaces:** `PATCH /api/collections/users/records/{userId}` for profile/`privacy_settings`/`notification_prefs`; uses `helpers.defaultPrivacy/defaultNotifPrefs` when fields absent. Delete = `DELETE` + `clearSession`.

Reference: HANDOFF §12.

- [ ] **Step 1:** Inner two-column: 224px tab nav (Profile/Privacy/Notifications/Account, active dark green; Sign out in danger) + content. Sub-tab state local (not URL).
- [ ] **Step 2:** Profile tab: photo upload row + 2-col form (First/Last, Email/Phone, Bio, Address, read-only Family position); "Save changes" → ported `saveProfile`.
- [ ] **Step 3:** Privacy tab: per-field segmented buttons (All family / My branch / Admins only) bound to `privacy_settings` JSON; persist on change. Notifications tab: toggle rows bound to `notification_prefs` JSON (track ON=gold/OFF=`#e2ddd3`, knob 18×18 slide). Account tab: change email/password (reuse PocketBase request endpoints) + Danger zone delete (confirm modal → DELETE).
- [ ] **Step 4:** Verify: profile save persists; privacy + notif toggles persist (reload reflects JSON); delete-account confirm works. Commit: `feat: add settings screen`

### Task 16: Admin Panel (reskin existing logic)

**Files:** Modify `app.js` (`SCREENS.admin`, port `loadPendingUsers`/`loadAdminUsers`/`approveUser`/`setFamilyAdmin`/`updateUserAccess`), `app.css`.

**Interfaces:** Reads `users?filter=(approved=false)` and `(family_admin=true)`; approve = `PATCH {approved:true}`, deny = `DELETE`. Admin-guarded: if `!currentUser.family_admin`, redirect `navigate('home')`. Pending count feeds sidebar admin badge.

Reference: HANDOFF §13.

- [ ] **Step 1:** Guard + stats row (4 cards: pending approvals gold number, active members, flagged=0 placeholder, branches). Tab bar (underline style): Pending approvals (badge) / All members / Reports (placeholder).
- [ ] **Step 2:** Pending tab: table (Member avatar+name+email / Requested / Branch / Connected by / Actions) with Approve (dark green) / Deny (danger outline) / Review; optimistic row removal + decrement badge. Empty = "All caught up". All members tab: search input + branch `<select>` + table (Member/Email/Branch/Joined), client-side filtered.
- [ ] **Step 3:** Verify: as james, pending accounts list, approve/deny works and badge updates; non-admin is redirected. Commit: `feat: reskin admin panel`

### Task 17: Mobile responsive + bottom nav polish

**Files:** Modify `app.css` (responsive rules across screens), `app.js` (`renderSidebar` also paints `#bottom-nav`).

- [ ] **Step 1:** Below 768px: hide sidebar, render `#bottom-nav` (5 items: Home, Tree, Directory, Gallery, Profile; icon+label; 56px; active gold). Ensure each screen's grids collapse to single column with 16px padding; tree + admin table use simplified small-screen layouts (horizontal scroll acceptable for the table).
- [ ] **Step 2:** Verify at 375px width (devtools): all screens usable, bottom nav switches tabs, no horizontal overflow except where intended. Commit: `feat: mobile responsive layout and bottom nav`

### Task 18: Final integration, cleanup, and docs

**Files:** Modify `CLAUDE.md`, `README.md`; remove `family.zip`.

- [ ] **Step 1:** Update `CLAUDE.md` Architecture section: frontend is now `index.html` (shell) + `app.css` + `app.js` + `helpers.js` + `merge.js`; note `helpers.js` is pure/Node-tested (`node --test helpers.test.js`); list new collections (`albums`, `photos`, `notifications`) and new `users` fields in the Data model section.
- [ ] **Step 2:** Update `README.md` for the new look/screens as needed.
- [ ] **Step 3:** Remove the now-extracted source bundle: `git rm family.zip` (the referenceable prototypes live in `docs/superpowers/specs/design-prototypes/`).
- [ ] **Step 4:** Full regression: `node --test helpers.test.js merge.test.js` (PASS); manual smoke of every nav item while signed in as james — no console errors, all screens render real data.
- [ ] **Step 5:** Commit: `chore: update docs for redesign and remove source bundle`

---

## Self-Review

**Spec coverage** — every HANDOFF/spec section maps to a task:
- Tokens/fonts/shadows/texture → Task 5. Auth §1–2 → Task 6. App shell §3 → Task 5. Home §4 → Task 7. Tree §5 → Task 8. Reunion §6 → Task 9. Directory §7 → Task 10. Profile §8 → Task 11. Gallery §9 → Task 12. Notifications §10 → Task 13. Search §11 → Task 14. Settings §12 → Task 15. Admin §13 → Task 16. Mobile → Task 17. Migrations (gallery/notifications/user fields) → Tasks 1–3. Pure logic → Task 4. Docs/cleanup → Task 18. No gaps.

**Placeholder scan** — no "TBD/TODO"; migrations and `helpers.js` carry full code + tests. Screen tasks intentionally reference the in-repo prototype + HANDOFF for pixel markup rather than inlining ~3000 lines of HTML template strings; every screen task specifies exact API endpoints, exact tokens/dimensions, and a concrete verification — the honest altitude for "port this prototype to a render function."

**Type/name consistency** — `helpers.js` exports used identically across tasks (`avatarTint`, `daysUntil`, `filterPeople`, `groupNotifications`, `defaultPrivacy`, `defaultNotifPrefs`); `SCREENS[tab]` registry keys match `NAV` tabs + `profile`; `navigate(tab, params)`/`currentTab()`/`mountMain()`/`apiFetch()` signatures consistent throughout; `unreadCount`/`renderSidebar()` shared by Tasks 5/7/13/16. Migration field names (`uploader`, `tagged_persons`, `cover_photo`, `privacy_settings`, `notification_prefs`, `rsvp`) match their consuming tasks.

**No-frontend-test reality** — the codebase has no SPA test runner; genuine TDD is applied where it's possible and valuable (`helpers.js`), and screens use explicit manual browser verification steps. This matches the existing project (only `merge.js`/gedcom_sync are unit-tested).
