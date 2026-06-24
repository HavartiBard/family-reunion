# Tree View Modes: Horizontal & Fan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Horizontal (pedigree) and Fan (radial) view modes to the existing Family Tree screen, selectable via a mode switcher in the header.

**Architecture:** Three render functions — existing `tpRender()`, new `tpRenderHorizontal()`, new `tpRenderFan()` — all dispatched from a new `tpRenderAll()`. All three share `_tS.persons` (already fetched), the `#tree-inner` container, and the existing pan/zoom/drag system. No new API calls or data models.

**Tech Stack:** Vanilla JS, SVG, raw CSS — no build step, no bundler. Tests: Node built-in runner (`node --test`). Browser testing against `python3 -m http.server 8080` in the project root.

## Global Constraints

- No bundler, no npm, no build step — edit `app.js`, `app.css`, `index.html` directly
- Card dimensions: `_TW = 160`, `_TH = 88`, `_THG = 28`, `_TVG = 100` — do not change
- All `_tS.*` state is module-level; functions that mutate it must call `tpRenderAll()` (not `tpRender()`) to re-render
- Context menu for all view modes: call existing `tpNodeClick(e, id)` for card clicks; fan needs a wrapper `tpFanClick(e, id)` that positions the menu by click coordinates
- `tpRenderSelector()` must be called at the end of every render function — it populates `#tree-selector`
- `_tS._offset = {ox, oy, cW, cH}` must be set by every render function — used by `tpCenterFocus()` and `tpRenderPreserveViewport()`
- `localStorage` key for mode persistence: `treeViewMode`

---

## File Map

| File | Changes |
|------|---------|
| `app.js` | Add `viewMode`/`horizExpanded` to `_tS`; add `tpRenderAll()`, `tpSetViewMode()`, `tpRenderHorizontal()`, `tpComputeHorizLayout()`, `tpHorizToggleExpand()`, `tpRenderFan()`, `tpFanClick()`; update `tpCenterFocus()`; replace 8 `tpRender()` call sites with `tpRenderAll()` |
| `app.css` | Add `.tree-view-switcher`, `.tree-view-btn`, `.tn-horiz-caret`, `.fan-svg` classes |
| `index.html` | No changes needed |

---

## Task 1: Mode switcher — state, dispatcher, UI, CSS

**Files:**
- Modify: `app.js:1075-1088` (`_tS` object)
- Modify: `app.js:1131-1156` (`SCREENS.tree` HTML)
- Modify: `app.js:1179` (`tpLoad` — clear `horizExpanded`)
- Modify: `app.js:2088-2095` (`tpCenterFocus`)
- Modify: `app.js:2109` (`tpRenderPreserveViewport`)
- Modify: 7 other `tpRender()` call sites (lines 1211, 1968, 1973, 2055, 2064, 2070, 2079)
- Modify: `app.css` — add switcher styles after line 312

**Interfaces:**
- Produces: `tpRenderAll()` — dispatches to correct renderer based on `_tS.viewMode`
- Produces: `tpSetViewMode(mode)` — updates state, persists to localStorage, re-renders
- Produces: `_tS.viewMode` (`'standard'|'horizontal'|'fan'`) and `_tS.horizExpanded` (`Set<string>`) available to all renderers

- [ ] **Step 1: Add `viewMode` and `horizExpanded` to `_tS`**

In `app.js`, find the `_tS` object (line 1075). Add two new fields:

```js
const _tS = {
  persons: new Map(), childrenOf: new Map(),
  focusId: null, focusPartners: [], partnersOf: new Map(),
  collapsed: new Set(),
  descCollapsed: new Set(),
  siblings: [], sibsCollapsed: false, siblingCouples: new Map(),
  ancSiblings: new Map(),
  ancSibsCollapsed: new Set(),
  expandedRelated: new Set(),
  trees: [], storedTrees: [], activeTree: null,
  pan: {x:0,y:0}, zoom: 1,
  dragging: false, dragLast: {x:0,y:0},
  ctxId: null, _offset: null, loading: false,
  viewMode: localStorage.getItem('treeViewMode') || 'standard',
  horizExpanded: new Set(),
};
```

- [ ] **Step 2: Add `tpRenderAll()` and `tpSetViewMode()` after `tpRender()` ends (after line 1963)**

