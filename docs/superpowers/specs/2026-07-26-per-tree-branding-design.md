# Per-tree branding design

## Problem

The app currently has one hardcoded brand identity ("Kelsall" / gold accent) baked into the sidebar and home banner, even though the site is multi-tenant — each user belongs to a `home_tree` (a different family line/surname). Logged-in users from other trees (Warfel, Flannigan, Hubber, etc.) see "Kelsall Family Portal" and a gold theme that has nothing to do with their own family. The goal is for the app to feel like it was built for *that* user's family: their surname in the title/banner, and their tree's color as the accent.

## Scope

In scope:
- Sidebar brand title (`sb-brand`, app.js ~L327-330) and the home page hero banner's fallback "welcome" text (app.js ~L955-963) reflect the logged-in user's `home_tree.name`.
- The app's accent color (buttons, links, focus rings, sidebar logo, home banner accent text) is recolored to the user's `home_tree.color`.

Out of scope:
- The sidebar shell's dark-green background — core app chrome, not per-family.
- The hero card's diagonal texture overlay — stays neutral gold-tinted; subtle enough not to clash with any accent color.
- The pre-login rolling-surname brand on the sign-in screen — intentionally shows multiple families, unrelated to a specific logged-in user.
- Any change to how `trees.color` is chosen/edited (existing admin tree-editor color picker is unchanged).

## Data flow

`home_tree` is a relation on `users`, currently fetched as a bare ID (no expand) at `auth-refresh` time. Rather than adding `expand=home_tree` to every place `currentUser` is (re)assigned, `_launchAppShell()` (app.js:249) fetches the tree record once per session, in parallel with the existing `refreshUnread()`/`refreshPending()`/`loadBranchAdminState()` calls:

```js
async function loadHomeTreeTheme(){
  currentHomeTree = null;
  if (currentUser && currentUser.home_tree) {
    try {
      const res = await apiFetch(`/api/collections/trees/records/${currentUser.home_tree}`);
      if (res.ok) currentHomeTree = await res.json();
    } catch { /* fall back to default branding */ }
  }
  applyHomeTreeTheme(currentHomeTree);
}
```

`currentHomeTree` is a new module-level global (alongside `currentUser`, `currentAdminTrees`, etc.), holding `{ name, color, ... }` or `null`. `loadHomeTreeTheme()` is added to the `Promise.all([...])` in `_launchAppShell()`, before `renderSidebar()` runs (so the sidebar's first render already has the right name/color, no flash of default branding).

If the user has no `home_tree` yet (not yet claimed/approved-linked to a person), `currentHomeTree` stays `null` and every consumer below falls back to today's existing generic text/gold theme.

## Text changes

**Sidebar** (`renderSidebar()`, app.js:309-337): the hardcoded `K` logo letter and `Kelsall` name become:

```js
const treeName = currentHomeTree ? currentHomeTree.name : null;
const logoLetter = treeName ? treeName[0].toUpperCase() : 'K';
// ...
<div class="sb-logo">${logoLetter}</div>
<div><div class="name">${esc(treeName || 'Kelsall')}</div><div class="sub">Family Portal</div></div>
```

The `Family Portal` subtitle is unchanged, so the combined visual reads `"<Surname> Family Portal"`.

**Home banner** (`SCREENS.home`, app.js ~955-963): the no-upcoming-event fallback card's `rh-name` text changes from the literal `"Kelsall Family"` to:

```js
`${esc(currentHomeTree ? currentHomeTree.name : 'Kelsall')} Family`
```

The has-upcoming-event variant (app.js ~937-954) already shows the event name in that slot, not a family name — no change needed there.

## Accent color theming

Most of the app already reads accent color from CSS custom properties (`--accent-gold`, `--accent-gold-hover`, `--border-focus`, `--focus-shadow`) rather than hardcoding hex values in each rule. Overriding these four properties on `:root` at theme-apply time therefore recolors buttons, links, focus rings, the sidebar logo, and the home banner's label/countdown numbers automatically, with no further CSS changes required for those.

### New CSS variable: `--accent-fg`

About 10 existing rules pair an accent-gold *background* with a **hardcoded** foreground text color for contrast (`color:#fff` or `color:var(--bg-sidebar)`), rather than a variable:

- `.btn-gold` (app.css:47)
- `.pill` (app.css:97)
- `.sb-logo` (app.css:140-142: `background:var(--accent-gold);color:var(--bg-sidebar)`)
- `.sb-badge` (app.css:154-155: same pairing, the nav unread-count badge)
- `.tn-leaf-btn:hover` / `.tn-leaf-btn.col` (app.css:322-323)
- `.tn-add-btn:hover` (app.css:326)
- `.tn-more:hover` (app.css:330)
- `.tc-btn:hover` (app.css:337)
- `.tree-view-btn.active` (app.css:360)
- `.tn-horiz-caret:hover` (app.css:366)
- avatar-style badge at app.css:422

Additionally, `.sb-item.active` (app.css:151, the active sidebar nav-item highlight) uses a hardcoded `rgba(200,149,42,.18)` background rather than `var(--accent-gold)` — directly in scope since it's the "active nav state" called out in the approved design. This one needs an `rgba(...)` derived from the tree color (via a new `hexToRgba` helper, see below) rather than the `--accent-fg` swap, since its foreground text (`var(--text-sidebar-active)`) is already theme-agnostic and doesn't need to change — only the tinted background does.

If a tree's chosen color is dark, a hardcoded dark foreground (`var(--bg-sidebar)`) on top of it becomes unreadable. Fix: add a new variable `--accent-fg` (default `var(--bg-sidebar)`, matching current behavior for the default gold), and swap the hardcoded foreground colors in the rules above to `var(--accent-fg)`. `--accent-fg` is computed at theme-apply time from the tree color's relative luminance — light text (`#f4f1ea`, matching `--text-sidebar-active`) if the color is dark, dark text (`#1f2d27`, matching `--bg-sidebar`) if it's light.

`.tn-branch:hover`/`.tn-branch.expanded` (app.css:291-292) already use `var(--tc, var(--accent-gold))` with a hardcoded `color:#fff` — these represent a *different* person's tree color (per-node, set inline via `--tc` in the tree view), not the logged-in user's own theme, so they're left as-is; only the `--accent-gold` fallback portion is affected by this change, and it already assumes light text today, same as after this change in the common case.

### Hover shade and helpers

`--accent-gold-hover` needs a darker shade of the tree's color (mirroring today's `#c8952a` → `#a87a22` relationship). Two small pure functions are added to `helpers.js` (importable in Node, unit-tested like the existing `avatarTint`):

