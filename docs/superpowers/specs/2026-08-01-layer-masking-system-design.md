# Layer masking system (shape-as-mask)

## Problem

The existing box edge mask feature (`app/box_mask.py`, `app/mask_image.py`,
`static/box-mask.js`, `static/ui-mask-line-drag.js`) cuts a video/image box along a
single straight line (`mask_angle`/`mask_offset`/`mask_flip`). It does not do what's
actually wanted: masking a box using an arbitrary shape (and, later, other layer types
such as text or a person cutout).

This spec replaces the straight-line edge mask entirely with a system where a **shape
layer can be nested under another layer as its mask**, clipping that target layer to
the shape's geometry.

## Scope

- Maskable targets (this pass): `VideoBoxLayer` and `ImageBoxLayer` only — a 1:1
  replacement of the current edge-mask feature's scope. Text blocks and shapes are not
  maskable targets yet.
- Mask source types (this pass): **Shape** only. The UI is built so Text and Person
  (auto segmentation) can be added as additional mask-source types later without
  restructuring, but only a Shape card is shown/wired now.
- A mask is always 1:1: one shape masks at most one target, one target has at most one
  mask.

## Data model

`app/models.py`:

- **Remove** from `VideoBoxLayer` and `ImageBoxLayer`: `mask_enabled`, `mask_angle`,
  `mask_offset`, `mask_flip`.
- **Add** to both: `mask_shape_id: str | None = None` — the id of the `ShapeLayer`
  acting as this box's mask, or `None` (default, unmasked — reproduces current
  behavior for every existing saved project).
- No new field on `ShapeLayer`. Whether a given shape is "a mask" is derived: a shape
  is a mask if some box's `mask_shape_id` equals its id. That shape is then excluded
  from the normal overlay stack / export bands and instead rendered nested under its
  target (see below).
- A mask shape's `fill_color`, `start`, `duration` remain live fields on the
  `ShapeLayer` (nothing new to model) but have no effect on the masked/exported
  result while the shape is acting as a mask — only `x`/`y`/`width`/`height`/
  `corner_radius`/`opacity` matter for masking (see "Rendering").

## Timeline UI

In the unified overlays row (`static/timeline.js`'s `renderOverlaysRow`, backed by
`static/timeline-overlay-layers.js`):

- A VIDEO BOX or IMAGE BOX lane gets a chevron/accordion control. Expanding it reveals
  one nested sub-row directly beneath it: `+ Add mask` (unmasked) or the mask shape's
  own indented lane, labeled with the `venetian-mask` icon (new `ICON_PATHS` entry in
  `static/ui-icon.js`).
- The nested mask lane is **not** a normal draggable overlay lane — no independent
  z-order reordering, no lock toggle. It only exists nested under its target and moves
  with it in the list.
- Clicking `+ Add mask` opens a small type gallery (styled like the saved-style
  gallery, `ui-style-preset-card.js`) with one card in this pass: **Shape**.
- Clicking **Shape**:
  1. Creates a new `ShapeLayer` sized/positioned to match the target box's current
     `x`/`y`/`width`/`height` (via `ShapeDefaults` fields not covered by the target's
     rect, e.g. default `fill_color`/`opacity`/`corner_radius`).
  2. Pushes it into `project.shapes`.
  3. Sets `target.mask_shape_id = newShape.id`.
  4. Selects the new shape (`onTimelineSelect({ type: "shape", item: newShape })`),
     opening `#panel-shape` and switching the stage into rubylith edit view (see
     "Rendering").
- Selecting the nested mask lane opens `#panel-shape` exactly as it does for a normal
  shape — **the existing `ShapePanel.render(selectedId)` is reused verbatim**, all
  tabs (Box/Style/Time) present. No new subpanel component.