```js
function tpRenderAll(){
  if (_tS.viewMode === 'horizontal') tpRenderHorizontal();
  else if (_tS.viewMode === 'fan') tpRenderFan();
  else tpRender();
}

function tpSetViewMode(mode){
  _tS.viewMode = mode;
  localStorage.setItem('treeViewMode', mode);
  document.querySelectorAll('.tree-view-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  tpRenderAll();
  tpCenterFocus();
}
```

- [ ] **Step 3: Add mode switcher HTML to `SCREENS.tree`**

Find the `SCREENS.tree` function (line 1131). The `.tree-hdr-right` div currently reads:
```js
      <div class="tree-hdr-right">
        <div id="tree-selector" class="tree-selector"></div>
        <button class="btn btn-outline btn-sm" onclick="openPersonForm()">+ Add person</button>
      </div>
```

Replace it with:
```js
      <div class="tree-hdr-right">
        <div class="tree-view-switcher">
          <button class="tree-view-btn${_tS.viewMode==='standard'?' active':''}" data-mode="standard" onclick="tpSetViewMode('standard')" title="Standard tree">⧉ Standard</button>
          <button class="tree-view-btn${_tS.viewMode==='horizontal'?' active':''}" data-mode="horizontal" onclick="tpSetViewMode('horizontal')" title="Horizontal pedigree">↦ Horizontal</button>
          <button class="tree-view-btn${_tS.viewMode==='fan'?' active':''}" data-mode="fan" onclick="tpSetViewMode('fan')" title="Fan chart">◉ Fan</button>
        </div>
        <div id="tree-selector" class="tree-selector"></div>
        <button class="btn btn-outline btn-sm" onclick="openPersonForm()">+ Add person</button>
      </div>
```

Note: the template literal is already inside a template literal in `mountMain(...)`. The `_tS.viewMode` reference works because `_tS` is module-level.

- [ ] **Step 4: Clear `horizExpanded` in `tpLoad`**

Find `tpLoad` around line 1179. After the `.clear()` calls add:
```js
_tS.horizExpanded.clear();
```

The block looks like:
```js
_tS.persons.clear(); _tS.childrenOf.clear(); _tS.focusPartners = []; _tS.partnersOf.clear();
_tS.siblings = []; _tS.sibsCollapsed = false; _tS.siblingCouples = new Map();
_tS.ancSiblings.clear();
_tS.ancSibsCollapsed.clear();
_tS.expandedRelated.clear();
_tS.horizExpanded.clear();  // add this line
```

- [ ] **Step 5: Update `tpCenterFocus()` to handle all three modes**

Replace the existing `tpCenterFocus` function (lines 2088-2096):

```js
function tpCenterFocus(){
  const vp = el('tree-vp'); if (!vp || !_tS._offset) return;
  const {ox, oy, cW, cH} = _tS._offset;
  const vpW = vp.clientWidth, vpH = vp.clientHeight;
  if (_tS.viewMode === 'fan'){
    // fan center (focal circle) is at (ox, oy) in layout space — center it at bottom-middle of viewport
    _tS.zoom = Math.max(0.15, Math.min(1.5, (vpW - 40) / cW, (vpH - 40) / cH));
    _tS.pan.x = vpW/2 - ox * _tS.zoom;
    _tS.pan.y = vpH - 20 - oy * _tS.zoom;
  } else if (_tS.viewMode === 'horizontal'){
    // focus card is at layout (0, cH/2 - TH/2); center it vertically, pin left edge to ~20px
    _tS.zoom = Math.max(0.15, Math.min(1, (vpH - 80) / cH));
    _tS.pan.x = 20 - (ox - _TW) * _tS.zoom;
    _tS.pan.y = vpH/2 - (cH/2) * _tS.zoom;
  } else {
    _tS.zoom = Math.max(0.2, Math.min(1, (vpW-80)/cW, (vpH-80)/cH));
    _tS.pan.x = vpW/2 - (ox+_TW/2)*_tS.zoom;
    _tS.pan.y = vpH/2 - (oy+_TH/2)*_tS.zoom;
  }
  tpApplyTransform();
}
```

- [ ] **Step 6: Replace all 8 `tpRender()` call sites with `tpRenderAll()`**

Make these exact replacements in `app.js`:

