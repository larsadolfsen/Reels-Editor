# Shape stage tool + Select/Text/Shape mutual exclusion — design

Date: 2026-07-31

## Problem

Today the left rail has three tool-ish entries — the Select-tool button (`#rail-tool`, its own icon-rail group) and the TEXT / SHAPE entries in the panel-nav icon-rail groups — but they don't behave as one consistent mutually-exclusive set:

- SHAPE doesn't arm a stage tool at all. Clicking it just opens the `#panel-shape` context panel (`openShapePanel()`). Shapes can only be created via a "+ ADD SHAPE" button inside that panel — which is `hidden` in `index.html` and never unhidden by `panel-shape.js`, so it's currently dead/invisible. There is no way to draw a shape on the stage.
- The Select button already tracks `ToolMode` correctly (`ui-rail-tool-button.js` subscribes to `ToolMode.onChange` and updates its own pressed state). But TEXT's highlight in the separate panel-nav rail group is only updated on click (`navSetActive`, called from `navOnSelect`) — it is never told when `ToolMode` changes for other reasons. Concretely: when a text insert completes and `stage-click-router.js` auto-reverts `ToolMode` to `"select"`, the TEXT button stays highlighted even though the tool is no longer armed.

Goal: make Shape a real third stage tool (arm it, draw a shape by click-dragging on the stage, mirroring how Text already works), and make Select/Text/Shape a genuinely mutually-exclusive set regardless of how the mode changes (click or auto-revert).

## Behavior

**Arming.** Clicking SHAPE in the rail sets `ToolMode` to `"shape"` (does not open the panel directly, same as TEXT today). The stage cursor becomes a crosshair (`cursor: crosshair`) while armed.

**Drawing.** With the Shape tool armed, mousedown-drag anywhere on `#stage` (including on top of existing clips/boxes/shapes — same "draw on top of anything" philosophy `stage-click-router.js` already documents for Text) tracks the pointer and shows a live dashed preview rectangle. The two corners of the drag are normalized into a rect regardless of which direction the user drags (Figma/Canva-style — not strictly "mousedown point is always top-left").

**Commit.** On mouseup:
- If the drawn rect is at least 8px wide and 8px tall (in the 1080×1920 canvas coordinate space), a new `ShapeLayer` is created at that rect (using `ShapeDefaults.centeredShape()` for every other field — fill color, opacity, corner radius, start/duration, z-index), it becomes selected, the Shape panel opens showing it, and the tool reverts to Select — mirroring Text's one-shot "insert then back to Select" pattern.
- If the drag never exceeded that threshold (including a plain click with no movement), nothing happens — no shape is created, the tool stays armed for another attempt.

