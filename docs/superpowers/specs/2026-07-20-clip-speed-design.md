# Clip Speed Control — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Slow-mo / speed-up per clip. Range 0.5×–2.0× (matches ffmpeg `atempo`'s single-filter range — no chaining needed).

## Data model

- `ClipLayer.speed: float = 1.0` (0.5–2.0). Default keeps existing projects unchanged.

## Design

- **Timeline math is the core:** `app/timeline.py`'s `clip_duration` becomes `(out_point - in_point) / speed`; `locate()`'s timeline-time → source-time conversion multiplies by `speed`. The JS mirrors in `preview.js`/`timeline.js` change identically. Every consumer (sequence duration, ruler, slice, captions timing) then follows automatically — this is why the pure functions exist.
- Export (`app/ffmpeg_cmd.py`): per-clip video chain gains `setpts=PTS/<speed>`, audio chain gains `atempo=<speed>` (pitch-preserving; skipped at 1.0). Synthesized-silence clips only need the video side.
- Preview (`static/preview.js`): `player.playbackRate = clip.speed` in `playClipAt()`. (Pitch preservation is browser default.)
- UI: VIDEO panel (Time tab once tabs land) gets a SPEED `UI.numberField` (0.5–2.0, step 0.1, ×) or button group of presets (0.5/1/1.5/2) — build session picks by available space; numberField recommended.
- Interaction with transcription: `build_audio_cmd` gets the same `atempo` so caption timestamps align with sped-up audio.

## Tasks

1. Model field + `timeline.py` speed-aware math (+ tests).
2. JS mirror updates (`preview.js`, `timeline.js`).
3. Export command changes (`ffmpeg_cmd.py` incl. `build_audio_cmd`, + tests).
4. VIDEO panel SPEED control + `playbackRate` in preview.

## Testing

- `test_timeline.py`: durations/locate at 0.5×/2×; `test_ffmpeg_cmd.py`: setpts/atempo present, absent at 1.0.
- Manual: sped clip plays fast in preview, matches in export, captions still line up after re-transcribe.

## Out of scope

- Speeds outside 0.5–2.0 (needs atempo chaining).
- Speed ramps/keyframes.
- Freeze frames.