| Line | Old | New |
|------|-----|-----|
| 1211 | `tpRender(); tpCenterFocus();` | `tpRenderAll(); tpCenterFocus();` |
| 1968 | `_computeTrees(); tpRender(); return;` | `_computeTrees(); tpRenderAll(); return;` |
| 1973 | `_computeTrees(); tpRender();` | `_computeTrees(); tpRenderAll();` |
| 2055 | `tpRender();` (after `toast(...)`) | `tpRenderAll();` |
| 2064 | `tpRender();` (after `toast(...)`) | `tpRenderAll();` |
| 2070 | `if (!surname){ tpRender(); return; }` | `if (!surname){ tpRenderAll(); return; }` |
| 2079 | `if (!candidates.length){ tpRender(); return; }` | `if (!candidates.length){ tpRenderAll(); return; }` |
| 2109 | `tpRender();` (inside `tpRenderPreserveViewport`) | `tpRenderAll();` |

- [ ] **Step 7: Add CSS for switcher and future caret/fan classes**

In `app.css`, append after the `@media (max-width:767px)` block at line 312 (before `/* ── Events */`):

```css
/* Tree view mode switcher */
.tree-view-switcher{display:flex;border:1.5px solid var(--border-input);border-radius:9px;overflow:hidden;flex-shrink:0}
.tree-view-btn{height:32px;padding:0 11px;font-size:.78rem;font-weight:600;background:transparent;
  border:none;border-right:1px solid var(--border-input);cursor:pointer;color:var(--text-muted);
  transition:background .15s,color .15s;white-space:nowrap}
.tree-view-btn:last-child{border-right:none}
.tree-view-btn:hover:not(.active){background:var(--bg-hover);color:var(--text-primary)}
.tree-view-btn.active{background:var(--accent-gold);color:#fff}
/* Horizontal pedigree caret */
.tn-horiz-caret{position:absolute;width:18px;height:18px;border-radius:4px;
  border:1.5px solid var(--border-default);background:#f5f2ec;
  font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  color:var(--text-muted);transition:background .12s,border-color .12s;padding:0;z-index:5}
.tn-horiz-caret:hover{background:var(--accent-gold);color:#fff;border-color:var(--accent-gold)}
/* Fan chart */
.fan-svg{display:block}
```

- [ ] **Step 8: Start the dev server and verify Standard mode still works**

