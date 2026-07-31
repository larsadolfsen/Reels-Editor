# Shape Stage Tool + Select/Text/Shape Mutual Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shape a real stage tool — armed from the left rail, drawn by click-dragging on the stage — and make Select/Text/Shape behave as a genuinely mutually-exclusive set (deselecting the other two) whether the mode changes by click or by auto-revert.

**Architecture:** `window.ToolMode` gains a third value, `"shape"`. A new self-registered stage listener (`stage-shape-draw.js`, mirroring the existing `stage-click-router.js`) tracks a mousedown-drag on `#stage` while the Shape tool is armed, shows a live preview, and on mouseup creates a `ShapeLayer` sized to the normalized drag rect (or no-ops below a minimum drag size). Two small pure/tested modules back the math: `canvas-point.js` (client px → 1080×1920 canvas px, extracted from `stage-click-router.js`'s existing private helper) and `shape-draw-rect.js` (normalizes two arbitrary drag corners into a rect). `panel-nav.js` is fixed so the TEXT/SHAPE rail highlight always tracks `ToolMode`, not just clicks.

**Tech Stack:** Vanilla JS (no build step), classic `<script>` tags, `node --test` for pure-module unit tests, existing `UI.*`/`Api.*`/`ShapePanel`/`ShapePreview` conventions.

## Global Constraints

- No JS build step/bundler; icons via `UI.icon()`; no hand-inlined `<svg>` (project convention, enforced by `tests/js/no-raw-svg.test.js` — not touched by this plan, noted for awareness).
- One function/feature per file; pure logic goes in its own dependency-free file, dual-exported (`window.X` + guarded `module.exports`) so it's testable via `node --test "tests/js/**/*.test.js"`.
- No inline `style="..."` in `index.html`; JS-set inline styles on dynamically created elements (as `shape-preview.js` already does) are the existing pattern and fine.
- DOM-wiring "glue" files (self-registered event listeners reaching into other classic-script globals at call time) are not unit-tested in this codebase — verified live in the browser instead, per `stage-click-router.js`'s and `stage-tool-cursor.js`'s existing documented pattern.
- Every edited/new `static/*.js` file keeps (or gets) a 2-3 line header comment stating its purpose, exposed API, and key dependencies.
- Run `node --test "tests/js/**/*.test.js"` before every commit in this plan and confirm it passes in full (not just the new file's tests).

---

### Task 1: Extract `canvas-point.js` and refactor `stage-click-router.js` to use it

**Files:**
- Create: `static/canvas-point.js`
- Create: `tests/js/canvas-point.test.js`
- Modify: `static/stage-click-router.js`
- Modify: `static/index.html` (add one `<script>` tag)

**Interfaces:**
- Produces: `window.CanvasPoint.fromClient(clientX, clientY, rect) -> {x: number, y: number}` — rounds and clamps a client-space point into the 1080×1920 canvas coordinate space, given `rect` (a `DOMRect`-shaped object with `left`/`top`/`width`/`height`). Consumed by Task 6's `stage-shape-draw.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/canvas-point.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { fromClient } = require("../../static/canvas-point.js");

function rect(left, top, width, height) {
  return { left, top, width, height };
}

test("fromClient maps the overlay's top-left to canvas (0,0)", () => {
  const p = fromClient(100, 200, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 0, y: 0 });
});

test("fromClient maps the overlay's bottom-right to canvas (1080,1920)", () => {
  const p = fromClient(640, 1160, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 1080, y: 1920 });
});

test("fromClient maps the overlay's center to canvas center", () => {
  const p = fromClient(370, 680, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 540, y: 960 });
});

test("fromClient clamps points left/above the overlay to (0,0)", () => {
  const p = fromClient(-50, -50, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 0, y: 0 });
});

