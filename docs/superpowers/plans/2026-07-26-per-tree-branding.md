# Per-tree branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app's sidebar title, home banner, and accent colors reflect the logged-in user's own family tree (`home_tree`) instead of a hardcoded "Kelsall"/gold identity.

**Architecture:** On login, fetch the user's `home_tree` record once and cache it as a module-level global (`currentHomeTree`). A single `applyHomeTreeTheme()` function sets a handful of CSS custom properties on `:root` from that tree's `color`; because most of `app.css` already reads accent color via `var(--accent-gold)` etc., this recolors most of the UI for free. A small number of rules that pair an accent background with a *hardcoded* foreground color get swapped to a new `var(--accent-fg)`/`var(--sb-item-active-bg)` so dark tree colors don't produce unreadable text. Two render functions (`renderSidebar`, `SCREENS.home`) read `currentHomeTree.name` for text.

**Tech Stack:** Vanilla JS (no build step), `helpers.js` (pure functions, Node-testable via `node --test`), plain CSS custom properties.

## Global Constraints

- No `home_tree` (or fetch failure) → fall back to today's exact default: gold theme (`#c8952a`/`#a87a22`), "Kelsall" sidebar name / "Kelsall Family" banner text. Never show a broken/blank state.
- `applyHomeTreeTheme()` must always set every property explicitly (both branches), never conditionally skip — so switching accounts within one tab can't leave a stale color from a previous session.
- New pure color-math helpers go in `helpers.js` (Node + browser global), following the existing `avatarTint`-style pattern, with unit tests in `helpers.test.js`.
- Every changed static asset (`helpers.js`, `app.js`, `app.css`) gets its `?v=NN` query string in `index.html` bumped by 1, per existing repo convention (GitHub Pages has no build step / cache-busting otherwise).
- Trunk admins (`family_admin=true`) get their own home tree's branding like any other user — no special-cased neutral theme.
- Out of scope (do not touch): sidebar shell's dark-green background, the hero card's diagonal texture overlay, the pre-login rolling-surname brand screen, the tree-editor color picker itself.

---

### Task 1: Color-math helpers in `helpers.js`

**Files:**
- Modify: `helpers.js`
- Test: `helpers.test.js`

**Interfaces:**
- Produces: `darkenHex(hex, amount)` → hex string; `contrastForeground(hex)` → hex string (`'#1f2d27'` or `'#f4f1ea'`); `hexToRgba(hex, alpha)` → `rgba(r,g,b,alpha)` string. All exported from `helpers.js`'s existing `return { ... }` object (module.exports in Node, `window.*` in browser — same pattern as `avatarTint`).

- [ ] **Step 1: Write the failing tests**

Add to `helpers.test.js` (after the existing `avatarTint` test block):

```js
test('darkenHex darkens a hex color by a percentage', () => {
  assert.strictEqual(h.darkenHex('#c8952a', 0.18), '#a47a22');
  assert.strictEqual(h.darkenHex('#000000', 0.5), '#000000'); // already black, stays black
  assert.strictEqual(h.darkenHex('#ffffff', 0.18), '#d1d1d1');
});

test('contrastForeground picks light text on dark colors, dark text on light colors', () => {
  assert.strictEqual(h.contrastForeground('#1a5276'), '#f4f1ea'); // dark navy -> light text
  assert.strictEqual(h.contrastForeground('#c8952a'), '#1f2d27'); // mid gold -> dark text
  assert.strictEqual(h.contrastForeground('#ffffff'), '#1f2d27'); // white -> dark text
  assert.strictEqual(h.contrastForeground('#000000'), '#f4f1ea'); // black -> light text
});

test('hexToRgba converts hex + alpha to an rgba() string', () => {
  assert.strictEqual(h.hexToRgba('#c8952a', 0.12), 'rgba(200,149,42,0.12)');
  assert.strictEqual(h.hexToRgba('#000000', 1), 'rgba(0,0,0,1)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test helpers.test.js`
Expected: FAIL — `h.darkenHex is not a function` (and similarly for the other two).

- [ ] **Step 3: Implement the helpers**

In `helpers.js`, add above the `return { ... }` statement (after `avatarTint`, ~line 41):