```bash
cd /home/james/projects/family-reunion && python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser. Navigate to the Tree tab. Verify:
- Three-button switcher appears in the header (Standard, Horizontal, Fan)
- Standard mode is active by default (or restores from localStorage)
- Standard tree renders and behaves exactly as before (pan, zoom, click, focus)
- Clicking "Horizontal" and "Fan" renders an empty state or no crash (they don't exist yet)

- [ ] **Step 9: Commit**

```bash
git add app.js app.css
git commit -m "feat(tree): add view mode switcher infrastructure and tpRenderAll dispatcher"
```

---

## Task 2: Horizontal pedigree tree

**Files:**
- Modify: `app.js` — add `tpComputeHorizLayout()`, `tpRenderHorizontal()`, `tpHorizToggleExpand()` after the `tpRenderAll` block from Task 1

**Interfaces:**
- Consumes: `_tS.persons` (Map), `_tS.focusId`, `_tS.horizExpanded` (Set), `_tS.collapsed`
- Consumes: `_TW`, `_TH`, `_THG`, `_TVG`, `_treeColorFor()`, `avatarTint()`, `personInitials()`, `personYears()`, `esc()`, `API`
- Consumes: `tpNodeClick(e, id)`, `tpRenderSelector()`, `tpFetchUp(id, depth)`
- Produces: `tpRenderHorizontal()` — called by `tpRenderAll()` when `viewMode === 'horizontal'`
- Produces: `tpHorizToggleExpand(e, id)` — called by `.tn-horiz-caret` `onclick`
- Sets: `_tS._offset = {ox, oy, cW, cH}`

- [ ] **Step 1: Add `tpComputeHorizLayout()` to `app.js`**

Add this function after the `tpSetViewMode` function from Task 1:

```js
function tpComputeHorizLayout(){
  const nodes = [], edges = [];
  const COL_W = _TW + _THG;
  const SLOT_H = _TH + _TVG;

  // Stop expanding ancestors of `id` at `depth` if it's a generation boundary and not manually expanded
  function isBoundary(id, depth){
    return depth > 0 && depth % 3 === 0 && !_tS.horizExpanded.has(id);
  }

  // Count the leaf slots (minimum 1) needed to render `id`'s ancestor subtree from `depth`
  function leafCount(id, depth){
    if (!id) return 0;
    const p = _tS.persons.get(id);
    if (!p || isBoundary(id, depth)) return 1;
    const f = p.father ? leafCount(p.father, depth+1) : 0;
    const m = p.mother ? leafCount(p.mother, depth+1) : 0;
    return Math.max(f + m, 1);
  }

  // Place `id` at `depth`, occupying vertical range [topY, topY+spanH]
  function placeNode(id, depth, topY, spanH){
    const p = id ? _tS.persons.get(id) : null;
    const x = depth * COL_W;
    const y = topY + spanH/2 - _TH/2;
    const midY = y + _TH/2;
    const cx = x + _TW/2;

    if (p){
      const showCaret = isBoundary(id, depth) && !!(p.father || p.mother);
      nodes.push({id, x, y, person:p, role:depth===0?'focus':'anc', d:depth,
        relDepth:-depth, path:[], showCaret, caretExpanded:_tS.horizExpanded.has(id)});
    }

    if (!p || !id || isBoundary(id, depth)) return;

    const fCount = p.father ? leafCount(p.father, depth+1) : 0;
    const mCount = p.mother ? leafCount(p.mother, depth+1) : 0;
    const total = fCount + mCount;
    if (!total) return;

    const busX = (depth+1)*COL_W - _THG/2;
    // Horizontal from this node's right to the vertical bus
    edges.push({x1:cx, y1:midY, x2:busX, y2:midY, type:'horiz-line'});

    let curY = topY;
    if (p.father && fCount){
      const fSpan = (fCount/total)*spanH;
      const fMidY = curY + fSpan/2;
      edges.push({x1:busX, y1:midY, x2:busX, y2:fMidY, type:'horiz-line'});
      edges.push({x1:busX, y1:fMidY, x2:(depth+1)*COL_W, y2:fMidY, type:'horiz-line'});
      placeNode(p.father, depth+1, curY, fSpan);
      curY += fSpan;
    }
    if (p.mother && mCount){
      const mSpan = (mCount/total)*spanH;
      const mMidY = curY + mSpan/2;
      edges.push({x1:busX, y1:midY, x2:busX, y2:mMidY, type:'horiz-line'});
      edges.push({x1:busX, y1:mMidY, x2:(depth+1)*COL_W, y2:mMidY, type:'horiz-line'});
      placeNode(p.mother, depth+1, curY, mSpan);
    }
  }

  const totalLeaves = Math.max(leafCount(_tS.focusId, 0), 1);
  const totalH = totalLeaves * SLOT_H;
  placeNode(_tS.focusId, 0, 0, totalH);
  return {nodes, edges, totalH};
}
```

- [ ] **Step 2: Add `tpRenderHorizontal()` and `tpHorizToggleExpand()` to `app.js`**

Add directly after `tpComputeHorizLayout`:

```js
function tpRenderHorizontal(){
  const inner = el('tree-inner'); if (!inner) return;
  const {nodes, edges, totalH} = tpComputeHorizLayout();
  if (!nodes.length){
    inner.innerHTML = '<div class="empty-state" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><div style="font-size:3rem">🌱</div><p>No relatives yet.</p></div>';
    return;
  }

  const PAD = 60;
  const minX = -PAD;
  const maxX = Math.max(...nodes.map(n => n.x + _TW)) + PAD;
  const minY = Math.min(...nodes.map(n => n.y)) - PAD;
  const maxY = Math.max(...nodes.map(n => n.y + _TH)) + PAD;
  const cW = maxX - minX, cH = maxY - minY;
  const ox = -minX, oy = -minY;
  _tS._offset = {ox, oy, cW, cH};

  // SVG connector lines
  let svg = '';
  for (const e of edges){
    const x1=e.x1+ox, y1=e.y1+oy, x2=e.x2+ox, y2=e.y2+oy;
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#c4bba8" stroke-width="2" stroke-linecap="round"/>`;
  }

  let html = `<svg class="tree-svg" width="${cW}" height="${cH}" viewBox="0 0 ${cW} ${cH}">${svg}</svg>`;

  for (const n of nodes){
    const p = n.person;
    const nx = n.x + ox, ny = n.y + oy;
    const isFocus = n.id === _tS.focusId;
    const years = personYears(p);
    const treeSurname = p.birth_surname || p.family_name;
    const treeColor = _treeColorFor(treeSurname) || _treeColorFor(p.family_name);
    const tintSeed = String(p.id || n.id || '0');
    const bandColor = treeColor || avatarTint(tintSeed.charCodeAt(0) % 6);
    const photoUrl = p.photo && p.id ? `${API}/api/files/persons/${p.id}/${p.photo}?thumb=80x88` : '';
    const av = photoUrl
      ? `<div class="tn-av-band" style="background:${bandColor}"><img class="tn-av-band-img" src="${photoUrl}" alt="" loading="lazy"></div>`
      : `<div class="tn-av-band" style="background:${bandColor}">${personInitials(p)}</div>`;
    const tcStyle = treeColor ? `;--tc:${treeColor}` : '';
    const cls = ['tn-card', isFocus?'focus':'', n.role==='anc'?'anc':''].filter(Boolean).join(' ');
    html += `<div class="${cls}" style="left:${nx}px;top:${ny}px${tcStyle}" onclick="tpNodeClick(event,'${n.id}')">
      ${av}<div class="tn-info"><div class="tn-name">${esc(p.display_name)}</div>${years?`<div class="tn-years">${esc(years)}</div>`:''}</div>
    </div>`;
    if (n.showCaret){
      const icon = n.caretExpanded ? '‹' : '›';
      html += `<button class="tn-horiz-caret" style="left:${(nx+_TW-9).toFixed(0)}px;top:${(ny+_TH/2-9).toFixed(0)}px"
        onclick="tpHorizToggleExpand(event,'${n.id}')" title="${n.caretExpanded?'Collapse':'Expand'} ancestors">${icon}</button>`;
    }
  }

  inner.style.cssText = `width:${cW}px;height:${cH}px;position:relative`;
  inner.innerHTML = html;
  tpRenderSelector();
}