test("fromClient clamps points right/below the overlay to (1080,1920)", () => {
  const p = fromClient(1000, 1500, rect(100, 200, 540, 960));
  assert.deepStrictEqual(p, { x: 1080, y: 1920 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/canvas-point.test.js`
Expected: FAIL — `Cannot find module '../../static/canvas-point.js'`

- [ ] **Step 3: Create `static/canvas-point.js`**

```js
// Pure conversion from a mouse event's client coordinates into the 1080x1920 canvas coordinate
// space used by TextPreset.x/y, ShapeLayer.x/y, etc. Clamped to canvas bounds. Extracted from
// stage-click-router.js's former private canvasPointFromClient so stage-shape-draw.js can reuse
// the same conversion instead of duplicating it. Exposes window.CanvasPoint.fromClient.
(() => {
  function fromClient(clientX, clientY, rect) {
    const x = Math.round((clientX - rect.left) / rect.width * 1080);
    const y = Math.round((clientY - rect.top) / rect.height * 1920);
    return { x: Math.max(0, Math.min(1080, x)), y: Math.max(0, Math.min(1920, y)) };
  }

  const api = { fromClient };
  if (typeof window !== "undefined") window.CanvasPoint = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/canvas-point.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Refactor `static/stage-click-router.js` to use `CanvasPoint.fromClient`**

Replace the file's private `canvasPointFromClient` function and its call site. The full new file contents:

```js
// Routes clicks on the stage background to the active tool (window.ToolMode, top-toolbar
// feature, added 2026-07-24). In Text-tool mode, a click anywhere on #stage that ISN'T an
// existing .text-block (a video box counts as "anywhere else", per the top-toolbar design spec:
// clicking a video box in Text mode inserts text on top of it) inserts a new text block centered
// at the click point and drops the tool back to Select afterward (Figma/Canva-style "insert
// once, then select"). Clicks on an existing .text-block are left entirely to
// ui-text-interaction.js's own click handling (edit-mode entry) — this listener still receives
// that click too (it bubbles up from the block), so it must ignore it explicitly rather than
// relying on event.stopPropagation() anywhere upstream. In Select-tool and Shape-tool modes this
// file does nothing at all (Shape's own drag gesture is stage-shape-draw.js). Depends on
// window.ToolMode, window.CanvasPoint (canvas-point.js), and on panel-text.js's
// addTextBlockAndEdit() / editor.js's project global — classic-script globals resolved at click
// time, not at this script's load time, so load order relative to those files doesn't matter.

document.getElementById("stage").addEventListener("click", (e) => {
  if (!window.ToolMode || ToolMode.get() !== "text") return;
  if (e.target.closest(".text-block")) return; // let the block's own click-to-edit handle it
  const rect = document.getElementById("overlay").getBoundingClientRect();
  const point = CanvasPoint.fromClient(e.clientX, e.clientY, rect);
  // Revert to Select before the (async) insert resolves, not after — a second click landing
  // while addTextBlockAndEdit is still in flight must see "select" already, or it would start a
  // second concurrent insert. enterEditMode() is never tool-gated, so reverting early doesn't
  // block the new block from still opening in edit mode.
  ToolMode.set("select");
  addTextBlockAndEdit(point);
});
```

- [ ] **Step 6: Wire the new script tag in `static/index.html`**

Find this line (around line 786):

```html
<script src="/static/stage-click-router.js"></script>
```

Replace it with:

```html
<script src="/static/canvas-point.js"></script>
<script src="/static/stage-click-router.js"></script>
```

- [ ] **Step 7: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 8: Commit**

```bash
git add static/canvas-point.js tests/js/canvas-point.test.js static/stage-click-router.js static/index.html
git commit -m "Extract canvas-point.js from stage-click-router.js's private helper"
```

---

### Task 2: `shape-draw-rect.js` pure drag-normalization module

**Files:**
- Create: `static/shape-draw-rect.js`
- Create: `tests/js/shape-draw-rect.test.js`

**Interfaces:**
- Produces: `window.ShapeDragRect.fromPoints(p1, p2) -> {x, y, width, height}` where `p1`/`p2` are `{x, y}` canvas-space points (any two corners, any drag direction) — normalizes into a rect with a non-negative top-left `x`/`y` and non-negative `width`/`height`, clamped to the 1080×1920 canvas. Consumed by Task 6's `stage-shape-draw.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/shape-draw-rect.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { fromPoints } = require("../../static/shape-draw-rect.js");

test("fromPoints: drag down-right normalizes to the start point as top-left", () => {
  const r = fromPoints({ x: 100, y: 200 }, { x: 300, y: 500 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag up-left normalizes to the end point as top-left", () => {
  const r = fromPoints({ x: 300, y: 500 }, { x: 100, y: 200 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag down-left normalizes x from the leftmost point", () => {
  const r = fromPoints({ x: 300, y: 200 }, { x: 100, y: 500 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: drag up-right normalizes y from the topmost point", () => {
  const r = fromPoints({ x: 100, y: 500 }, { x: 300, y: 200 });
  assert.deepStrictEqual(r, { x: 100, y: 200, width: 200, height: 300 });
});

test("fromPoints: clamps points outside the canvas bounds", () => {
  const r = fromPoints({ x: -50, y: -50 }, { x: 1200, y: 2000 });
  assert.deepStrictEqual(r, { x: 0, y: 0, width: 1080, height: 1920 });
});

test("fromPoints: degenerate zero-size drag (same point twice)", () => {
  const r = fromPoints({ x: 400, y: 600 }, { x: 400, y: 600 });
  assert.deepStrictEqual(r, { x: 400, y: 600, width: 0, height: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/shape-draw-rect.test.js`
Expected: FAIL — `Cannot find module '../../static/shape-draw-rect.js'`

- [ ] **Step 3: Create `static/shape-draw-rect.js`**

```js
// Pure geometry for the Shape stage tool's click-drag creation gesture: normalizes the two
// corner points of a drag into a rect (top-left x/y + non-negative width/height) regardless of
// which direction the user dragged, clamped to the 1080x1920 canvas bounds. Exposes
// window.ShapeDragRect.fromPoints(p1, p2).
(() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;

  function fromPoints(p1, p2) {
    const x1 = Math.max(0, Math.min(CANVAS_W, p1.x));
    const y1 = Math.max(0, Math.min(CANVAS_H, p1.y));
    const x2 = Math.max(0, Math.min(CANVAS_W, p2.x));
    const y2 = Math.max(0, Math.min(CANVAS_H, p2.y));
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  const api = { fromPoints };
  if (typeof window !== "undefined") window.ShapeDragRect = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/shape-draw-rect.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add static/shape-draw-rect.js tests/js/shape-draw-rect.test.js
git commit -m "Add pure ShapeDragRect.fromPoints for shape-tool drag normalization"
```

---

### Task 3: Cursor CSS for the armed Shape tool

**Files:**
- Modify: `static/css/components/stage.css`

**Interfaces:** None (pure CSS, no JS surface).

- [ ] **Step 1: Add the cursor rule**

In `static/css/components/stage.css`, find the existing tool-mode cursor block:

```css
#stage[data-tool="select"] .text-block { cursor: default; }
#stage[data-tool="text"] .text-block { cursor: text; }
#stage[data-tool] .text-block[contenteditable="true"] { cursor: text; }
```

Add one line so the block reads:

```css
#stage[data-tool="select"] .text-block { cursor: default; }
#stage[data-tool="text"] .text-block { cursor: text; }
#stage[data-tool] .text-block[contenteditable="true"] { cursor: text; }
#stage[data-tool="shape"] { cursor: crosshair; }
```

Unlike the Text-tool rule (scoped to `.text-block`, since Text only shows a distinct cursor over existing blocks), Shape's crosshair applies to the whole `#stage` — the Shape tool's interaction starts from anywhere on the stage, not just over existing elements.

- [ ] **Step 2: Verify manually**

This is pure CSS with no automated test. Verification happens as part of Task 6's end-to-end browser check (arming the Shape tool must show a crosshair cursor over the stage). No standalone action needed now beyond confirming the file saved correctly:

Run: `grep -n "data-tool=\"shape\"" static/css/components/stage.css`
Expected output: `70:#stage[data-tool="shape"] { cursor: crosshair; }` (line number may differ slightly)

- [ ] **Step 3: Commit**

```bash
git add static/css/components/stage.css
git commit -m "Add crosshair cursor for the armed Shape stage tool"
```

---

### Task 4: `panel-shape.js` — `createShapeAt(rect)`

**Files:**
- Modify: `static/panel-shape.js`

**Interfaces:**
- Consumes: `window.ShapeDefaults.centeredShape()` (existing, `shape-defaults.js`) — unchanged.
- Produces: `window.ShapePanel.createShapeAt(rect) -> shape` where `rect` is `{x, y, width, height}` (or `{}`, or a partial object) — builds `{ id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape(), ...rect }`, pushes it into `project.shapes`, and returns it. No save/render side effects — same contract as the existing `createShape()`/`VideoBoxPanel.createVideoBox`/`ImageBoxPanel.createImageBox`. Consumed by Task 6's `stage-shape-draw.js`.

- [ ] **Step 1: Modify `static/panel-shape.js`**

Find:

```js
  function createShape() {
    const shape = { id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape() };
    project.shapes.push(shape);
    return shape;
  }
```

Replace with:

```js
  function createShapeAt(rect) {
    const shape = { id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape(), ...rect };
    project.shapes.push(shape);
    return shape;
  }

  function createShape() {
    return createShapeAt({});
  }
```

Find:

```js
  window.ShapePanel.render = render;
  window.ShapePanel.createShape = createShape;
})();
```

Replace with:

```js
  window.ShapePanel.render = render;
  window.ShapePanel.createShape = createShape;
  window.ShapePanel.createShapeAt = createShapeAt;
})();
```

- [ ] **Step 2: Update the file's header comment**

Find the header comment's third line (mentioning `createShape()`):

```js
// window.ShapePanel.createShape() (pushes a new shape into project.shapes and returns it, no
// save/render — caller's responsibility, same contract as ImageBoxPanel.createImageBox). One
```

Replace with:

```js
// window.ShapePanel.createShape() (pushes a new shape into project.shapes and returns it, no
// save/render — caller's responsibility, same contract as ImageBoxPanel.createImageBox) plus
// window.ShapePanel.createShapeAt(rect) (same contract, overriding x/y/width/height from `rect` —
// used by stage-shape-draw.js's click-drag creation; createShape() is createShapeAt({})). One
```

- [ ] **Step 3: Verify manually**

No automated test exists for this DOM-wiring file (consistent with the rest of the codebase's `panel-*.js` files). Verify by reading the diff carefully: `createShape()` must still behave identically to before (an empty `rect` override changes nothing), and `createShapeAt` must be reachable as `window.ShapePanel.createShapeAt`. Full manual verification happens in Task 6's browser check.

- [ ] **Step 4: Run the full JS test suite (regression check)**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (unaffected — `shape-defaults.test.js` doesn't touch `panel-shape.js`)

- [ ] **Step 5: Commit**

```bash
git add static/panel-shape.js
git commit -m "Add ShapePanel.createShapeAt for stage-drawn shape creation"
```

---

### Task 5: `panel-nav.js` — Shape becomes a stage tool; fix Select/Text/Shape highlight sync

**Files:**
- Modify: `static/panel-nav.js`

**Interfaces:**
- Consumes: `window.ToolMode.set`/`.get`/`.onChange` (existing, `tool-mode.js`); `ShapePanel.render` (existing).
- Produces: no new exported API — `navOnSelect`, `openShapePanel` (removed), `PANEL_NAV_HANDLERS` (loses its `shape` entry) all stay call-time globals as before.

- [ ] **Step 1: Remove `openShapePanel` and its `PANEL_NAV_HANDLERS` entry**

Find:

```js
function openShapePanel() {
  selected = { type: "shape", item: null };
  showPanel("shape");
  ShapePanel.render(null);
  renderTimeline();
}

function openAudioPanel() {
```

Replace with:

```js
function openAudioPanel() {
```

Find:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, "image-box": openImageBoxPanel, shape: openShapePanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel };
```

Replace with:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, "image-box": openImageBoxPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel };
```

This is safe: `reRenderAfterRestore()` already has its own explicit `t === "shape"` branch that calls `onTimelineSelect`/`openFilesPanel` directly, never falling through to `PANEL_NAV_HANDLERS`, and after Step 2 below `navOnSelect` never reaches `PANEL_NAV_HANDLERS["shape"]` either.

- [ ] **Step 2: Arm the Shape tool from the rail, and fix the highlight-sync gap**

Find the comment block + `navOnSelect` + the two `UI.iconRail` calls + `navSetActive` + the final `UI.railToolButton` call:

```js
// TEXT arms the text tool (window.ToolMode = "text", replacing the top toolbar's Text button
// removed 2026-07-30, remove-text-tool-top-bar) instead of opening its panel or inserting
// directly: the stage cursor becomes a text cursor, a click on an existing .text-block enters
// edit mode (ui-text-interaction.js), and a click elsewhere inserts a new block at that point
// (stage-click-router.js), which reverts ToolMode to "select" once the insert lands. The other
// rail buttons open their panel (CAPTIONS's openCaptionsPanel already create-or-opens the track).
// Opening an *existing* text block still happens via a timeline/stage click (onTimelineSelect).
// Split into two iconRail calls (top/bottom, see PANEL_NAV_TOP_ITEMS/PANEL_NAV_BOTTOM_ITEMS) so
// #rail-tool's Select button can sit between them; both share one active value via navSetActive.
function navOnSelect(value) {
  navSetActive(value);
  if (value === "text") { ToolMode.set("text"); return; }
  PANEL_NAV_HANDLERS[value]();
}
const setNavTopActive = UI.iconRail(document.getElementById("panel-nav-top"), PANEL_NAV_TOP_ITEMS, "files", navOnSelect);
const setNavBottomActive = UI.iconRail(document.getElementById("panel-nav-bottom"), PANEL_NAV_BOTTOM_ITEMS, "files", navOnSelect);
function navSetActive(value) {
  setNavTopActive(value);
  setNavBottomActive(value);
}

// Select tool-mode button, sits between FILES and TEXT (selector-tool-rail-placement feature).
// Text has no counterpart here — it's armed via the TEXT entry above (navOnSelect).
UI.railToolButton(document.getElementById("rail-tool"));
```

Replace with:

```js
// TEXT and SHAPE arm their stage tools (window.ToolMode = "text"/"shape") instead of opening a
// panel or inserting directly: the stage cursor changes (stage.css), a click/drag on the stage
// does the tool's thing (stage-click-router.js for Text, stage-shape-draw.js for Shape), and each
// reverts ToolMode to "select" once its one-shot action lands. The other rail buttons open their
// panel (CAPTIONS's openCaptionsPanel already create-or-opens the track). Opening an *existing*
// text block or shape still happens via a timeline/stage click (onTimelineSelect). Split into two
// iconRail calls (top/bottom, see PANEL_NAV_TOP_ITEMS/PANEL_NAV_BOTTOM_ITEMS) so #rail-tool's
// Select button can sit between them; both share one active value via navSetActive.
//
// armedTool tracks which of TEXT/SHAPE is the currently-highlighted tool (or null). It exists so
// the highlight can be cleared correctly when ToolMode reverts to "select" from ANY source — not
// just a rail click, but also stage-click-router.js's/stage-shape-draw.js's own auto-revert after
// a one-shot insert/draw completes. Before this, only a click on another nav item could clear a
// stale TEXT/SHAPE highlight (the Select rail button's own highlight already synced correctly via
// ui-rail-tool-button.js's ToolMode.onChange subscription — this brings TEXT/SHAPE in line with
// it, so Select/Text/Shape are a genuinely mutually-exclusive set under any transition).
let armedTool = null; // "text" | "shape" | null
function navOnSelect(value) {
  if (value === "text" || value === "shape") {
    armedTool = value;
    navSetActive(value);
    ToolMode.set(value);
    return;
  }
  armedTool = null;
  navSetActive(value);
  PANEL_NAV_HANDLERS[value]();
}
const setNavTopActive = UI.iconRail(document.getElementById("panel-nav-top"), PANEL_NAV_TOP_ITEMS, "files", navOnSelect);
const setNavBottomActive = UI.iconRail(document.getElementById("panel-nav-bottom"), PANEL_NAV_BOTTOM_ITEMS, "files", navOnSelect);
function navSetActive(value) {
  setNavTopActive(value);
  setNavBottomActive(value);
}
ToolMode.onChange((mode) => {
  if (mode === "select" && armedTool) {
    armedTool = null;
    navSetActive(null);
  }
});

// Select tool-mode button, sits between FILES and TEXT (selector-tool-rail-placement feature).
// Text/Shape have no counterpart here — they're armed via the TEXT/SHAPE entries above
// (navOnSelect).
UI.railToolButton(document.getElementById("rail-tool"));
```

- [ ] **Step 3: Run the full JS test suite (regression check)**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (unaffected — no test file targets `panel-nav.js`)

- [ ] **Step 4: Commit**

```bash
git add static/panel-nav.js
git commit -m "Arm Shape as a stage tool; fix Select/Text/Shape highlight sync on auto-revert"
```

---

### Task 6: `stage-shape-draw.js` — drag-to-create wiring, and full end-to-end verification

**Files:**
- Create: `static/stage-shape-draw.js`
- Modify: `static/index.html` (two `<script>` tags)

**Interfaces:**
- Consumes: `window.ToolMode` (`tool-mode.js`), `window.CanvasPoint.fromClient` (Task 1), `window.ShapeDragRect.fromPoints` (Task 2), `window.ShapeDefaults.centeredShape()` (existing), `window.ShapeColor.toRgba` (existing), `window.ShapePanel.createShapeAt(rect)` (Task 4), `window.ShapePreview.render(shapes, timelineTime)` (existing), and editor.js/panel-nav.js call-time globals `project`, `saveProject()`, `onTimelineSelect({type, item})`, `Preview.currentTimelineTime()`.
- Produces: no exported API — self-registered `mousedown` listener on `#stage`, matching `stage-click-router.js`'s style.

- [ ] **Step 1: Create `static/stage-shape-draw.js`**

```js
// Drag-to-create for the Shape stage tool (window.ToolMode === "shape", shape-tool feature). On
// #stage mousedown with the Shape tool armed, tracks the drag, shows a live preview box (reusing
// the .shape-box CSS class), and on mouseup either creates a ShapeLayer sized to the drawn rect
// (if the drag was at least MIN_SHAPE_DRAG_PX in both dimensions) or does nothing (a plain click,
// or a drag too small to be intentional). On creation: selects the new shape, opens the Shape
// panel, and reverts ToolMode to "select" — mirrors stage-click-router.js's Text-tool "insert
// once, then select" pattern. Depends on window.ToolMode, window.CanvasPoint (canvas-point.js),
// window.ShapeDragRect (shape-draw-rect.js), ShapePanel.createShapeAt()/panel-shape.js,
// ShapePreview.render()/shape-preview.js, and editor.js's project/saveProject/panel-nav.js's
// onTimelineSelect — all classic-script globals resolved at event time, not at this script's
// load time, so load order relative to those files doesn't matter (same reasoning as
// stage-click-router.js).
(() => {
  const MIN_SHAPE_DRAG_PX = 8; // canvas px (of 1080 width / 1920 height); below this in either
                                // dimension, a drag is treated as an accidental/no-op click

  const stageEl = document.getElementById("stage");
  const overlayEl = document.getElementById("overlay");
  let previewDiv = null;
  let startPoint = null;

  function overlayRect() {
    return overlayEl.getBoundingClientRect();
  }

  function applyRectToPreview(rect) {
    const stageW = overlayEl.clientWidth || 1;
    const stageH = overlayEl.clientHeight || 1;
    previewDiv.style.left = (rect.x / 1080 * stageW) + "px";
    previewDiv.style.top = (rect.y / 1920 * stageH) + "px";
    previewDiv.style.width = (rect.width / 1080 * stageW) + "px";
    previewDiv.style.height = (rect.height / 1920 * stageH) + "px";
  }

  function onMouseMove(e) {
    const point = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());
    applyRectToPreview(ShapeDragRect.fromPoints(startPoint, point));
  }

  async function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    const point = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());
    const rect = ShapeDragRect.fromPoints(startPoint, point);
    previewDiv.remove();
    previewDiv = null;
    startPoint = null;

    if (rect.width < MIN_SHAPE_DRAG_PX || rect.height < MIN_SHAPE_DRAG_PX) return;

    const shape = ShapePanel.createShapeAt(rect);
    await saveProject();
    await onTimelineSelect({ type: "shape", item: shape });
    ShapePreview.render(project.shapes, Preview.currentTimelineTime());
    ToolMode.set("select");
  }

  stageEl.addEventListener("mousedown", (e) => {
    if (!window.ToolMode || ToolMode.get() !== "shape") return;
    if (e.button !== 0) return;
    e.preventDefault();
    startPoint = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());

    previewDiv = document.createElement("div");
    previewDiv.className = "shape-box";
    previewDiv.style.pointerEvents = "none";
    previewDiv.style.zIndex = "9999";
    const defaults = ShapeDefaults.centeredShape();
    previewDiv.style.backgroundColor = ShapeColor.toRgba(defaults.fill_color, defaults.opacity);
    overlayEl.appendChild(previewDiv);
    applyRectToPreview({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
})();
```

- [ ] **Step 2: Wire the new script tag in `static/index.html`**

Find (Task 1 already changed the line above it):

```html
<script src="/static/canvas-point.js"></script>
<script src="/static/stage-click-router.js"></script>
<script src="/static/stage-tool-cursor.js"></script>
```

Replace with:

```html
<script src="/static/canvas-point.js"></script>
<script src="/static/stage-click-router.js"></script>
<script src="/static/stage-shape-draw.js"></script>
<script src="/static/stage-tool-cursor.js"></script>
```

Also find (Task 2's `shape-draw-rect.js` needs a tag too — grouped with the other pure shape modules):

```html
<script src="/static/shape-defaults.js"></script>
<script src="/static/shape-color.js"></script>
<script src="/static/shape-preview.js"></script>
```

Replace with:

```html
<script src="/static/shape-defaults.js"></script>
<script src="/static/shape-color.js"></script>
<script src="/static/shape-draw-rect.js"></script>
<script src="/static/shape-preview.js"></script>
```

- [ ] **Step 3: Run the full JS test suite (regression check)**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (all tests — this task adds no new pure-module tests, it's the DOM-wiring finish)

- [ ] **Step 4: Start the app and verify end-to-end in a browser**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000` on a throwaway/test project (never a real project — the app's unload autosave will persist whatever you do). Walk through:

1. Click SELECT in the rail. Confirm it's the only highlighted tool button (Select/Text/Shape).
2. Click TEXT. Confirm TEXT highlights and Select un-highlights. Click on empty stage space to insert a text block. Confirm: after the insert, Select re-highlights and TEXT un-highlights (this is the auto-revert case the highlight-sync fix targets — check it specifically, since it was broken before this plan).
3. Click SHAPE. Confirm SHAPE highlights and the others don't. Confirm the stage cursor becomes a crosshair.
4. Click-drag on the stage (down-right). Confirm a live dashed/preview box follows the drag. Release. Confirm: a new shape appears sized to the drag, the Shape panel opens showing it selected, and the tool reverts to Select (Select re-highlights, SHAPE un-highlights).
5. Repeat step 4 dragging up-left instead (from bottom-right corner toward top-left) — confirm the resulting shape has the same normalized position/size behavior (top-left corner correctly computed either way).
6. Arm SHAPE again and do a plain click with no drag movement. Confirm no shape is created and the tool stays armed (crosshair cursor still showing).
7. Arm SHAPE, drag a very small amount (a few px), release. Confirm no shape is created (below the 8px minimum) and the tool stays armed.
8. With a shape now selected (from step 4), click SELECT. Confirm Select highlights and nothing else does.

Confirm no console errors at any point (`read_console_messages` if using the in-app browser preview tool, or your browser's own devtools).

- [ ] **Step 5: Commit**

```bash
git add static/stage-shape-draw.js static/index.html
git commit -m "Add click-drag shape creation for the Shape stage tool"
```

---

## Self-Review Notes

- **Spec coverage:** Arming Shape as a tool (Task 5) ✓; crosshair cursor (Task 3) ✓; click-drag creates a shape, top-left/normalized-either-direction (Task 6 + Task 2) ✓; plain click / too-small drag is a no-op (Task 6, `MIN_SHAPE_DRAG_PX` check) ✓; post-create select+open-panel+revert-to-Select (Task 6, `onMouseUp`) ✓; Select/Text/Shape mutual exclusion under click AND auto-revert (Task 5) ✓; dead `openShapePanel`/hidden "+ ADD SHAPE" button cleanup (Task 5 removes the now-unreachable handler; the hidden button itself and `createShape()` are left as-is, still reachable in principle, matching the spec's decision not to touch that dormant path beyond adding `createShapeAt`) ✓.
- **Placeholder scan:** No TBD/TODO/"add error handling"-style steps; every step has literal code or an exact command.
- **Type consistency:** `ShapeDragRect.fromPoints(p1, p2) -> {x, y, width, height}` (Task 2) is the exact shape consumed in Task 6's `applyRectToPreview`/`onMouseUp`. `CanvasPoint.fromClient(clientX, clientY, rect) -> {x, y}` (Task 1) matches its two call sites in Task 6. `ShapePanel.createShapeAt(rect)` (Task 4) takes the same `{x, y, width, height}` shape `ShapeDragRect.fromPoints` produces, spread directly onto the defaults object — confirmed consistent.
