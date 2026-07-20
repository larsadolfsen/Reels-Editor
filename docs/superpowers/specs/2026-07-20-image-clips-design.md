# Image/Photo Clips — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Add still images (jpg/png/webp) as timeline clips with a chosen duration.

## Data model

- `MediaItem.kind` gains `"image"` (field introduced by the audio item — whichever item lands first adds `kind: str = "video"`; this one extends the accepted values). `duration = 0.0`, `has_audio = False` for images.
- No `ClipLayer` change: for an image clip, `in_point = 0` and `out_point` = display duration (default 3.0 s on insert). The existing trim UI edits the duration for free.

## Design

- Import: the native picker's filter extends to image extensions; probe skips ffprobe duration for images (extension-based kind detection, same mechanism the audio item uses).
- Export (`app/ffmpeg_cmd.py`): image inputs use `-loop 1 -t <duration> -i <file>` and the standard scale/pad chain; audio side reuses the existing synthesized-silence path (`has_audio = False`) unchanged.
- Preview (`static/preview.js`): `playClipAt()` branches on kind — images show an `<img>` element overlaying/replacing the `<video>` for the clip's duration, driven by the same virtual-clock mechanism `preview.js` already has for zero-clip playback (reuse, don't reinvent); transitions back to the video element on the next real clip.
- Timeline: image clips render with their thumbnail; AUDIO row draws a flat line (comes free from `has_audio = False`).

## Tasks

1. `kind="image"` import/probe path (backend + tests).
2. Export command image-input branch (+ tests, incl. mixed image/video sequence).
3. Preview `<img>` clip playback via the virtual clock.
4. Picker filter + library/timeline thumbnail handling.

## Testing

- `test_ffmpeg_cmd.py`: loop/-t input args, silence path, mixed sequences. `test_media.py`: image probe path.
- Manual: image between two videos plays for its duration in preview and export; trim changes duration.

## Out of scope

- Ken Burns / pan-zoom animation.
- GIFs/animated images.
- Image-specific styling (borders/filters).
