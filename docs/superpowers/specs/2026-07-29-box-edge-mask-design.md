# Straight-edge mask for video & image boxes

Date: 2026-07-29

## Goal

Let a Video Box or Image Box be cut along a straight line, hiding one side so the
layers beneath show through.

The driving use case: duplicate a clip as a Video Box laid exactly over the main
clip, then cut the box along a vertical pole in the shot. The person filmed on one
side of the pole appears to walk out from behind it while the same person, from
another take, stands on the other side — a "clone yourself" effect with no green
screen and no ML segmentation.

This supersedes the original "auto masking of person" idea as the first step: it
delivers the effect the user actually wants with a static, instant, dependency-free
mechanism. Per-pixel person segmentation remains a possible later feature and would
reuse this feature's compositing path.

## Scope

In scope:

- `VideoBoxLayer` and `ImageBoxLayer` (both — their code mirrors each other
  throughout this codebase, and the mask is meaningful for either).
- Live preview on the stage.
- Burned into the exported mp4.

Out of scope for v1:

- Curved, freeform, or multi-segment mask shapes. One straight line only.
- Feathered/soft mask edges. Hard edge only.
- Masking main VIDEO-sequence clips (the box layers cover the use case).
- Animating the mask over time — angle and offset are static per box.
- Any ML segmentation.

## Data model

Four new fields on both `VideoBoxLayer` and `ImageBoxLayer` in `app/models.py`.
All are defaulted, so projects saved before this feature load and behave unchanged.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mask_enabled` | `bool` | `False` | Whether the cut line applies at all. |
| `mask_angle` | `float` | `0.0` | Degrees. `0` is a vertical line; increasing rotates clockwise. |
| `mask_offset` | `float` | `0.0` | Signed distance in canvas px from the box's center to the line, measured perpendicular to the line. |
| `mask_flip` | `bool` | `False` | Which side of the line is kept. |

The line is expressed relative to the box's own center, so moving or resizing the
box carries the mask with it — no separate coordinate bookkeeping.

Setting `mask_enabled = False` (or leaving it unset) must produce exactly the
current behavior in preview and in export, byte-identically in the latter.

## Shared line math

One pure function, mirrored in Python and JS the way `app/text_case.py` /
`static/text-case.js` and `app/caption_layout.py` / `static/caption-layout.js`
already are in this codebase:

```
mask_polygon(width, height, angle, offset, flip) -> list[(x, y)]
```

Given the box's size in canvas px and the three mask parameters, it returns the
polygon of the **kept** region, in box-local px, clipped to the box's rectangle.
Both the preview and the export build their mask from this one function, so the two
cannot drift apart.

Contract:

- The returned polygon is always within `[0, width] × [0, height]`.
- A line that misses the box entirely yields either the full rectangle (everything
  kept) or an empty polygon (nothing kept), depending on which side `flip` selects.
- Vertex order is consistent (clockwise) so both consumers can rely on it.

Files: `app/box_mask.py` and `static/box-mask.js` (`window.BoxMask.maskPolygon`),
each a small single-purpose module per this project's file conventions.

## Preview

`static/video-box-preview.js` and `static/image-box-preview.js` set
`clip-path: polygon(...)` on the box's `<video>` / `<img>` element, built from
`BoxMask.maskPolygon()` and scaled from canvas px to the element's on-stage px.
When `mask_enabled` is false, no `clip-path` is set.

This is a static CSS property recomputed only on render — no per-frame work, no new
libraries, and it composites correctly against the layers below because the boxes
already live as siblings in `#overlay` with explicit z-indexes.

## Export

`app/ffmpeg_cmd.py`'s banded export path gains, for a band whose box has
`mask_enabled` set:

1. A PNG mask the size of the box — opaque white inside the kept polygon,
   transparent outside — drawn with Pillow (already a dependency, used by
   `app/font_metrics.py`) and written next to the existing `.ass` sidecar files.
2. That PNG added as one more ffmpeg input, `alphamerge`d onto the box's scaled
   video/image stream, immediately before the existing `overlay` step.

Everything else in the chain — trimming, scaling, positioning, band ordering,
audio — is untouched. A project with no masked box produces a byte-identical
command to today's.

Mask PNG generation lives in its own module, `app/mask_image.py`, exposing
`write_mask_png(path, width, height, angle, offset, flip)` built on
`app.box_mask.mask_polygon`.

## UI

A third tab, **Mask**, in both the VIDEO BOX and IMAGE BOX context panels, beside
the existing Box and Time tabs and wired with the same `UI.tabBar` pattern those
panels already use. It contains:

- An on/off toggle (`UI.buttonGroup`, OFF/ON) bound to `mask_enabled`.
- **ANGLE** — `UI.numberField`, degrees.
- **OFFSET** — `UI.numberField`, px.
- **FLIP** — a `.panel-button` swapping `mask_flip`.

Every control saves the project and re-renders the stage preview immediately, the
same way the existing X/Y/WIDTH/HEIGHT fields in these panels do.

Additionally, when a masked box is selected, its cut line renders on the stage as a
draggable guide: dragging along the line shifts `mask_offset`, dragging its end
handle changes `mask_angle`. Aligning a cut to a real pole by typing numbers is
impractical, so this is the primary interaction and the number fields are the
precise fallback. The guide follows the existing stage-overlay interaction patterns
(`static/ui-resize-handles.js`, `static/ui-video-box-drag.js`) and lives in its own
file, `static/ui-mask-line-drag.js`.

## Delivery packages

Each package ends with something runnable or visible, and a commit.

1. **Line math** — `app/box_mask.py` + `static/box-mask.js` with their tests.
   Visible as: `pytest` run passing on the new test file.
2. **Model fields** — the four fields on both layer types, with tests covering
   defaults and round-trip persistence.
3. **Preview clipping** — `clip-path` applied in both box-preview modules. Visible
   as: hand-set `mask_enabled` on a box in a throwaway project and see it cut on
   the stage.
4. **Mask panel fields** — the Mask tab with toggle/angle/offset/flip in both
   panels. Visible as: cut a box interactively from the side panel.
5. **Export** — `app/mask_image.py` plus the `alphamerge` step in
   `app/ffmpeg_cmd.py`, with tests. Visible as: export a masked project and play
   the resulting mp4.
6. **On-stage drag guide** — `static/ui-mask-line-drag.js` wired into both box
   previews. Visible as: drag the cut line onto a pole in the footage.

## Testing

Automated:

- `tests/test_box_mask.py` — the polygon function: vertical cut, horizontal cut, an
  angled cut, `flip` inverting the kept side, a line entirely outside the box in
  both directions, and clipping to the box bounds.
- The JS mirror gets the same case table, so the two implementations are pinned to
  identical output.
- `tests/test_models.py` — the four new fields default correctly and survive a
  save/load round trip on both layer types.
- `tests/test_ffmpeg_cmd.py` — a masked box adds exactly one mask input and one
  `alphamerge`; an unmasked project's command is unchanged from the current
  expected output.
- `tests/test_mask_image.py` — the generated PNG has the right size and mode, is
  opaque on the kept side and transparent on the cut side at sampled pixels.

Manual, stated rather than silently skipped:

- The panel wiring (`UI.tabBar` tab, field callbacks) and the `clip-path`
  application are thin DOM glue with the logic already extracted into the tested
  pure function. Verified in the browser on a throwaway project: enable the mask,
  change angle/offset, flip, confirm the stage cut matches, then export and confirm
  the mp4 matches the preview.
- The on-stage drag guide is likewise verified by hand — drag along and rotate,
  confirm the number fields track the drag and the saved project persists it.
