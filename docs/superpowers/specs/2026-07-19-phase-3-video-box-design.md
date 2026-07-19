# Phase 3 — Video Box (Picture-in-Picture) — Design

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Replaces:** [2026-07-17-phase-3-video-box-design.md](2026-07-17-phase-3-video-box-design.md) (thin placeholder — this is the full brainstorm it called for)
**Status:** design complete, ready for implementation planning.

## Goal

Add one or more second visual clip layers ("video boxes") that composite picture-in-picture over the main timeline sequence — small videos positioned/sized on the 1080×1920 canvas, each with independent timeline placement, trim, and stacking order relative to the other overlay content (text blocks, and captions once Phase 4 lands).

## Resolved decisions

- **Data model:** a new `VideoBoxLayer` type, separate from `ClipLayer`, in its own `project.video_boxes` list — not optional fields bolted onto `ClipLayer`. `ClipLayer.order` only means something for the main concat sequence; a video box floats independently of it, closer in shape to `TextBlockLayer` (own timeline placement) than to a sequence entry.
- **Multiplicity:** any number of video boxes, like `text_blocks`.
- **Trim:** each video box has its own `in_point`/`out_point` into its source clip, independent of anything else.
- **Audio:** always muted. No mixing/ducking in this phase.
- **Source:** picked from `project.media_library` (already-imported files) — no separate upload flow.
- **Timeline duration:** a video box's on-timeline `end` is always derived as `start + (out_point - in_point)` — never stored independently, no freeze-frame/loop behavior.
- **Resize:** aspect ratio locked to the source clip's aspect ratio; no free stretch.
- **New-box default:** top-left corner, 100% canvas width, height derived from the source's aspect ratio.
- **Z-order:** fully arbitrary — any individual text block or video box can be interleaved with any other via a shared `z_index`. (See "Captions scoping note" below — captions participate in the field now but not the rendering yet.)
- **Drag-to-stitch:** dragging a video box's timeline block onto the main VIDEO row converts it into a sequence `ClipLayer` — keeping its `in_point`/`out_point`, discarding position/size/`z_index`. If dropped mid-clip, the existing clip splits at that point and the new clip is inserted between the halves.
- **Add flow:** a "+ Add Video Box" button in the VIDEO BOX context panel opens a picker over `project.media_library`.

## Data model

```python
class VideoBoxLayer(BaseModel):
    id: str = Field(default_factory=new_id)
    media_id: str
    file_path: str
    in_point: float = 0.0
    out_point: float
    start: float = 0.0        # timeline seconds; end is derived, never stored
    x: int = 0                # px, left edge on 1080x1920 canvas
    y: int = 0                # px, top edge
    width: int = 1080
    height: int                # px; set from source aspect ratio at creation, kept locked on resize
    z_index: int = -1          # new boxes default just below the default text z_index (0)
```

`TextBlockLayer` gains `z_index: int = 0` (existing projects default to 0 on load — no migration needed, ties are harmless since nothing conflicts with them yet). `CaptionTrack` gains `z_index: int = 0` too, reserved for Phase 4 (see scoping note below). `Project` gains `video_boxes: list[VideoBoxLayer] = []`.

### Captions scoping note

