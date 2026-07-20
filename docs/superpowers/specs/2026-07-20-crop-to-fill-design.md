# Crop-to-Fill — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Non-9:16 footage is always letterboxed (scale-decrease + pad). Add a per-clip choice to crop/zoom to fill the frame instead.

## Data model

- `ClipLayer.fill_mode: str = "fit"` — `"fit"` (today's pad) | `"fill"` (crop). Default keeps existing projects unchanged.

## Design

- Export (`app/ffmpeg_cmd.py`): `"fill"` swaps the per-clip chain to `scale=1080:1920:force_original_aspect_ratio=increase, crop=1080:1920` (center crop); `"fit"` keeps the current decrease+pad chain.
- Preview: the stage `<video>` gets `object-fit: cover` vs `contain` per clip (class toggle in `playClipAt()`, CSS in `stage.css`).
- UI: VIDEO panel gets a FILL row — 2-option `UI.buttonGroup` (FIT/FILL), mirroring the BOX size-mode idiom.

## Tasks

1. Model field + export chain branch (+ tests asserting crop vs pad filters).
2. Preview object-fit toggle + VIDEO panel button group.

## Testing

- `test_ffmpeg_cmd.py`: crop filter for fill, pad for fit, per-clip mixing.
- Manual: landscape clip fills the frame in preview and export identically.

## Out of scope

- Manual reframing (pan/position the crop window).
- Per-clip zoom level.