async function tpHorizToggleExpand(e, id){
  e.stopPropagation();
  if (_tS.horizExpanded.has(id)){
    _tS.horizExpanded.delete(id);
    tpRenderHorizontal();
    return;
  }
  await tpFetchUp(id, 0); // fetch 3 more ancestor generations for this branch
  _tS.horizExpanded.add(id);
  tpRenderHorizontal();
}
```

- [ ] **Step 3: Test horizontal mode in browser**

With the dev server running at `http://localhost:8080`:
1. Navigate to the Tree tab
2. Click "↦ Horizontal"
3. Verify the focus person's card appears on the left side, vertically centered
4. Verify parent, grandparent, and great-grandparent cards appear in columns to the right
5. Verify horizontal bracket lines connect each generation
6. Verify `›` caret appears on great-grandparent cards that have parents in the database
7. Click a `›` caret — verify it shows a spinner briefly then expands 3 more generations
8. Click `‹` on an expanded node — verify it collapses back
9. Click a card — verify the context menu appears with the correct options
10. Verify zoom/pan/drag still work
11. Switch back to Standard mode — verify it returns to the standard tree correctly

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(tree): add horizontal pedigree view with 3-generation expand toggle"
```

---

## Task 3: Fan chart view

**Files:**
- Modify: `app.js` — add `fanSector()`, `tpRenderFan()`, `tpFanClick()` after `tpHorizToggleExpand`

**Interfaces:**
- Consumes: `_tS.persons`, `_tS.focusId`
- Consumes: `_treeColorFor()`, `personYears()`, `esc()`, `tpAddAncestor()`, `tpNodeClick()`
- Produces: `tpRenderFan()` — called by `tpRenderAll()` when `viewMode === 'fan'`
- Produces: `tpFanClick(e, id)` — positions context menu using clientX/Y (not element bounding rect)
- Sets: `_tS._offset = {ox, oy, cW, cH}` where (ox, oy) is the fan center in SVG coordinates

- [ ] **Step 1: Add geometry helpers and `tpRenderFan()` to `app.js`**

Add after `tpHorizToggleExpand`:

```js
// Compute SVG arc path for an annulus sector.
// Angles in math convention: 0°=right, 90°=up, 180°=left (y-axis is flipped for SVG).
function _fanSector(cx, cy, r1, r2, startDeg, endDeg){
  const pt = (r, deg) => {
    const rad = deg * Math.PI / 180;
    return [cx + r*Math.cos(rad), cy - r*Math.sin(rad)];
  };
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [isx, isy] = pt(r1, startDeg);
  const [iex, iey] = pt(r1, endDeg);
  const [osx, osy] = pt(r2, startDeg);
  const [oex, oey] = pt(r2, endDeg);
  const f = v => v.toFixed(2);
  // Inner arc CCW in screen (sweep=0), outer arc CW back (sweep=1)
  return `M${f(isx)},${f(isy)} A${r1},${r1} 0 ${large} 0 ${f(iex)},${f(iey)} L${f(oex)},${f(oey)} A${r2},${r2} 0 ${large} 1 ${f(osx)},${f(osy)} Z`;
}