- Deleting a mask shape (existing Delete button in `panel-shape.js`) removes it from
  `project.shapes` **and** clears `target.mask_shape_id`, collapsing the accordion
  back to `+ Add mask`. (`panel-shape.js`'s delete handler needs a small addition to
  also clear the referencing box's `mask_shape_id`.)
- Deleting the **target** box (`VideoPanel`/`ImageBoxPanel` delete path) while it has
  `mask_shape_id` set must cascade-delete the mask shape too — otherwise the orphaned
  shape would lose its only reference and reappear as a normal visible shape with
  stale geometry.
- `panel-video-box.js`/`panel-image-box.js` lose their Mask tab entirely — those
  panels go back to Box + Time only. Mask assignment/editing lives entirely in the
  timeline accordion + `panel-shape.js`.

## Rendering

**Edit view** (the mask shape is the currently selected layer):
- The mask shape renders exactly like any other shape, via the existing
  `ShapePreview.render` (filled box, `fill_color`/`opacity`/`corner_radius`, drag/
  resize handles) — no new rendering path for the shape itself.
- The target box's stage element additionally gets a translucent red overlay
  (`rgba(255,0,0,0.5)`-ish) over the region the mask *removes*, so the cut is visible
  against the real footage while dragging the shape's handles. Photoshop
  quick-mask/rubylith convention: red = hidden, normal = kept.

**Final view** (mask shape not selected — normal editing/playback):
- The mask shape does not render on its own (excluded from the normal shape list in
  `ShapePreview`/timeline lanes/export bands, since it's referenced by a
  `mask_shape_id`).
- The target renders clipped to the mask: masked-out region undrawn, no red tint.

**Shared geometry helper** (mirrors the retired `box_mask.py`/`box-mask.js` pattern):
- `app/shape_mask.py` + `static/shape-mask.js` — pure function computing the mask
  rect in the **target box's local coordinate space**: `rel_x = shape.x - target.x`,
  `rel_y = shape.y - target.y`, plus `shape.width`/`shape.height`/`corner_radius`/
  `opacity`, clamped to the target's bounds. Mirrored and pinned the same way
  `box_mask.py`/`box-mask.js` were (a JS test running the JS mirror against the same
  case table as the Python tests).

**Preview**: apply the mask rect as a CSS `mask-image` on the target's stage element
— an inline SVG data URI (`<rect rx={corner_radius} fill="white"
fill-opacity={opacity}/>` inside a viewBox sized to the target's own width/height),
replacing the old `BoxMask.clipPath` hard clip-path with a soft-alpha CSS mask that
respects `opacity`.

**Export**:
- `app/shape_render.py` gains `write_shape_mask_png(path, target_width,
  target_height, rel_x, rel_y, shape_width, shape_height, opacity, corner_radius)` —
  same rounded-rect rasterization as `write_shape_png`, offset within a canvas sized
  to the target box, alpha scaled by `opacity`.
- `app/timeline.py`'s `banded_layers()` excludes any `ShapeLayer` referenced by a
  box's `mask_shape_id` from the normal `"shape"` bands.
- `app/main.py`'s export route: for any `VideoBoxLayer`/`ImageBoxLayer` with
  `mask_shape_id` set, looks up that shape, rasterizes a
  `{name}-{id[:8]}-band{i}-mask.png` sidecar via `write_shape_mask_png`, and attaches
  it as that band's `"mask_path"` — consumed by the existing `alphaextract`/
  `alphamerge` filter chain in `app/ffmpeg_cmd.py` unchanged (it already accepts an
  optional `mask_path` per band from the retired edge-mask feature).

## Removed entirely

- `app/box_mask.py`, `app/mask_image.py`
- `static/box-mask.js`, `static/ui-mask-line-drag.js`
- `static/css/components/mask-line-guide.css`
- `tests/test_box_mask.py`, `tests/test_box_mask_js.py`, `tests/test_mask_image.py`
- The Mask tab in `panel-video-box.js`/`panel-image-box.js` and its ANGLE/OFFSET/Flip
  controls.

## Testing plan

- **Backend**: `test_shape_render.py` extended for `write_shape_mask_png` (size/
  offset/alpha sampling, mirroring `test_mask_image.py`'s existing style, which is
  removed); `test_timeline.py` for `banded_layers()` excluding mask-referenced
  shapes; `test_main.py` export-route wiring (mask PNG generated + attached to the
  correct band); new `test_shape_mask.py` for the pure geometry function, plus
  `test_shape_mask_js.py` running the JS mirror against the same case table (pattern
  copied from `test_box_mask.py`/`test_box_mask_js.py`).
- **Frontend**: `node --test` coverage for `static/shape-mask.js`'s pure geometry.
- **Cascade delete**: a test covering "delete a masked target box → its mask shape is
  also removed from `project.shapes`".
- **Manual verification** (throwaway project, per this codebase's live-verify
  convention): add a mask to a video box, drag/resize it and confirm the rubylith
  tint tracks correctly on the target, deselect and confirm a clean composite,
  export and confirm the mp4 shows the masked region correctly.
