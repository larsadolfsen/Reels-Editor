# Vector shape (square/rectangle) layer — design

## Purpose

Let the user add a solid-color rectangle shape as its own overlay layer — a design accent, a color block behind text, etc. — positioned/resized freely on the 1080x1920 canvas, with its own timing, and exported into the final video like every other overlay.

## Scope

- New layer type `ShapeLayer`: a free-form rectangle (not locked to a square) with fill color, opacity, and corner radius. No border/stroke (YAGNI — not requested).
- Full citizen of the existing overlay system: appears in the unified z-order overlay row (`timeline-overlay-layers.js`), has its own Box/Style/Time panel tabs, participates in export banding.
- No edge-mask tab (a vector rectangle has no useful "cut" — corner radius already covers the shaping need) and no add-from-media picker (a shape isn't sourced from media).
- Added via a new **SHAPE** entry in the left icon rail — clicking it immediately creates a new shape (centered default box) and selects it, mirroring how TEXT's rail entry inserts today, minus the "click stage to place" step (a shape has no natural insertion point the way text does).

## Data model

`app/models.py` — new `ShapeLayer`:
```python
class ShapeLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    start: float = 0.0
    duration: float = 3.0
    x: float
    y: float
    width: float = 300.0
    height: float = 300.0
    fill_color: str = "#4C6FFF"
    opacity: float = 1.0        # 0.0-1.0
    corner_radius: int = 0      # px, clamped to min(width, height)/2
    z_index: int = -1           # same convention as VideoBoxLayer/ImageBoxLayer
```
`Project.shapes: list[ShapeLayer] = []`.

Default box on creation: 300x300 centered on the 1080x1920 canvas (`x=390, y=810`), default `duration=3.0` (matches `ImageBoxLayer`'s default), default fill `#4C6FFF`.

## Backend

- `app/shape_render.py` (new, mirrors `app/mask_image.py`'s style): `write_shape_png(path, width, height, fill_color, opacity, corner_radius)` — rasterizes a filled rounded-rect RGBA PNG via Pillow, alpha = `round(opacity * 255)` inside the rounded rect, `0` outside. `corner_radius` clamped to `min(width, height) / 2` before drawing.
- `app/timeline.py` — `banded_layers()` emits one `"shape"` band per `ShapeLayer`, same start/duration/z-order slotting as `"image_box"` bands.
- `app/ffmpeg_cmd.py` — banded export composites a `"shape"` band like an `"image_box"` band, except the input is the pre-rendered shape PNG (`-loop 1 -t <duration>`) — no `alphaextract`/`alphamerge` needed since the PNG already carries its own alpha; a plain `overlay` respects it directly.
- `app/main.py` — export route writes one `{name}-{id[:8]}-band{i}-shape.png` sidecar per `ShapeLayer` (same naming convention as the mask/ASS sidecars) via `write_shape_png`, and includes `p.shapes` in the banded-export trigger condition alongside `p.video_boxes`/`p.image_boxes`.

## Frontend

- `static/shape-preview.js` (new, mirrors `image-box-preview.js`): `window.ShapePreview.{render(shapes, timelineTime), setSelectedShape(id, callbacks), setOnActivate(fn)}` — mounts one `<div class="shape-box">` per visible shape into `#overlay` (background-color + opacity + border-radius + position/size + z-index from the model), reuses `UI.videoBoxDrag` for move and `UI.resizeHandles` for resize, click-to-select gated to `ToolMode.get() === "select"` (same gating as video/image boxes).
- `static/shape-defaults.js` (new, pure, tested): `ShapeDefaults.centeredShape()` returns the default `{x, y, width, height, fill_color, opacity, corner_radius, duration}` object — the one place default values live, so `panel-shape.js`'s create path and any test stay in sync.
- `static/shape-color.js` (new, pure, tested): `ShapeColor.toRgba(hex, opacity) -> "rgba(r,g,b,a)"` — used by `shape-preview.js` to paint the CSS background (CSS opacity would also fade a border if one's ever added; rgba keeps the fill's alpha self-contained).
- `static/panel-shape.js` (new, mirrors `panel-image-box.js` minus the add-picker/mask tab): `window.ShapePanel.render(selectedId)` — Box tab (X/Y/WIDTH/HEIGHT number fields), Style tab (fill color swatch, OPACITY % field, CORNER RADIUS px field), Time tab (START/DURATION fields), Delete footer (`.panel-danger-footer`, matching every other box panel). `ShapePanel.createShape()` pushes a new `ShapeLayer` (via `ShapeDefaults.centeredShape()`) into `project.shapes` and returns it — exposed the same way `ImageBoxPanel.createImageBox` is, for reuse by the rail entry.
- `static/timeline-overlay-layers.js` — `mergedEntries(project)` merges shapes into the same z-order-sorted list as text blocks/video boxes/image boxes; `renumber()` covers shapes too.
- `static/timeline.js` — `renderOverlaysRow` labels a shape lane `"SHAPE"`.
- `static/panel-nav.js` — new `PANEL_NAV_ITEMS` entry `{ value: "shape", label: "SHAPE", icon: "square" }`; `onSelect` special-cases `value === "shape"` (alongside the existing `"text"` case) to create+select a new shape immediately (`ShapePanel.createShape()` + `onTimelineSelect({ type: "shape", item })`) instead of just opening the panel; `PANEL_NAV_HANDLERS.shape` opens `#panel-shape` for re-selecting an *existing* shape (stage/timeline click, undo/redo restore).
- `static/ui-icon.js` — new `"square"` `ICON_PATHS` entry (Lucide `square`: a plain rounded rect outline).
- `static/index.html` — new `#panel-shape` context-panel section (Box/Style/Time tab bodies + Delete footer, structured like `#panel-image-box` minus the add-picker and Mask tab) plus its two new `<script>` includes (`shape-defaults.js`, `shape-color.js`, `shape-preview.js`, `panel-shape.js` — in dependency order).
- `static/css/components/shape-panel.css` (new, mirrors `image-box-panel.css`) for `#panel-shape`'s internal layout.
- `static/css/components/stage.css` — small addition: base `.shape-box` styling (position/box-sizing), mirroring the existing box conventions.

## Selection & editor wiring

`static/editor.js`/`panel-nav.js`'s existing `selected.type` switch (`"video" | "video-box" | "image-box" | "text" | ...`) gains a `"shape"` case everywhere it's branched on: Delete-key handling (removes the shape, re-renders), `onTimelineSelect`, `reRenderAfterRestore` after undo/redo. `Preview.load()`/the render pipeline calls `ShapePreview.render(project.shapes, timelineTime)` alongside the existing text/video-box/image-box render calls.

## Testing

**Backend (pytest):**
- `tests/test_shape_render.py` — `write_shape_png`: output size/mode, alpha at full/partial/zero opacity, corners fully transparent vs. center opaque when `corner_radius > 0`, radius clamped when it exceeds `min(w,h)/2`.
- `tests/test_models.py` — `ShapeLayer` defaults.
- `tests/test_timeline.py` — `banded_layers()` includes a `"shape"` band per `ShapeLayer` with correct start/duration/z-order slotting.
- `tests/test_ffmpeg_cmd.py` — a `"shape"` band produces the expected loop/overlay filter chain, byte-identical command when no shapes are present.
- `tests/test_export_smoke.py` — extend the "every layer type combined" smoke test to include a shape layer.

**Frontend (`node --test`):**
- `tests/js/shape-defaults.test.js` — `centeredShape()` returns the documented default values.
- `tests/js/shape-color.test.js` — `toRgba()` across full/partial/zero opacity and a few hex formats.
- `tests/js/timeline-overlay-layers.test.js` (existing file, extended) — `mergedEntries`/`renumber` include shapes in z-order alongside text blocks and video/image boxes.

**Stated gap:** `shape-preview.js` (DOM mounting, drag/resize wiring) and `panel-shape.js` (panel rendering/wiring) are thin UI glue, same as their video-box/image-box counterparts — not unit-tested, verified manually in the browser on a throwaway project (add a shape, drag/resize it, change fill/opacity/radius, change start/duration, delete it, confirm it exports).
