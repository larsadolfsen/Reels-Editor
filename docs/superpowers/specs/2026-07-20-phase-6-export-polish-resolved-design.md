# Phase 6 — Export Polish (resolved design)

**Parent:** [2026-07-17-phase-6-export-polish-design.md](2026-07-17-phase-6-export-polish-design.md)
**Status:** brainstormed and approved 2026-07-20 — ready for implementation plan.

## Goal

Final pass across the whole editor now that every layer type (text, text box, captions, video box) is functional: confirm preview and export agree, clean up the two known limitations still present from the original plan, and do a whole-milestone end-to-end verification.

## Scope confirmation

All three subthreads from the parent design doc still apply:
1. Preview/export parity spot-checks per layer type
2. Clean up known limitations (audio-stream requirement, clip-join hiccup)
3. Whole-milestone end-to-end verification

The original plan's third and fourth "known limitations" are already resolved by later phases and are dropped from this phase's scope:
- ~~Caption timing not editable; no caption styling UI~~ — resolved by Phase 4 (Captions) and Phase 5 (Rich-Text Formatting).
- Preview/export parity remains "visual-trust level, not pixel-perfect" by design (unchanged bar, not a limitation to fix).

## Task order

Parity checks run first, since they might surface issues the fixes below should also address:

1. Preview/export parity spot-checks (3 checks: text block+box, captions, video box)
2. Audio-stream fix (synthesize silent audio for video-only clips)
3. Clip-join hiccup investigation + fix
4. Whole-milestone end-to-end verification + automated smoke test

### 1. Parity spot-checks

Manual. For each layer type, load a sample project, pause the preview at 2-3 timestamps, export, and compare the corresponding exported frame against the paused preview. No code changes expected unless a mismatch turns up — a mismatch becomes its own bugfix task, scoped when found.

### 2. Audio-stream fix

**Reuses:** `app/media.py`'s existing `ffprobe_cmd`/`_resolve_cmd` pattern; `app/ffmpeg_cmd.py`'s existing filter-graph builder.

**Problem:** ffmpeg's concat filter requires every input to have both a video and audio stream (`v=1:a=1`); a video-only clip currently breaks export.

**Data model:** `MediaItem` (`app/models.py`) gains `has_audio: bool = True`. Populated at import time (`app/main.py`'s add-media flow) via a new `app/media.py` function `has_audio_stream(path) -> bool` — ffprobe with `-select_streams a -show_entries stream=codec_type`, true if any audio stream is reported. Defaulting to `True` means existing saved projects render identically until their media is re-probed (no migration needed, no behavior change for already-working projects).

**Export:** `build_export_cmd` (`app/ffmpeg_cmd.py`) looks up each clip's `has_audio` via `p.media_library` (clips reference media by `media_id`). For a clip whose media lacks audio, add a `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100` input trimmed to that clip's `(out_point - in_point)` duration, used in the concat filter graph in place of that clip's real `[i:a]` stream.

**Tests:** `tests/test_media.py` — `has_audio_stream` test with a mocked subprocess call (same pattern as existing probe tests). `tests/test_ffmpeg_cmd.py` — a case with a video-only clip in the project, asserting the built command includes an `anullsrc` lavfi input and the concat graph still balances (same `v=1:a=1` count as clip count).

### 3. Clip-join hiccup

Root cause is currently unknown. This task starts with the `systematic-debugging` skill to find the actual cause in `static/preview.js`'s clip-switching logic (likely around the `timeupdate`/`ended` handling that advances `activeIndex`) before proposing any fix. No fix approach is decided upfront.

### 4. Whole-milestone end-to-end verification

**Manual:** assemble one sample project exercising every layer type — trimmed clips including at least one video-only clip, a styled text block with a box, auto-generated and hand-edited captions with karaoke highlight, and a video box. Export it and watch the result start to finish.

**Automated smoke test:** new `tests/test_export_smoke.py` builds a `Project` in-memory exercising every layer type and calls `build_export_cmd` (plus the `ass_render` functions it depends on for text/caption/video-box layers) end-to-end, asserting no exception is raised and the resulting command list is well-formed. This is a pipeline-integrity check ("the whole thing doesn't blow up when every feature is combined"), not a pixel-comparison test.

## Known limitations after this phase

- Preview/export parity stays visual-trust level, not pixel-perfect (accepted from the original plan, unchanged).
- No new limitations are being deliberately introduced by this phase.