**Mutual exclusion.** Whenever `ToolMode` changes to `"select"` — whether from clicking the Select button or from a tool auto-reverting after a completed insert/draw — any Text/Shape highlight in the rail clears. Whenever it changes to `"text"` or `"shape"`, that entry highlights and the other two (Select's own button, and the other of Text/Shape) un-highlight. This holds regardless of *how* the transition happened, closing the gap described above.

## Implementation

### `static/tool-mode.js`
No code change — `ToolMode` already accepts any string; `"shape"` is just a new valid value. Its header comment gets updated to mention all three modes.

### `static/canvas-point.js` (new)
Extracts the pure `canvasPointFromClient(clientX, clientY, rect)` helper currently private to `stage-click-router.js` into a shared, tested module: `window.CanvasPoint.fromClient(clientX, clientY, rect) -> {x, y}` — same behavior (rounds to the 1080×1920 canvas space, clamps to bounds). `stage-click-router.js` is updated to call `CanvasPoint.fromClient` instead of its own private copy. This is reused by the new shape-draw file below rather than duplicating the conversion a third time.

### `static/shape-draw-rect.js` (new, pure)
`window.ShapeDragRect.fromPoints(p1, p2) -> {x, y, width, height}`: normalizes two arbitrary canvas-space points into a rect (top-left corner + positive width/height), regardless of drag direction, clamped to the 0..1080 / 0..1920 canvas bounds. Dual-exported (`window.X` + `module.exports`) following the project's existing pure-JS-module convention (e.g. `font-size-scale.js`, `timeline-slice.js`).

### `static/panel-shape.js`
Add `window.ShapePanel.createShapeAt(rect)`: builds `{ id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape(), ...rect }`, pushes into `project.shapes`, returns it — no save/render, same no-side-effect contract as `createShape()`/`VideoBoxPanel.createVideoBox`/`ImageBoxPanel.createImageBox`. The existing `createShape()` (used by the dormant "+ ADD SHAPE" button) becomes a thin wrapper: `createShapeAt({})`.

### `static/stage-shape-draw.js` (new)
Self-registered mousedown listener on `#stage`, gated to `ToolMode.get() === "shape"` and `e.button === 0`, mirroring `stage-click-router.js`'s structure and load-order-independence (reaches into `project`/`saveProject`/`renderTimeline`/`onTimelineSelect` as call-time globals):
- mousedown: `e.preventDefault()`, capture the start canvas point via `CanvasPoint.fromClient` against `#overlay`'s bounding rect, mount a preview `<div>` into `#overlay` (reuses the `.shape-box` CSS class so it previews exactly what will be created, plus `pointer-events: none` so it can't intercept its own drag), attach `mousemove`/`mouseup` on `document`.
- mousemove: recompute the current canvas point, normalize via `ShapeDragRect.fromPoints`, update the preview div's position/size using the same canvas→stage-px scaling `shape-preview.js` uses (`overlay.clientWidth`/`clientHeight`).
- mouseup: remove the preview div and the document listeners; if the final rect is ≥8×8 canvas px, call `ShapePanel.createShapeAt(rect)`, `await saveProject()`, `await onTimelineSelect({ type: "shape", item: shape })`, then an explicit `ShapePreview.render(project.shapes, Preview.currentTimelineTime())` (onTimelineSelect's shape branch only calls `ShapePanel.render()`, whose `ShapePreview.setSelectedShape()` call alone doesn't mount into `#overlay` — same documented gap `panel-media.js`'s video-box/image-box add-icons already work around), then `ToolMode.set("select")`. Below threshold: just remove the preview/listeners, no-op.

### `static/panel-nav.js`
- `navOnSelect`: SHAPE gets the same short-circuit TEXT already has (`ToolMode.set("shape")`, no panel open). A small module-local `armedTool` variable (`"text" | "shape" | null`) tracks which of the two is currently armed via the nav.
- New `ToolMode.onChange` subscription: when the mode becomes `"select"` and `armedTool` is set, clear both `armedTool` and the nav highlight (`navSetActive(null)`).
- `openShapePanel` and its `PANEL_NAV_HANDLERS.shape` entry are removed — after this change nothing calls them (the nav short-circuits before reaching the handlers map, and `reRenderAfterRestore`'s shape branch already has its own explicit handling that doesn't go through the handlers map either).

### `static/css/components/stage.css`
Add `#stage[data-tool="shape"] { cursor: crosshair; }` next to the existing tool-mode cursor rules.

### `static/index.html`
Add `<script src="/static/canvas-point.js"></script>`, `<script src="/static/shape-draw-rect.js"></script>`, `<script src="/static/stage-shape-draw.js"></script>` in appropriate load order (canvas-point.js and shape-draw-rect.js before stage-shape-draw.js and stage-click-router.js; stage-shape-draw.js needs `ShapePanel`/`ShapePreview`/`onTimelineSelect` to exist by call time, not load time, so it can load anywhere after those files are declared, matching `stage-click-router.js`'s existing placement).

## Testing

- `tests/js/canvas-point.test.js`: clamping at all four canvas edges, a few interior points, non-square rects.
- `tests/js/shape-draw-rect.test.js`: normalization for all four drag directions (down-right, down-left, up-right, up-left), clamping when a drag point goes outside the canvas, a degenerate zero-size input.
- `panel-shape.js`'s `createShapeAt` and `stage-shape-draw.js`'s DOM wiring are not unit-tested (thin glue over already-tested pure pieces and already-established patterns), verified live in the browser instead — same stated pattern as `stage-click-router.js`/`stage-tool-cursor.js`.

## Accepted limitation

Arming a tool (Text or Shape) does not clear whatever box/text-block was previously selected elsewhere on the stage. If something was selected with resize/drag handles mounted, its own drag handler could still respond to a mousedown that was intended to start drawing a new shape. This is a pre-existing conflation (Text has the identical issue today) and isn't introduced or worsened by this change; a general fix (e.g. auto-deselecting on every tool arm) is out of scope here.