Captions have no rendering pipeline at all yet in this codebase — no stage-preview overlay, no ASS export (`app/ass_render.py`'s header comment: "captions land in Task 12," not yet done). `CaptionTrack.z_index` is added now for forward compatibility, but this phase's actual compositing/banding logic only needs to interleave **video boxes and text blocks** — the only two things that currently render. When Phase 4 (Captions) is picked up, it plugs its own ASS dialogue into the same banding mechanism this phase builds.

## Compositing / Z-order

One merged, sorted list drives both preview and export: every `TextBlockLayer` + every `VideoBoxLayer`, sorted ascending by `z_index`. The main sequence video is always the implicit floor (below everything in this list); it's never part of it.

**Preview** (`static/preview.js` + new `static/video-box-preview.js`): cheap — each overlay element (text-block div, video-box `<video>` element) gets its CSS `z-index` set directly to its model's `z_index`, inside the same stacking context (`#overlay`). Browser stacking does the rest. Each video box mounts its own `<video>` element, hidden outside its `[start, start + duration]` window, muted, `currentTime` kept in sync with the timeline clock the same way the main player already is.

**Export** (`app/ffmpeg_cmd.py` + `app/ass_render.py`): ffmpeg has no shared z-index concept across filter families (ASS burn-in vs. `overlay`), so the sorted list is walked once and partitioned into bands: consecutive text blocks accumulate into a pending "ASS band"; hitting a video box flushes that pending band (if non-empty) as one `ass=` filter step, then applies that box's `overlay` filter step (video-only, `enable='between(t,start,end)'`, pre-scaled to its `width`/`height`, positioned at `x`/`y`). Any trailing text blocks after the last video box flush as a final ASS pass:

```
[vc] -> [ass band 0]? -> overlay box A -> [ass band 1]? -> overlay box B -> ... -> [final ass band]? -> output
```

- `ass_render.render_ass()` gains a parameter to render only a given subset of `text_blocks` (instead of always all of them) — one temp `.ass` file per band.
- `build_export_cmd()` is restructured from its current single linear filter string into this alternating sequence — each video box is one extra `-i` input plus its own `trim/scale/overlay` filter-chain segment.
- Zero video boxes degenerates exactly to today's behavior (one ASS pass, applied last) — no regression for existing projects.

## Timeline UI

**New VIDEO BOX row** (`row-videobox` in `static/index.html`), positioned between `row-captions` and `row-video` to match the fixed visual stack: TEXT/CAPTIONS on top, VIDEO BOX above the main VIDEO row, AUDIO at the bottom. `static/timeline.js`'s `render()` gets a block loop for `project.video_boxes`, mirroring the existing TEXT row (block spans `start` to derived `end`; click selects → opens the VIDEO BOX context panel).

**Drag-to-stitch:** dragging a VIDEO BOX row block onto the main VIDEO row:
1. Compute the drop point's timeline time.
2. If it lands inside an existing `ClipLayer`'s span, split that clip into two `ClipLayer`s at that point (same `media_id`, trimmed `in_point`/`out_point` halves).
3. Insert a new `ClipLayer` there using the video box's `media_id`/`in_point`/`out_point`, renumbering `order` for everything after.
4. Remove the `VideoBoxLayer` from `project.video_boxes`.

This is a new cross-row drag handler in `editor.js` (mousedown on a video-box block, mouseup over the VIDEO row) plus a pure helper function for the split/insert/renumber math.

**Layers reordering:** a LAYERS section, its own entry in the left icon rail (mirrors SETTINGS/EXPORT), listing every entry from the merged z-order list — each text block and video box shown as one row (small type icon + name/heading, e.g. "Video Box: clip3.mp4" / "Text: My Heading"), sorted by current `z_index`, top of the list = highest `z_index` = frontmost. Plain HTML5 drag-and-drop (`draggable="true"` rows, `dragover`/`drop` reordering — no new dependency). On drop, all rows renumber `0..N-1` in the new order and save.

**VIDEO BOX context panel** (`#panel-video-box`, own left-rail entry): "+ Add Video Box" opens a media-library picker (reuses `project.media_library`); selecting an item creates a new `VideoBoxLayer` with the settled defaults. When a box is selected (from the timeline row or the LAYERS list): TRIM (in/out `UI.numberField`s, mirrors `#panel-video`), TIME (start only — end is read-only/derived), and on-stage POSITION/SIZE via `UI.resizeHandles` (its existing `onResize`/`onDragEnd` callbacks post-process deltas to enforce the locked aspect ratio) + a new plain drag-to-move interaction (simpler than `ui-text-interaction.js` since there's no edit-mode to distinguish from a move — any drag is a move).

## Components / files

New:
- `app/models.py` — `VideoBoxLayer`, `z_index` fields, `Project.video_boxes` (edit, not new file)
- `app/ass_render.py` — banding-capable `render_ass()` subset parameter (edit)
- `app/ffmpeg_cmd.py` — banded filter-graph builder (edit)
- `app/main.py` — export route wiring for the banded build (edit)
- `static/index.html` — `row-videobox` markup, `#panel-video-box`, `#panel-layers`, panel-nav entries (edit)
- `static/timeline.js` — VIDEO BOX row rendering (edit)
- `static/ui-video-box-drag.js` — new generic move-only drag interaction (new file)
- `static/video-box-preview.js` — stage preview `<video>` mounting/sync (new file)
- `static/panel-video-box.js` — VIDEO BOX context panel component (new file)
- `static/panel-layers.js` — LAYERS panel component (new file)
- `static/css/components/video-box-panel.css` — styling for the VIDEO BOX panel (new file)
- `static/css/components/layers-panel.css` — styling for the LAYERS panel (new file)
- `static/editor.js` — `ensureVideoBox*` helpers, `renderVideoBoxPanel`/`renderLayersPanel` orchestration, `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS` additions, drag-to-stitch handler (edit)

## Testing

- `tests/test_models.py` — `VideoBoxLayer` round-trip, `z_index` defaults.
- `tests/test_ffmpeg_cmd.py` — banded filter-graph construction: zero boxes (matches today's output), one box interleaved with text, multiple boxes at different z-bands.
- `tests/test_ass_render.py` — subset rendering (only the text blocks in a given band).
- Manual/visual: add a video box, drag-resize/move it on stage, reorder it above/below a text block via LAYERS, drag it onto the main VIDEO row to stitch, export and confirm the rendered mp4 matches the preview's stacking order.
