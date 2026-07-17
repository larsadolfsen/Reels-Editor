# First Reel — Design Spec

Local, free CapCut alternative for vertical short-form video (TikTok/Reels).
Runs 100% on the user's PC (Ryzen 7 9800X3D, 32 GB RAM, RTX 5070 Ti 16 GB).
This spec covers **milestone 1: the first complete reel** — everything else is out of scope.

## Product decisions (from brainstorm, 2026-07-09)

- **Layer model, general underneath, presets on top.** A layer = source + position + timing.
  Ship only opinionated presets in v1. **No keyframe animation in v1** — the model allows it later without rewrite.
- **First reel needs exactly:** assemble **4–6 mp4 clips** sequentially, **cut/trim** each clip,
  **auto-captions** (editable, karaoke word-highlight, **hardcoded design**), and a
  **heading text block** (single line, **savable design presets**). Dropped the separate subheading
  line 2026-07-10 — one heading is enough for milestone 1.
- Text presets are the "brand kit" — the key advantage over CapCut (define a look once, reuse forever).
  Presets are stored globally (cross-project), each with a unique ID.
- Caption styling is **hardcoded** — one good karaoke look, no caption styling UI.
- Text block entrance: **fade + subtle pop**, part of the preset. Heading + subheading enter together as one block.
- Deferred (later milestones): free timeline layering/PiP, keyframes, text-behind-subject
  (segmentation), reveal/wipe masks, Claude API integration, posting/thumbnails.
- Output: a clean vertical .mp4 (1080×1920) the user uploads manually.

## Architecture

- **Backend:** Python 3.12+, FastAPI + uvicorn, serving a browser UI at localhost. No build step.
- **Frontend:** vanilla HTML/JS/CSS served as static files. Preview composites `<video>` + absolutely
  positioned text divs in a 9:16 stage. Thin wiring only — all logic that can be pure lives in Python and is tested.
- **Export:** ffmpeg CLI via subprocess. Trim + concat via filter_complex; text (block + captions)
  burned in via one generated **ASS subtitle** file (libass): `\fad`/`\t` for the entrance, `\k` for karaoke.
- **Transcription:** faster-whisper `large-v3` on CUDA, `word_timestamps=True`.
- **Persistence:** one JSON file per project + a global `presets.json`. Pydantic models, uuid4 IDs.

### Preview/export parity (known risk)

Preview (browser DOM) and export (ASS/libass) are two renderers. Parity is kept by using the same
font, sizes relative to 1080×1920, and same timing data in both; verified visually per task.
Pixel-perfect parity is **not** a v1 requirement — "trustworthy, no surprises" is.

## Data model

All entities have `id: str` (uuid4 hex). Relationships are explicit by ID.

- **Project** `{id, name, width=1080, height=1920, fps=30, clips: [ClipLayer], text_blocks: [TextBlockLayer], captions: CaptionTrack|null}`
- **ClipLayer** `{id, file_path, in_point, out_point, order}` — trim lives here; sequence = clips sorted by `order`.
- **TextPreset** `{id, name, font, size_px, color, outline_color, outline_px, box, box_color, align, x, y, entrance}` — global, savable.
- **TextBlockLayer** `{id, heading, preset_id, start, end}` — one text block, one entrance. (Revised 2026-07-10: dropped the separate `subheading` field — a single heading line only, for milestone 1.)
- **CaptionWord** `{id, text, t_start, t_end}` — timeline-relative seconds.
- **CaptionTrack** `{id, words: [CaptionWord]}` — style hardcoded, no preset reference.

## Testing

Pure logic (models, timeline math, ASS generation, ffmpeg command building, word grouping,
preset store) is pytest-covered. **Stated untested layer:** the browser UI wiring (JS) — kept as
thin as possible; verified manually per task with an explicit "how to try it" step.
Transcription is tested with a mocked model (real model exercised manually).

## Out of scope for milestone 1

Multiple video layers at once, keyframes, masking/segmentation, caption styling UI,
audio-less clips, project management UI (one project is fine), Claude API.