// x,y of the visual center of an annulus sector
function _fanSectorCenter(cx, cy, r1, r2, startDeg, endDeg){
  const mid = (startDeg + endDeg) / 2;
  const r = (r1 + r2) / 2;
  const rad = mid * Math.PI / 180;
  return {x: cx + r*Math.cos(rad), y: cy - r*Math.sin(rad), midAngle: mid};
}

function tpRenderFan(){
  const inner = el('tree-inner'); if (!inner) return;
  const vp = el('tree-vp');
  if (!vp){ inner.innerHTML=''; return; }
  const vpW = vp.clientWidth || 800, vpH = vp.clientHeight || 600;

  // Sizing: outer radius fills viewport, divided into equal rings
  const R = Math.min(vpW / 2, vpH) * 0.88;
  const R0 = Math.min(R * 0.13, 58);      // focal circle radius
  const ringW = (R - R0) / 3;
  const r = [R0, R0+ringW, R0+2*ringW, R];  // r[0]=focal, r[1]=parents outer, r[2]=gp outer, r[3]=ggp outer

  // SVG dimensions: fan spans (2R wide, R tall) plus padding
  const PAD = 20;
  const svgW = 2*R + PAD*2, svgH = R + R0 + PAD*2;
  // Fan center (focal circle center) in SVG coordinates
  const cx = svgW / 2, cy = svgH - R0 - PAD;

  _tS._offset = {ox: cx, oy: cy, cW: svgW, cH: svgH};

  // Colors for paternal (left) and maternal (right) halves
  const PATERNAL_TINT = 'rgba(100,140,180,0.18)';
  const MATERNAL_TINT = 'rgba(200,130,110,0.18)';

  // Build ancestor map: slot at each depth
  // depth 1: father=slot 0 (90°-180°), mother=slot 1 (0°-90°)
  // depth d, slot s: startDeg = 180 - (s+1)*(180/2^d), endDeg = 180 - s*(180/2^d)
  // i.e. slots go right-to-left (slot 0 is leftmost = paternal)
  function slotAngles(depth, slot){
    const total = Math.pow(2, depth);
    const step = 180 / total;
    const startDeg = 180 - (slot+1)*step;
    const endDeg = 180 - slot*step;
    return {startDeg, endDeg};
  }

  // Walk the ancestor tree, collecting {person, depth, slot, startDeg, endDeg}
  const entries = [];
  function walk(id, depth, slot){
    if (depth > 3) return;
    const {startDeg, endDeg} = slotAngles(depth, slot);
    const p = id ? _tS.persons.get(id) : null;
    entries.push({id, person:p, depth, slot, startDeg, endDeg});
    if (depth >= 3) return;
    // Walk father (left half) and mother (right half)
    if (p && p.father) walk(p.father, depth+1, slot*2);
    else entries.push({id:`ph:${id}:father`, person:null, depth:depth+1, slot:slot*2,
      ...slotAngles(depth+1, slot*2), placeholder:true, placeholderRole:'father', childId:id});
    if (p && p.mother) walk(p.mother, depth+1, slot*2+1);
    else entries.push({id:`ph:${id}:mother`, person:null, depth:depth+1, slot:slot*2+1,
      ...slotAngles(depth+1, slot*2+1), placeholder:true, placeholderRole:'mother', childId:id});
  }

  const focusPerson = _tS.persons.get(_tS.focusId);

  // Populate entries for all 3 ancestor generations
  if (focusPerson){
    if (focusPerson.father) walk(focusPerson.father, 1, 0);
    else entries.push({id:`ph:${_tS.focusId}:father`, person:null, depth:1, slot:0,
      ...slotAngles(1,0), placeholder:true, placeholderRole:'father', childId:_tS.focusId});
    if (focusPerson.mother) walk(focusPerson.mother, 1, 1);
    else entries.push({id:`ph:${_tS.focusId}:mother`, person:null, depth:1, slot:1,
      ...slotAngles(1,1), placeholder:true, placeholderRole:'mother', childId:_tS.focusId});
  }

  let svg = `<svg class="fan-svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`;

  // Draw sectors
  for (const e of entries){
    const inner_r = r[e.depth-1], outer_r = r[e.depth];
    const isLeft = (e.startDeg + e.endDeg) / 2 > 90; // paternal side
    const fill = e.placeholder
      ? 'rgba(240,236,228,0.6)'
      : isLeft ? PATERNAL_TINT : MATERNAL_TINT;
    const stroke = e.placeholder ? '#cdbfa8' : '#c4bba8';
    const strokeDash = e.placeholder ? '4 3' : 'none';
    const path = _fanSector(cx, cy, inner_r, outer_r, e.startDeg, e.endDeg);
    const clickAttr = e.placeholder
      ? `onclick="tpAddAncestor('${e.childId}','${e.placeholderRole}')"`
      : `onclick="tpFanClick(event,'${e.id}')"`; 
    svg += `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${strokeDash}" cursor="pointer" ${clickAttr}/>`;

    // Text label inside sector
    if (e.person || e.placeholder){
      const {x: tx, y: ty, midAngle} = _fanSectorCenter(cx, cy, inner_r, outer_r, e.startDeg, e.endDeg);
      const name = e.person ? e.person.display_name : (e.placeholderRole==='father'?'Add father':'Add mother');
      const years = e.person ? personYears(e.person) : '';
      const arcLen = (outer_r - inner_r === 0 ? 0 : ((e.endDeg - e.startDeg) * Math.PI / 180) * ((inner_r + outer_r)/2));
      const showYears = arcLen > 80 && years;
      const rot = midAngle - 90; // rotate text to follow arc tangent
      const fs = e.depth === 3 ? 9 : e.depth === 2 ? 10 : 12;
      svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central"
        font-family="Schibsted Grotesk,system-ui,sans-serif" font-size="${fs}" font-weight="600" fill="${e.placeholder?'#b0a898':'#3d3427'}"
        transform="rotate(${rot.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)})" pointer-events="none">
        <tspan x="${tx.toFixed(1)}" dy="0">${esc(name.length > 18 ? name.slice(0,16)+'…' : name)}</tspan>
        ${showYears?`<tspan x="${tx.toFixed(1)}" dy="${fs+2}" font-size="${fs-1}" fill="#8a8070">${esc(years)}</tspan>`:''}
      </text>`;
    }
  }

  // Focal person circle
  if (focusPerson){
    const years = personYears(focusPerson);
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R0}" fill="#fffaf0" stroke="var(--accent-gold)" stroke-width="2" cursor="pointer" onclick="tpFanClick(event,'${_tS.focusId}')"/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(cy - (years?8:0)).toFixed(1)}" text-anchor="middle" dominant-baseline="central"
      font-family="Schibsted Grotesk,system-ui,sans-serif" font-size="11" font-weight="700" fill="#3d3427" pointer-events="none">
      ${esc(focusPerson.display_name.length>14?focusPerson.display_name.slice(0,12)+'…':focusPerson.display_name)}
    </text>`;
    if (years) svg += `<text x="${cx.toFixed(1)}" y="${(cy+12).toFixed(1)}" text-anchor="middle" dominant-baseline="central"
      font-family="Schibsted Grotesk,system-ui,sans-serif" font-size="9" fill="#8a8070" pointer-events="none">${esc(years)}</text>`;
  }

  // Outer dashed arc indicating more ancestors may exist
  svg += `<path d="M${(cx-R).toFixed(1)},${cy.toFixed(1)} A${R},${R} 0 0 0 ${(cx+R).toFixed(1)},${cy.toFixed(1)}"
    fill="none" stroke="#c4bba8" stroke-width="1" stroke-dasharray="4 4" opacity="0.5" pointer-events="none"/>`;

  svg += `</svg>`;

  inner.style.cssText = `width:${svgW}px;height:${svgH}px;position:relative`;
  inner.innerHTML = svg;
  tpRenderSelector();
}

function tpFanClick(e, id){
  e.stopPropagation();
  // Build a synthetic currentTarget with a bounding rect from click position so tpNodeClick can position the menu
  const vp = el('tree-vp'); if (!vp) return;
  const vr = vp.getBoundingClientRect();
  // Fake element bounding rect centered on click point
  const fake = {
    getBoundingClientRect: () => ({
      left: e.clientX - 80, right: e.clientX + 80,
      top: e.clientY - 20, bottom: e.clientY + 4,
      width: 160, height: 24,
    }),
  };
  // Temporarily replace currentTarget via a proxy call
  const synth = {currentTarget: fake, stopPropagation: ()=>{}, ...e};
  tpNodeClick(synth, id);
}
```

- [ ] **Step 2: Test fan mode in browser**

With the dev server running at `http://localhost:8080`:
1. Navigate to Tree tab
2. Click "◉ Fan"
3. Verify the focal person appears in a circle at the bottom-center of the fan
4. Verify 3 concentric arc rings fan upward with ancestors
5. Verify left half (paternal) has a blue-tinted background, right half has peach tint
6. Verify missing ancestors show as placeholder sectors with dashed strokes and "Add father/Add mother" labels
7. Verify text in each sector is rotated to follow the arc and is legible
8. Verify generation-3 (outer ring) sectors show only name if years don't fit in the arc
9. Click a filled sector — verify the context menu appears with correct person name and options
10. Click a placeholder sector — verify it opens the "add relative" flow
11. Click the focal person circle — verify context menu appears
12. Verify zoom/pan/drag work
13. Switch between Standard → Fan → Horizontal — verify each re-renders correctly with the same focal person

- [ ] **Step 3: Verify `tpFanClick` positions the menu correctly**

`tpNodeClick` reads `e.currentTarget.getBoundingClientRect()` to position the menu. The `_fanSynth` approach creates a fake bounding rect from the click coordinates. Verify:
- Context menu appears near where you clicked in the fan
- Menu does not overflow the viewport edges (existing clamp logic in `tpNodeClick` handles this)

If the menu positioning is off, adjust the fake bounding rect offsets in `tpFanClick`.

- [ ] **Step 4: Commit**

```bash
git add app.js app.css
git commit -m "feat(tree): add fan chart view with 3-generation ancestor semicircle"
```

---

## Self-Review

**Spec coverage:**
- ✅ View mode switcher in header (Task 1)
- ✅ Mode persisted to localStorage (Task 1, Step 1)
- ✅ Switching mode triggers `tpRenderAll()` + `tpCenterFocus()` (Task 1, Step 2)
- ✅ Horizontal: focus on left, ancestors right in columns (Task 2)
- ✅ Horizontal: 3-gen window with caret expansion (Task 2, `isBoundary()`)
- ✅ Horizontal: caret click fetches next 3 gens, re-renders (Task 2, `tpHorizToggleExpand`)
- ✅ Horizontal: bracket connector lines (Task 2, edge drawing)
- ✅ Horizontal: card click → `tpNodeClick` context menu (Task 2)
- ✅ Fan: 180° semicircle, focal circle at center-bottom (Task 3)
- ✅ Fan: 3 rings, paternal left / maternal right color tints (Task 3)
- ✅ Fan: placeholder sectors for missing ancestors (Task 3, `walk()`)
- ✅ Fan: text rotated to follow arc, truncated for small sectors (Task 3)
- ✅ Fan: sector click → context menu via `tpFanClick` (Task 3)
- ✅ Fan: placeholder click → `tpAddAncestor` (Task 3)
- ✅ Fan: dashed outer arc hint (Task 3)
- ✅ All existing `tpRender()` call sites updated to `tpRenderAll()` (Task 1, Step 6)
- ✅ `horizExpanded` cleared on focus change (Task 1, Step 4)

**Type consistency:** `tpHorizToggleExpand`, `tpFanClick`, `tpSetViewMode` names used consistently across HTML event handlers and function definitions.