```js
  function _hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  function _toHex2(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }

  function darkenHex(hex, amount) {
    const { r, g, b } = _hexToRgb(hex);
    const f = 1 - amount;
    return `#${_toHex2(r * f)}${_toHex2(g * f)}${_toHex2(b * f)}`;
  }

  function contrastForeground(hex) {
    const { r, g, b } = _hexToRgb(hex);
    // WCAG-style relative luminance (sRGB, no gamma correction needed at this precision).
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55 ? '#1f2d27' : '#f4f1ea';
  }

  function hexToRgba(hex, alpha) {
    const { r, g, b } = _hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
```

Update the `return { ... }` statement to include the three new names:

```js
  return {
    esc, userInitials, personInitials, personYears, avatarTint, daysUntil,
    filterPeople, filterNews, groupNotifications, defaultPrivacy, defaultNotifPrefs,
    darkenHex, contrastForeground, hexToRgba,
    AVATAR_TINTS
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test helpers.test.js`
Expected: PASS, all tests green including the 3 new ones.

- [ ] **Step 5: Bump cache-busting version and commit**

In `index.html`, change every `helpers.js?v=25` to `helpers.js?v=26` (there are 2 occurrences — dev and prod script tags, if present; check with `grep -n "helpers.js?v=" index.html` and bump all matches found).

```bash
git add helpers.js helpers.test.js index.html
git commit -m "feat(frontend): add darkenHex/contrastForeground/hexToRgba color helpers"
```

---

### Task 2: Fetch and apply the home-tree theme

**Files:**
- Modify: `app.js:150-154` (globals block), `app.js:249-263` (`_launchAppShell`)

**Interfaces:**
- Consumes: `apiFetch` (existing global fetch wrapper), `darkenHex`, `contrastForeground`, `hexToRgba` (from Task 1, already loaded as globals via `helpers.js?v=26` in `index.html`, which loads before `app.js`).
- Produces: `currentHomeTree` (module-level global: `null` or `{ id, name, color, ... }` — the raw PocketBase `trees` record), `loadHomeTreeTheme()` (async, no args, no return value — sets `currentHomeTree` and calls `applyHomeTreeTheme`), `applyHomeTreeTheme(tree)` (sync, no return value — sets CSS custom properties on `document.documentElement`). Task 3 (CSS) relies on the exact property names `--accent-gold`, `--accent-gold-hover`, `--accent-fg`, `--border-focus`, `--focus-shadow`, `--sb-item-active-bg`. Tasks 4 and 5 (sidebar/banner text) rely on `currentHomeTree.name`.

- [ ] **Step 1: Add the `currentHomeTree` global**

In `app.js`, at line 154 (right after `let branchPendingCount = 0;`), add:

```js
let currentHomeTree = null;  // null = no home_tree or not loaded; {id,name,color,...} = the trees record
```

- [ ] **Step 2: Add `applyHomeTreeTheme` and `loadHomeTreeTheme`**

In `app.js`, add these two functions immediately before `async function refreshUnread(){` (currently at line 265):

```js
const _DEFAULT_THEME = {
  accentGold: '#c8952a', accentGoldHover: '#a87a22',
  accentFg: '#1f2d27', focusShadow: 'rgba(200,149,42,.12)', sbItemActiveBg: 'rgba(200,149,42,.18)',
};

function applyHomeTreeTheme(tree){
  const color = tree && tree.color;
  const root = document.documentElement.style;
  if (!color) {
    root.setProperty('--accent-gold', _DEFAULT_THEME.accentGold);
    root.setProperty('--accent-gold-hover', _DEFAULT_THEME.accentGoldHover);
    root.setProperty('--accent-fg', _DEFAULT_THEME.accentFg);
    root.setProperty('--border-focus', _DEFAULT_THEME.accentGold);
    root.setProperty('--focus-shadow', _DEFAULT_THEME.focusShadow);
    root.setProperty('--sb-item-active-bg', _DEFAULT_THEME.sbItemActiveBg);
    return;
  }
  root.setProperty('--accent-gold', color);
  root.setProperty('--accent-gold-hover', darkenHex(color, 0.18));
  root.setProperty('--accent-fg', contrastForeground(color));
  root.setProperty('--border-focus', color);
  root.setProperty('--focus-shadow', hexToRgba(color, 0.12));
  root.setProperty('--sb-item-active-bg', hexToRgba(color, 0.18));
}

async function loadHomeTreeTheme(){
  currentHomeTree = null;
  if (currentUser && currentUser.home_tree) {
    try {
      const res = await apiFetch(`/api/collections/trees/records/${currentUser.home_tree}`);
      if (res.ok) currentHomeTree = await res.json();
    } catch { /* fall back to default branding below */ }
  }
  applyHomeTreeTheme(currentHomeTree);
}
```

- [ ] **Step 3: Wire it into `_launchAppShell`**

In `app.js`, `_launchAppShell` currently reads (lines 249-263):

```js
function _launchAppShell(){
  clearInterval(rollerTimer);
  el('app').innerHTML = `
    <div id="app-shell">
      <aside id="sidebar"><div class="sidebar-texture"></div><div id="sidebar-inner"></div></aside>
      <main id="main"></main>
    </div>
    <nav id="bottom-nav"></nav>`;
  Promise.all([refreshUnread(), refreshPending(), loadBranchAdminState()]).then(() => {
    renderSidebar();
    const dl = new URLSearchParams(location.search).get('person');
    if (dl) navigate('tree', { person: dl });
    else navigate(currentTab());
  });
}
```

Change the `Promise.all([...])` line to include `loadHomeTreeTheme()`:

```js
  Promise.all([refreshUnread(), refreshPending(), loadBranchAdminState(), loadHomeTreeTheme()]).then(() => {
```

- [ ] **Step 4: Manually verify no crash on load**

Since this touches app boot with no automated frontend test harness, verify by hand:
1. Serve the frontend locally (check `README.md` or existing dev workflow — typically a static file server, e.g. `python3 -m http.server 8080` from the repo root, or whatever local dev origin is already configured in `DEV_LOGIN_ORIGINS` in `app.js`).
2. Open the app, log in with an existing account, confirm the app loads with no console errors and behaves exactly as before (no visible change yet — Tasks 3-5 haven't wired the CSS/text consumers).
3. In the browser devtools console, run `getComputedStyle(document.documentElement).getPropertyValue('--accent-gold')` and confirm it prints a color (either the tree's color if that account has a `home_tree`, or `#c8952a` if not) — confirming `loadHomeTreeTheme` ran and set the property.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(frontend): fetch home tree and apply its color as the accent theme"
```

---

### Task 3: Swap hardcoded accent-paired foreground colors to theme variables

**Files:**
- Modify: `app.css`

**Interfaces:**
- Consumes: `--accent-fg`, `--sb-item-active-bg` (set by `applyHomeTreeTheme` in Task 2; both also need real default values in `:root` so the page isn't broken before JS runs or in the Node/no-JS case).

- [ ] **Step 1: Add default values for the two new CSS variables**

In `app.css`, in the `:root{...}` block (line 6-19), add two new declarations after the existing `--focus-shadow` line (line 12):

```css
  --accent-fg:#1f2d27; --sb-item-active-bg:rgba(200,149,42,.18);
```

- [ ] **Step 2: Swap hardcoded foregrounds to `var(--accent-fg)`**

Change each of these rules (exact current text on the left, replace `color` value only):

`app.css:47`
```css
.btn-gold{background:var(--accent-gold);color:var(--bg-sidebar)}
```
→
```css
.btn-gold{background:var(--accent-gold);color:var(--accent-fg)}
```

`app.css:95-99`
```css
.avatar{
  border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-weight:600;color:var(--bg-sidebar);background:var(--accent-gold);
  flex-shrink:0;overflow:hidden;width:44px;height:44px;font-size:1rem;
}
```
→ change `color:var(--bg-sidebar)` to `color:var(--accent-fg)` (keep everything else on that line unchanged).

Note: `.pill` (app.css:102-105) has a static cream `background:#f1ebdd`, not `var(--accent-gold)` — it is **not** accent-themed and must be left untouched.

`app.css:140-142`
```css
.sb-logo{width:38px;height:38px;border-radius:11px;background:var(--accent-gold);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  font-family:var(--font-display);font-weight:600;font-size:22px;color:var(--bg-sidebar)}
```
→ change only the last `color:var(--bg-sidebar)` to `color:var(--accent-fg)`.

`app.css:154-155`
```css
.sb-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;
  background:var(--accent-gold);color:var(--bg-sidebar);
```
→ change `color:var(--bg-sidebar)` to `color:var(--accent-fg)` (keep whatever else follows on line 155/156 unchanged).

`app.css:322-323`
```css
.tn-leaf-btn:hover{background:var(--accent-gold);color:#fff;border-color:var(--accent-gold)}
.tn-leaf-btn.col{background:var(--accent-gold);color:#fff;border-color:var(--accent-gold)}
```
→ replace both `color:#fff` with `color:var(--accent-fg)`.

`app.css:326`
```css
.tn-add-btn:hover{background:var(--accent-gold);color:#fff;border-style:solid}
```
→ `color:var(--accent-fg)`.

`app.css:330`
```css
.tn-more:hover{background:var(--accent-gold);color:#fff}
```
→ `color:var(--accent-fg)`.

`app.css:337`
```css
.tc-btn:hover{background:var(--accent-gold);color:#fff;border-color:var(--accent-gold)}
```
→ `color:var(--accent-fg)`.

`app.css:360`
```css
.tree-view-btn.active{background:var(--accent-gold);color:#fff}
```
→ `color:var(--accent-fg)`.

`app.css:366`
```css
.tn-horiz-caret:hover{background:var(--accent-gold);color:#fff;border-color:var(--accent-gold)}
```
→ `color:var(--accent-fg)`.

`app.css:420-423`
```css
.ph-avatar{width:76px;height:76px;border-radius:50%;flex-shrink:0;overflow:hidden;
  display:flex;align-items:center;justify-content:center;font-family:var(--font-display);
  font-size:1.6rem;background:var(--accent-gold);color:var(--bg-sidebar);
  box-shadow:0 0 0 3px #fff,0 0 0 5px rgba(200,149,42,.25)}
```
→ change `color:var(--bg-sidebar)` to `color:var(--accent-fg)`. Leave the `box-shadow`'s hardcoded `rgba(200,149,42,.25)` ring color as-is — same category as the hero texture, a subtle gold-tinted accent left neutral by design, not worth the added complexity of theming a shadow ring.

Leave `.tn-branch:hover`/`.tn-branch.expanded` (app.css:291-292) untouched — these color per-person tree nodes via the inline `--tc` variable, a different concern from the logged-in user's own theme.

- [ ] **Step 3: Swap the active nav-item background to the theme variable**

`app.css:151`
```css
.sb-item.active{background:rgba(200,149,42,.18);color:var(--text-sidebar-active);font-weight:700}
```
→
```css
.sb-item.active{background:var(--sb-item-active-bg);color:var(--text-sidebar-active);font-weight:700}
```

- [ ] **Step 4: Manually verify visually**

1. In the browser devtools console (with the app loaded from Task 2), run:
   ```js
   applyHomeTreeTheme({ color: '#1a5276' }); // dark navy — worst case for contrast
   ```
2. Confirm: the sidebar logo square, the unread nav badge, and any visible gold button/pill now show light (`#f4f1ea`-ish) text on the navy background, not the old dark unreadable text.
3. Run `applyHomeTreeTheme(null);` and confirm everything reverts to the original gold look — no lingering navy anywhere.

- [ ] **Step 5: Bump cache-busting version and commit**

In `index.html`, change `app.css?v=47` to `app.css?v=48`.

```bash
git add app.css index.html
git commit -m "fix(frontend): theme accent-paired foreground colors so dark tree colors stay readable"
```

---

### Task 4: Dynamic sidebar brand text

**Files:**
- Modify: `app.js:309-337` (`renderSidebar`)

**Interfaces:**
- Consumes: `currentHomeTree` (global from Task 2, `null` or `{name, ...}`).

- [ ] **Step 1: Update the brand markup**

In `app.js`, `renderSidebar()` currently has (lines 325-330):

```js
  const branch = (currentUser && currentUser.family_name) || 'Kelsall family';
  inner.innerHTML = `
    <div class="sb-brand">
      <div class="sb-logo">K</div>
      <div><div class="name">Kelsall</div><div class="sub">Family Portal</div></div>
    </div>
```

Change to:

```js
  const branch = (currentUser && currentUser.family_name) || 'Kelsall family';
  const treeName = (currentHomeTree && currentHomeTree.name) || 'Kelsall';
  const logoLetter = treeName ? treeName.trim()[0].toUpperCase() : 'K';
  inner.innerHTML = `
    <div class="sb-brand">
      <div class="sb-logo">${esc(logoLetter)}</div>
      <div><div class="name">${esc(treeName)}</div><div class="sub">Family Portal</div></div>
    </div>
```

- [ ] **Step 2: Manually verify**

With the app loaded and logged in (Task 2/3 already wired):
1. If your test account has a `home_tree` set, confirm the sidebar shows that tree's name (and matching first-letter logo) instead of "Kelsall".
2. If it doesn't, confirm it still shows "Kelsall" / "K" exactly as before (no regression for unclaimed users).
3. In the console, run `currentHomeTree = {name:'Warfel'}; renderSidebar();` and confirm the sidebar updates to "Warfel" / "W" live. Then run `renderSidebar()`-triggering navigation (e.g. click a nav item) to restore normal state, or reload the page.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(frontend): show the logged-in user's own tree name in the sidebar brand"
```

---

### Task 5: Dynamic home banner text

**Files:**
- Modify: `app.js` (the no-upcoming-event branch inside `SCREENS.home`, currently at lines 955-963)

**Interfaces:**
- Consumes: `currentHomeTree` (global from Task 2).

- [ ] **Step 1: Update the fallback hero text**

In `app.js`, the fallback (no next event) hero currently reads:

```js
    : `<div class="reunion-hero">
        <div class="texture"></div>
        <div class="rh-left">
          <div class="rh-label">Welcome</div>
          <div class="rh-name">Kelsall Family</div>
          <div class="rh-detail">Explore the tree, photos, and more.</div>
          <button class="btn btn-gold" style="margin-top:18px" onclick="navigate('events')">See events</button>
        </div>
      </div>`;
```

Change `<div class="rh-name">Kelsall Family</div>` to:

```js
          <div class="rh-name">${esc((currentHomeTree && currentHomeTree.name) || 'Kelsall')} Family</div>
```

(This line sits inside a template literal already interpolated with `${...}` elsewhere in the same function, e.g. `${esc(nextEvent.name)}` a few lines above — `esc` is already in scope.)

- [ ] **Step 2: Manually verify**

1. Log in as an account with a `home_tree` set and no upcoming events (or temporarily view a state with no events) — confirm the banner reads `"<Tree Name> Family"`.
2. Log in as (or simulate via console `currentHomeTree = null;` then `navigate('home')`) an account without a `home_tree` — confirm it still reads "Kelsall Family" exactly as before.
3. Confirm the has-upcoming-event banner variant is unchanged (still shows the event name, not a family name).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(frontend): show the logged-in user's own tree name on the home banner"
```

---

### Task 6: Final end-to-end verification and version bump sanity check

**Files:** none (verification only, plus a final version-bump check)

- [ ] **Step 1: Run the full existing test suite**

```bash
node --test helpers.test.js
node --test merge.test.js
```

Expected: all PASS (Task 1's new tests plus every pre-existing test, and `merge.test.js` untouched/unaffected).

- [ ] **Step 2: Confirm every changed asset's cache-busting version was bumped**

```bash
grep -n "helpers.js?v=\|app.js?v=\|app.css?v=" index.html
```

Expected: `helpers.js?v=26`, `app.js?v=` bumped by 1 from its value at the start of this plan (check `git log -p -1 -- index.html` before this plan started, or just confirm it's higher than whatever `main` had), `app.css?v=48`. If `app.js`'s version wasn't bumped yet (Tasks 2/4/5 modified it but didn't bump the version — only Task 1/3 explicitly did), bump it now by 1 and commit:

```bash
git add index.html
git commit -m "chore(frontend): bump app.js cache-busting version"
```

- [ ] **Step 3: End-to-end manual walkthrough**

1. Log in as a user whose `home_tree` has a distinctive `color` (pick one from the admin Tree management screen, or set one via the PocketBase admin UI on a test account if none exists in dev data).
2. Confirm: sidebar title shows that tree's name, sidebar logo letter matches, primary/gold buttons and links across a few different screens (home, tree view, settings) now show that tree's color, focus rings on form inputs match, and the home banner (with no upcoming event) reads `"<Tree Name> Family"`.
3. Log out, log in as a user with no `home_tree` (or a fresh/unclaimed account) — confirm everything reverts to the original "Kelsall"/gold default with no errors.
4. Check the browser console for errors on both logins.
