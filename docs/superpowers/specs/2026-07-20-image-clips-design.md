# Image/Photo Clips — Design

**Status:** brainstormed 2026-07-20; preview hand-off design resolved 2026-07-21. No open questions.

## What / Why

Add still images (jpg/png/webp) as timeline clips with a chosen duration.

## Data model

- `MediaItem.kind` gains `"image"` (field introduced by the audio item — whichever item lands first adds `kind: str = "video"`; this one extends the accepted values). `duration = 0.0`, `has_audio = False` for images.
- No `ClipLayer` change: for an image clip, `in_point = 0` and `out_point` = display duration (default 3.0 s on insert). The existing trim UI edits the duration for free.

## Design

- Import: the native picker's filter extends to image extensions (a combined "Media files" group plus separate "Video files"/"Image files" groups); probe skips ffprobe duration for images (extension-based kind detection via a pure `is_image_path()` helper in `app/media.py`, same mechanism the audio item uses). `GET /api/probe` additionally returns `kind` so the client knows which default duration to apply on insert (media `duration=0` for images; the `ClipLayer.out_point` the client creates defaults to 3.0s instead of the probed duration).
- Export (`app/ffmpeg_cmd.py`): image inputs prepend `-loop 1 -t <duration>` to their `-i` (duration = the existing per-clip `(out_point-in_point)/speed` calc); the rest of the per-clip trim/setpts/scale/pad/fps chain is unchanged. Audio side reuses the existing synthesized-silence path (`has_audio = False`) unchanged — no new branch needed there.
- Timeline: image clips render with the existing generic `.clip-thumb` placeholder block styling — already kind-agnostic, so no timeline.js change is needed for this. AUDIO row draws a flat line (comes free from `has_audio = False`).

### Preview hand-off design

Image clips stay ordinary entries in `project.clips` (per the "no ClipLayer change" decision above), so they can appear anywhere in a mixed sequence — the existing zero-clip virtual clock (which only engages when `clips.length === 0`) doesn't apply. Instead, the single `<video>`-driven sequence player gets a per-clip image branch:

- **New file `static/image-clip-playback.js`** (`window.ImageClipPlayback`) — a DOM-free per-clip timer, structurally a scoped-down copy of `preview.js`'s existing virtual-clock pattern: `start(clip, startElapsed, {onTick, onDone})`, `pause()`, `resume()`, `seekTo(t)`, `stop()`, `isPlaying()`, `getElapsed()`. Drives one `requestAnimationFrame` loop bounded by the clip's duration; `onTick(elapsed)` fires every frame, `onDone()` fires once at the end.
- **`static/preview.js`** changes (surgical, not a rewrite):
  - A sibling `<img id="image-player">` beside `#player` in `index.html`; `stage.css` extends the `#player` sizing/object-fit rule to include it, plus a shared `.stage-hidden { display: none }` toggle class.
  - `load()` builds a `mediaById` map from `project.media_library` (refreshed every load, same lifetime as `clips`) so `clipKind(c)` can resolve `media_id → kind`.
  - `playClipAt(index, autoplay = true)` branches on `clipKind`: the video path is unchanged except it now only calls `player.play()` when `autoplay` is true (`load()` passes `false` — this makes explicit the "don't autoplay on open" behavior that today only works by accident, because a non-muted `<video>.play()` gets silently blocked by the browser's autoplay policy). The image path hides `#player`, shows `#image-player` with the clip's file, and calls `ImageClipPlayback.start(...)` with a new shared `renderOverlaysAt(timelineTime)` helper (de-duplicating the text/caption/video-box/time-readout refresh block currently copy-pasted across `virtualTick` and the video `timeupdate` listener) as `onTick`, and an `onDone` that advances to the next clip or stops at the end of the sequence — mirroring the video branch's out-point check exactly.
  - `computeTimelineTime()`, `doPlay`/`doPause`/`doRestart`/`isPaused`, and `seek()` each gain a small `isImageActive()` branch (`activeIndex` clip's kind is `"image"`) that reads/drives `ImageClipPlayback` instead of `player.currentTime`/`.play()`/`.pause()`. Behavior mirrors the video path 1:1: `seek()` across a clip boundary always lands paused (matching the video branch's existing behavior, not a new capability); `seek()` within the same clip just repositions.
  - `maybePreloadNext` skips images (no benefit prefetching a still image into the hidden preload `<video>`).

## Tasks

1. `MediaItem.kind` field + `is_image_path()` + `GET /api/probe` image branch (backend + tests).
2. Export command image-input branch (`-loop 1 -t <duration>`) (+ tests, incl. mixed image/video sequence).
3. `image-clip-playback.js` (new, DOM-free timer module).
4. `preview.js` image hand-off (`playClipAt`/`computeTimelineTime`/`doPlay`/`doPause`/`doRestart`/`isPaused`/`seek`, `#image-player` element + CSS, `renderOverlaysAt` de-dup).
5. Picker filter (`pick_file` image extensions) + client-side `addClip()` default-duration branch for images.

## Testing

- `test_ffmpeg_cmd.py`: loop/-t input args, silence path, mixed image/video sequences. `test_media.py`: `is_image_path()`, image probe path (no ffprobe subprocess call). `test_models.py`: `MediaItem.kind` default.
- Manual (throwaway project, synthetic image clip injected since native file-picker import can't be automated): image between two videos plays for its duration in preview and export; scrubbing across the image boundary and back; play/pause while an image is active; trim changes the image's displayed duration.

## Out of scope

- Ken Burns / pan-zoom animation.
- GIFs/animated images.
- Image-specific styling (borders/filters).
