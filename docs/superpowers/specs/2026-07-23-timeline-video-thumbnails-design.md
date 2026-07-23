# Timeline VIDEO-row thumbnails (filmstrip)

## Problem

The timeline's VIDEO row currently renders every clip block with a plain diagonal-stripe
placeholder background (`static/css/components/timeline.css`, `.timeline-row[data-row="video"]
.timeline-block`). There's no visual preview of what a clip actually contains — you have to
click it and scrub the stage to know.

## Goal

Show a real filmstrip (a strip of sampled frames from the source video) inside each VIDEO-row
clip block, so scanning the timeline gives a visual sense of each clip's content. The filmstrip
should redraw with more or fewer distinct frames as the timeline zoom level changes, the way
video editors' timelines typically behave.

## Reused existing code

- `app/media.py`'s `_resolve_cmd`/`_refreshed_path` (PATH-aware ffmpeg invocation) and
  `is_image_path` — the new filmstrip generator uses the same subprocess pattern as
  `generate_thumbnail`.
- The `data/<subdir>/{media_id}.<ext>` cache-by-id convention already used by
  `generate_thumbnail` (`data/thumbnails/`) and `peaks_for_media` (`data/peaks/`).
- `static/timeline-audio-row.js`'s per-clip `<canvas>` pattern (one canvas per clip block,
  positioned absolutely like `.timeline-block`, redrawn on every `render()`) — the filmstrip
  canvas follows the same shape.
- `static/api-get-media-thumbnail.js`'s object-URL fetch pattern, for the new filmstrip fetch.
- The `app/caption_word_estimate.py` \<-\> `static/caption-word-estimate.js` convention of
  mirroring one pure function on both sides so the client doesn't need an extra round trip to
  know something the server already knows how to compute.
- `MediaItem.duration` (already probed at import time) — the client derives frame layout from
  this without any new network call.

Nothing existing already does per-clip video thumbnails in the timeline, so this is new code,
not a duplicate.

## Data model

No changes to `app/models.py`. No new persisted entities — everything here is a derived,
cache-by-id artifact keyed on `MediaItem.id`, exactly like the existing thumbnail (`data/
thumbnails/{media_id}.jpg`) and waveform peaks (`data/peaks/{media_id}.json`) caches.

## Backend

### `app/filmstrip.py` (new file)

- `frame_interval(duration: float, max_frames: int = 120) -> float` — pure. Seconds between
  sampled frames: `1.0` for anything up to 120s, otherwise `duration / max_frames` so a long
  source clip still yields at most `max_frames` sampled frames (bounds sprite-sheet size/ffmpeg
  cost).
- `frame_count(duration: float, interval: float) -> int` — pure. `max(1, ceil(duration /
  interval))`.
- `FRAME_W = 40`, `FRAME_H = 60` module constants (2:3 aspect, same proportions as the existing
  68x102 thumbnail box, just smaller since these tile many-up).
- `generate_filmstrip(media_id: str, file_path: str, data_dir: Path) -> Path` — mirrors
  `generate_thumbnail`'s shape:
  - Cache path: `data_dir / "filmstrips" / f"{media_id}.jpg"`. Returns immediately if it already
    exists (invalidated by absence only, same as the other caches).
  - Computes `interval`/`count` from `probe_duration`-derived duration (passed in by the caller,
    which already has `MediaItem.duration` — no re-probing).
  - Builds one ffmpeg command that samples frames and tiles them into a single horizontal sprite
    sheet: `-vf "fps=1/{interval},scale={FRAME_W}:-1:force_original_aspect_ratio=decrease,pad=
    {FRAME_W}:{FRAME_H}:(ow-iw)/2:(oh-ih)/2,tile={count}x1" -frames:v 1 -q:v 5 <thumb_path>`.
  - Images (`is_image_path`) go through the same code path with `count = 1`, `interval` irrelevant
    — ffmpeg's `fps` filter on a single still frame naturally yields one sampled frame, so no
    branching is needed the way `generate_thumbnail` branches on `-ss`.
  - Resolves the command via `_resolve_cmd(cmd, _refreshed_path())`, same as every other ffmpeg
    call in `app/media.py`.

### `app/main.py`

- `GET /api/media/{media_id}/filmstrip?path=...` — thin wrapper: calls
  `filmstrip.generate_filmstrip(media_id, path, data_dir)` then returns it as a `FileResponse`,
  mirroring the existing `/api/media/{media_id}/thumbnail` route exactly.

## Frontend

### `static/filmstrip-layout.js` (new file)

- `Filmstrip.frameInterval(duration, maxFrames = 120)` / `Filmstrip.frameCount(duration,
  interval)` — pure JS mirrors of the two Python functions above, byte-identical logic. Lets the
  client compute the sprite's frame layout from `media.duration` alone, without waiting on a
  metadata round trip.

