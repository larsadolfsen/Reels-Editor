# Image Box overlay — design

## Problem

Images can be imported into the media library (`MediaItem.kind == "image"`) and inserted as full-screen clips onto the VIDEO row, but there's no way to place an image as a picture-in-picture overlay box on the stage — the way `VideoBoxLayer` already lets you do with video. This adds that: an IMAGE BOX panel/overlay, following the existing VIDEO BOX pattern.

## Scope (from brainstorming)

- New overlay type: a resizable/movable image box on the stage, separate from full-screen image clips.
- Overlay only — no drag-to-stitch onto the VIDEO row as a full clip (that's already covered by the existing MEDIA → VIDEO row import path for images).
- Timing: `start` (timeline seconds) + `duration` (seconds). No in/out trim — a static image has no source timeline to trim.
- Renders in both the editor preview *and* burns into the exported mp4.
- Added only from the media library (images already imported via IMPORT MEDIA) — the panel has no separate file picker of its own.
- Joins the existing unified overlay z-order stack (same mechanism as TEXT/VIDEO BOX today: draggable reorder lane on the timeline, `z_index`-based export banding).

## Data model

`app/models.py` — new `ImageBoxLayer`:

```python
class ImageBoxLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    start: float = 0.0        # timeline seconds
    duration: float = 3.0     # seconds the box is visible
    x: int = 0                 # px, left edge on the 1080x1920 canvas
    y: int = 0                 # px, top edge
    width: int = 1080
    height: int                # px; set from the image's aspect ratio at creation, kept locked on resize
    z_index: int = -1          # same convention as VideoBoxLayer: new boxes default just below text (0)
```

`Project.image_boxes: list[ImageBoxLayer] = []`.

No `in_point`/`out_point` fields (unlike `VideoBoxLayer`) — `start`/`duration` is the entire timing model, matching that a static image has no source timeline to trim into.

## Unified overlay z-order stack

Today `OverlayLayers.mergedEntries` (JS) and `app/timeline.py`'s `banded_layers` (Python) merge `text_blocks` + `video_boxes` into one z_index-ordered stack. Both gain a third `"image_box"` kind alongside `"text"`/`"video_box"`:

- `static/timeline-overlay-layers.js`: `mergedEntries` also maps `project.image_boxes` to `{id, kind: "image_box", item}` entries before sorting.
- `app/timeline.py`: `banded_layers` also includes `("image_box", b)` entries in its z_index-sorted merge; each image box becomes its own band (same as a video box — a band boundary, not a run that can accumulate like consecutive text blocks).
- Drag-to-reorder (`timeline-overlay-layer-drag.js`) needs no change — it already operates generically on merged entries + `OverlayLayers.renumber`.

## Stage preview

New `static/image-box-preview.js`, `window.ImageBoxPreview`, closely mirroring `video-box-preview.js`:

- Mounts one `<img class="image-box">` per visible box into `#overlay`.
- Visible when `start <= timelineTime < start + duration`, or when selected (so the selected box stays clickable/draggable even outside its time window, matching the video-box and text-block convention).
- Position/size synced from `x/y/width/height` scaled to the stage's rendered size, `z-index` from `z_index`.
- Click-to-select: a plain click on an unselected box in Select-tool mode fires `onActivate(boxId)`; no-ops in Text-tool mode so the click bubbles to `stage-click-router.js` (insert-text-here), matching `video-box-preview.js`.
- Drag-to-move (`UI.videoBoxDrag`) + resize (`UI.resizeHandles`, aspect-locked) wired the same way as video boxes.
- No playback/currentTime sync needed (static image) — simpler than the video version.
- `window.ImageBoxPreview.{render, setSelectedImageBox, setOnActivate}` — same shape as `VideoBoxPreview`.

## Panel

New `static/panel-image-box.js`, `window.ImageBoxPanel`, mirroring `panel-video-box.js`:

- `#panel-image-box` context-panel section (added to `static/index.html`), styled via a new `static/css/components/image-box-panel.css` (mirrors `video-box-panel.css`'s layout).
- Empty state: "ADD IMAGE BOX" button opens a picker (`#image-box-picker-list`) listing `project.media_library` items with `kind === "image"` only.
- Picking an item creates an `ImageBoxLayer`: probes the image's natural width/height (via an `Image()` element, mirroring `probeVideoAspect`'s `<video>` probe) to set `width: 1080, height: round(1080 * h/w)`, `start: 0, duration: 3.0, x: 0, y: 0, z_index: -1`.
- Detail view, tab-barred (`UI.tabBar`, Box default):
  - **Box tab**: SIZE & POSITION (X/Y/WIDTH/HEIGHT number fields, aspect-locked resize — same `applyAspectLock` logic as `panel-video-box.js`). No TRIM group (no in/out).
  - **Time tab**: START + DURATION number fields (replacing VIDEO BOX's START + IN/OUT).
- Delete footer button removes the box from `project.image_boxes`.
- Stage resize/move wired through `ImageBoxPreview.setSelectedImageBox(box.id, {...})` exactly like `VideoBoxPreview.setSelectedVideoBox`.

## Navigation wiring (`static/panel-nav.js`)

Same shape as the VIDEO BOX entries, added alongside them:
- `showPanel`'s panel-id list gains `"image-box"`; also clears `ImageBoxPreview.setSelectedImageBox(null, null)` when switching away from it (mirrors the video-box clear).
- `onTimelineSelect` gains an `image-box` branch: `showPanel("image-box"); ImageBoxPanel.render(item.id);`.
- New `openImageBoxPanel()` function (mirrors `openVideoBoxPanel`).
- `PANEL_NAV_ITEMS` gains an "IMAGE BOX" rail entry (icon: reuse a simple image-glyph SVG from Lucide, e.g. the `image` icon).
- `PANEL_NAV_HANDLERS` gains `"image-box": openImageBoxPanel`.
- `reRenderAfterRestore` gains an `image-box` branch mirroring the `video-box` one (look up the box by id, fall back to `openFilesPanel()`).

## Timeline row

`static/timeline.js`'s `renderOverlaysRow` gains a third branch (alongside `"text"`/else-video_box) for `entry.kind === "image_box"`: renders a block labeled with the image's filename, selectable via `onSelect({ type: "image-box", item })`. No `draggable`/`dragstart` wiring (no drag-to-stitch, per scope). The lane label switches on `entry.kind` to show "TEXT" / "VIDEO BOX" / "IMAGE BOX".

`setRowVisible("overlays", ...)`'s condition also checks `(project.image_boxes || []).length > 0`.

## Export

`app/ffmpeg_cmd.py`'s banded-export loop (already alternates ASS-burn bands with video-box overlay bands) gains an `"image_box"` band case:

```
-loop 1 -t <duration> -i <file_path>
```
as the input, then:
```
[<idx>:v]scale=<width>:<height>[imgN];
<current>[imgN]overlay=x=<x>:y=<y>:enable='between(t\,<start>\,<start+duration>)'[imgN_out]
```
— same `overlay` + `enable` pattern as the video-box band, minus the `trim`/`setpts` (no source timeline to trim).

`app/main.py`'s `export_project`: the `if p.video_boxes:` banded-export trigger becomes `if p.video_boxes or p.image_boxes:` (banding is needed whenever there's anything besides flat text+captions to interleave). Bands are built from `timeline.banded_layers(p)`, which already produces `"image_box"`-kind band dicts once the model above lands — `main.py`'s band-building loop gains an `elif band["kind"] == "image_box": bands.append({"kind": "image_box", "image_box": band["image_box"]})`.

## Testing

- `test_models.py`: `ImageBoxLayer` round-trips through JSON (id/defaults).
- `test_timeline.py`: `banded_layers` correctly interleaves image boxes with text/video boxes by z_index (own band, not merged with adjacent text).
- `test_ffmpeg_cmd.py`: `build_export_cmd` with an `image_box` band produces the expected `-loop 1 -t` input + scale + overlay/enable filter chain.
- `test_main.py`: export route exercises the `p.image_boxes`-only case (no video boxes) to confirm the banded path triggers correctly.
- Frontend (`image-box-preview.js`, `panel-image-box.js`, `timeline-overlay-layers.js`'s `mergedEntries`) is thin DOM/UI wiring per this codebase's stated pattern for such layers — no existing JS test harness covers `video-box-preview.js`/`panel-video-box.js` either, so this stays consistent: verified manually in-browser (add an image box, move/resize it, confirm it shows in the timeline lane and z-order reorder, then run an export and confirm the image appears composited in the output).

## Out of scope (not building now)

- Drag-to-stitch an image box into the main VIDEO clip sequence.
- A dedicated file picker inside the IMAGE BOX panel (library-only for now).
- Any image-specific styling (border/background/opacity) — box is position+size+timing only, matching VIDEO BOX's current feature set.
