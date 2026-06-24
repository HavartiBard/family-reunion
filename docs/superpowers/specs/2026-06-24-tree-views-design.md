# Tree View Modes: Horizontal & Fan — Design Spec

**Date:** 2026-06-24  
**Status:** Approved

## Overview

Add two additional ancestor-only view modes to the existing Family Tree screen: a **horizontal pedigree chart** and a **fan/radial chart**. Both modes share the same data-fetching infrastructure (`_tS.persons`, `tpFetchUp`) and viewport controls as the current standard (vertical) tree. Only the layout computation and render functions differ.

## 1. View Mode Switcher

### UI
A segmented control is added to `.tree-hdr-right`, to the left of the tree selector and "+ Add person" button. Three segments: `Standard | Horizontal | Fan`, styled as a `.btn-outline` button group with the active segment highlighted.

### State
- `_tS.viewMode`: `'standard' | 'horizontal' | 'fan'`, defaults to `'standard'`
- Persisted to `localStorage` as `treeViewMode` so it survives page refreshes
- Switching mode calls `tpRenderAll()`, which dispatches to `tpRender()`, `tpRenderHorizontal()`, or `tpRenderFan()` — no data refetch required

### Viewport controls
Pan/zoom/drag and the `⊡` reset button remain visible in all modes. `tpCenterFocus()` adapts per mode:
- Standard: existing behavior
- Horizontal: scrolls focal person to the left edge, vertically centered
- Fan: centers the focal circle at the bottom-center of the viewport

---

## 2. Horizontal Tree

### Layout
- **Focal person** card at x=0, vertically centered in the viewport
- **Each ancestor generation** occupies a column stepping rightward by `_TW + _THG` (same card dimensions as the standard tree)
- Within each column, cards are spaced evenly, each vertically centered on its child's midpoint — standard pedigree positioning
- Initial render shows **3 generations** (parents, grandparents, great-grandparents)

### Expansion (caret toggle)
- `_tS.horizExpanded`: `Set<personId>` tracking which generation-3+ nodes have been expanded
- Generation-3 ancestor cards that have known parents (or a "has more" stub) render a `›` caret button in the card's top-right corner
- **Clicking the caret:**
  1. Calls `tpFetchUp(id, 0)` to fetch that branch's next 3 generations (idempotent — populates `_tS.persons`)
  2. Adds `id` to `_tS.horizExpanded`
  3. Calls `tpRenderHorizontal()` — the expanded branch now shows its next 3 generations, each with its own carets if parents exist
- **Clicking again** removes from `_tS.horizExpanded` and collapses the branch
- Multiple branches can be independently expanded at the same time

### Connecting lines
SVG layer behind the cards. Each card connects to its child via:
- A horizontal line from the card's right edge to a vertical bus line
- Vertical stubs from the bus line up/down to each parent pair

### Interaction
Clicking a card calls `tpNodeClick(e, id)` — same context menu as the standard view (navigate/refocus, open profile, edit).

---

## 3. Fan View

### Layout
Pure SVG — no card divs. A 180° semicircle fans upward from a focal person circle at the bottom-center.

**Rings (3 generations of ancestors):**
| Ring | Generation | Sectors | Degrees each |
|------|-----------|---------|--------------|
| 1 (innermost) | Parents | 2 | 90° |
| 2 | Grandparents | 4 | 45° |
| 3 (outermost) | Great-grandparents | 8 | 22.5° |

**Geometry:** Ring radii are calculated to fill the viewport: `outerRadius = min(vpW / 2, vpH * 0.95)`. Ring widths are equal thirds of that radius (minus the focal circle radius).

### Color
- Left half (paternal lineage): cool tint (blue/slate semi-transparent fill)
- Right half (maternal lineage): warm tint (peach/salmon semi-transparent fill)
- Base fill: cream from existing design tokens
- Missing persons: lighter, desaturated sector with dashed stroke (same "Add" intent as the standard tree's placeholder cards)

### Text
- Name and birth/death years rendered inside each sector, rotated to follow the arc midpoint angle
- At generation 3 (22.5° sectors), only the name is rendered if dates don't fit — measured against arc length, clipped gracefully
- Text rendered as SVG `<text>` elements with `transform="rotate(...)"` anchored to the sector centroid

### Sizing & Viewport
The SVG is placed inside `#tree-inner` with the same CSS transform as the other modes, so pan/zoom/drag work identically. On load, `tpCenterFocus()` auto-fits the fan to the viewport.

### Interaction
Clicking a sector calls a thin `tpFanClick(e, id)` wrapper that positions the context menu using `e.clientX / e.clientY` (since SVG sectors have no bounding rect to anchor to), then delegates to the same `tpNodeClick` logic. The focal person circle is also clickable. Missing-person sectors call `tpAddAncestor(childId, role)` directly (same as the standard tree's placeholder cards).

---

## 4. Shared Infrastructure (unchanged)

| Concern | How it's handled |
|---------|-----------------|
| Data fetching | `tpFetchUp` / `_tS.persons` — unchanged, all modes read from this |
| Focus navigation | `tpLoad(id)` re-runs the full fetch + render cycle for all modes |
| Context menu | `tpShowCtxMenu(id, x, y)` — unchanged, called by all three renderers |
| Pan / zoom / drag | `_tS.pan`, `_tS.zoom`, `tpDragStart/Move/End`, `tpWheel` — unchanged |
| URL persistence | `?tab=tree&person=<id>` — unchanged |
| Mode persistence | `localStorage.treeViewMode` — new |

---

## 5. Out of Scope

- Fan view does not show descendants
- Horizontal view does not show descendants
- Ancestor siblings (the `ancSiblings` feature) are not shown in horizontal or fan modes
- No new API endpoints required