### `static/api-get-media-filmstrip.js` (new file)

- `Api.getMediaFilmstrip(mediaId, filePath) -> Promise<string | null>` — `GET /api/media/{id}/
  filmstrip?path=...`, returns an object URL for the sprite JPEG or `null` on a failed fetch.
  Same shape as `api-get-media-thumbnail.js`.

### `static/timeline-video-row.js` (new file)

- `window.TimelineVideoRow.render(blockDiv, clip, media, px)`:
  - Fetches the sprite for `media.id` via `Api.getMediaFilmstrip`, cached client-side in a
    module-local `Map` keyed by media id (same pattern as `timeline-audio-row.js`'s
    `peaksCache`) so repeated renders/zoom changes don't refetch.
  - On the first successful fetch for a given block, mounts one `<canvas>` inside `blockDiv`
    (`position: absolute; inset: 0`), sized to the block's current pixel width × the VIDEO row's
    height (56px, read from the block's own `clientHeight` rather than a hardcoded constant).
  - Draws the filmstrip: computes `interval`/`count` for `media.duration` via `Filmstrip.*`, then
    walks the canvas left-to-right in steps of `frameSpanPx = (interval / clip.speed) * px`
    (how many canvas px one sampled source-frame interval spans at the current zoom and clip
    speed). For each step, maps the canvas x back to source time
    (`clip.in_point + (x / px) * clip.speed`), picks the nearest frame index
    `clamp(round(t / interval), 0, count - 1)`, and `drawImage`s that sprite slice
    (`sourceX = frameIndex * FRAME_W`) stretched across the step's canvas-px span.
  - Because `render()` re-runs (and re-sizes the canvas) on every timeline re-render — including
    zoom changes — the same sprite is simply resampled at a different `px`, which is what makes
    the filmstrip "adjust to zoom" without any zoom-specific branching.
  - While the sprite hasn't loaded yet (or the fetch failed), the block keeps its existing
    striped-placeholder background — `TimelineVideoRow.render` simply doesn't mount a canvas in
    that case, so the CSS placeholder (already the block's `background`) shows through
    underneath.

### `static/timeline.js`

- In the VIDEO-row loop (around `timeline.js:239-247`), after `addBlock(...)`, call
  `TimelineVideoRow.render(videoTrack.lastElementChild, c, media, px)`.

### `static/css/components/timeline.css`

- Add a bottom scrim gradient behind `.timeline-row[data-row="video"] .timeline-block span` (the
  filename label) so it stays legible over arbitrary video frame content instead of only the
  flat stripe background.

## Error handling

- A failed sprite fetch (network error, ffmpeg failure surfaced as a non-200) leaves the block on
  its existing striped placeholder — no error state needs to reach the user, since this is a
  purely cosmetic enhancement over an already-functional block.
- `generate_filmstrip` raising (e.g. ffmpeg not on PATH) propagates the same way every other
  ffmpeg-backed route already does in this codebase (a 500 the client's `try/catch` in
  `Api.getMediaFilmstrip` swallows into `null`).

## Testing

- `frame_interval` / `frame_count` (`app/filmstrip.py`): direct unit tests — under 120s duration
  gives `interval == 1.0`; a long duration gives a scaled-up interval keeping `frame_count <=
  max_frames`; a zero/negative duration doesn't divide by zero.
- `generate_filmstrip`: mocked-`subprocess.run` tests mirroring `test_generate_thumbnail`'s three
  cases — video (fps/tile filter present in the built command), image (still produces a 1-frame
  sprite via the same code path, no special-cased branch), and cached-reuse (existing file means
  `subprocess.run` is never called).
- `static/filmstrip-layout.js`'s two functions are pure ports of the tested Python functions —
  no separate JS test harness exists in this repo, so correctness is guaranteed by the two
  implementations being kept identical (documented in both files' header comments) plus manual
  browser verification.
- `static/timeline-video-row.js` is thin canvas/DOM wiring with no independently testable logic
  beyond the two pure `Filmstrip.*` functions it calls — verified manually: open the editor with
  a real video clip on the timeline, confirm a filmstrip renders, confirm it changes as the
  zoom controls are used, confirm a clip with a broken/missing media path still shows the
  striped placeholder instead of erroring.

## Out of scope

- Any change to `MediaItem`, `ClipLayer`, or other persisted data.
- Filmstrips for the VIDEO BOX row (picture-in-picture layers) — this spec covers the VIDEO row
  only.
- Re-encoding or invalidating a cached filmstrip if the source file changes on disk — matches the
  existing thumbnail/peaks caches' "invalidated by absence only" behavior.