- `darkenHex(hex, amount)` — darkens a hex color by a fixed percentage, used for the hover shade.
- `contrastForeground(hex)` — returns a light or dark foreground hex based on the input color's relative luminance, used for `--accent-fg`.
- `hexToRgba(hex, alpha)` — converts a hex color to an `rgba(...)` string at the given alpha, used for `--focus-shadow` and the new `--sb-item-active-bg`.

`.sb-item.active`'s hardcoded `rgba(200,149,42,.18)` is replaced with `var(--sb-item-active-bg)`, a new variable defaulting to that same value and set via `hexToRgba(color, 0.18)` at theme-apply time.

### Applying the theme

```js
const DEFAULT_THEME = { accentGold: '#c8952a', accentGoldHover: '#a87a22', accentFg: 'var(--bg-sidebar)' };

function applyHomeTreeTheme(tree){
  const color = tree && tree.color;
  const root = document.documentElement.style;
  if (!color) {
    root.setProperty('--accent-gold', DEFAULT_THEME.accentGold);
    root.setProperty('--accent-gold-hover', DEFAULT_THEME.accentGoldHover);
    root.setProperty('--accent-fg', DEFAULT_THEME.accentFg);
    root.setProperty('--border-focus', DEFAULT_THEME.accentGold);
    root.setProperty('--focus-shadow', 'rgba(200,149,42,.12)');
    root.setProperty('--sb-item-active-bg', 'rgba(200,149,42,.18)');
    return;
  }
  root.setProperty('--accent-gold', color);
  root.setProperty('--accent-gold-hover', darkenHex(color, 0.18));
  root.setProperty('--accent-fg', contrastForeground(color));
  root.setProperty('--border-focus', color);
  root.setProperty('--focus-shadow', hexToRgba(color, 0.12));
  root.setProperty('--sb-item-active-bg', hexToRgba(color, 0.18));
}
```

`applyHomeTreeTheme` always sets every property explicitly (never conditionally skips), so switching accounts within the same tab (logout → login as a different user) can't leave a stale color from the previous session.

## Fallback / edge cases

- No `home_tree` (new/unclaimed user) → today's default gold theme and generic "Family Portal"/"Kelsall Family" text, unchanged. No error, no flash of wrong color.
- Trunk admins (`family_admin=true`) get their own home tree's branding like any other user — no special-cased neutral/admin theme. They administer all trees but this only themes their own personal view.
- `home_tree` fetch failure (network error, tree deleted) → caught, falls back to default theme, same as "no home_tree."

## Testing

- `darkenHex`, `contrastForeground`, and `hexToRgba` get unit tests in `helpers.test.js` (`node --test helpers.test.js`), covering: a known light color, a known dark color, and a boundary-ish mid-gray.
- Manual verification (no backend changes, so no need for the disposable-PocketBase-image flow): log in as users with different `home_tree` values (or temporarily edit a test account's `home_tree` in dev) and confirm sidebar title, home banner text, button/link/focus colors, and sidebar logo all reflect that tree's name/color; confirm a user with no `home_tree` still sees the default gold "Kelsall Family Portal" branding.
