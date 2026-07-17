# Phase 3 — Captions

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — subthreads verified/refined by a brainstorm at pickup time before their plans are written.

## Goal

Replace the current non-functional placeholder caption panel (`#panel-captions` in `static/index.html` — disabled B/I/U/align icons, a static preview box) with real, functional captions: transcription, a track-level style reusing Phase 2's accordion components, a karaoke-style highlight, and a caption list subpanel for reviewing/editing every word with its timestamp.

This revives the original [2026-07-09-first-reel.md](../plans/2026-07-09-first-reel.md) plan's Tasks 10–12 (auto-captions, editable words, karaoke highlight), which were never started, adapted to the accordion architecture Phase 2 builds.

## Open question for the pre-phase brainstorm

**How is a caption track's style modeled?** Is FONT/STYLE/BOX/POSITION one shared preset applied to the whole caption track (simplest, matches the original plan's single hardcoded `Caption` ASS style), or can different lines/words carry different styling (more flexible, much more complex — no evidence this is needed yet)? Recommend starting with one shared track-level preset unless the brainstorm surfaces a concrete reason not to — it's the original plan's assumption and nothing since has demanded per-word styling.

## Subthreads

### Backend

1. **`app/transcribe.py`** — [parallel-safe]. faster-whisper wrapper: `words_from_segments(segments) -> list[CaptionWord]` (pure, testable without loading a real model) and `transcribe_file(path) -> list[CaptionWord]` (lazy `WhisperModel` load, module-level cache). Original plan's Task 10, Steps 1–3. Requires the `ml` optional dependency group (`faster-whisper`) — install with `.venv/Scripts/pip install -e .[ml]` when this subthread is picked up.
2. **`ffmpeg_cmd.build_audio_cmd`** — [parallel-safe]. Exports the assembled reel's audio-only track to a temp wav so transcribed word times are timeline-relative, not source-relative. Original plan's Task 10 addition to `app/ffmpeg_cmd.py`, with a test asserting one `atrim` per clip, `-vn` present, wav path last.
3. **`POST /api/projects/{pid}/transcribe` route** — [sequential, needs subthreads 1 and 2]. Wiring only in `app/main.py`: export audio via subthread 2 → `run_export` → `transcribe_file` (subthread 1) → set `project.captions = CaptionTrack(words=...)` → save → return project.
4. **`ass_render.group_words` + karaoke dialogue** — [parallel-safe]. `group_words(words, max_words=4)` (pure) plus `\k`-tag Dialogue-line generation, using the caption track's style (from the Phase 2-shaped preset, once the open question above is settled) instead of the original plan's hardcoded `CAPTION_STYLE` constant. Original plan's Task 12, adapted.

### Frontend — panel wiring

5. **Wire FONT/STYLE/BOX/POSITION accordions into the CAPTIONS panel** — [depends on Phase 2's accordion components existing]. Reuses Phase 2's `renderFontRow`-style components and their backing `UI.*` calls, but pointed at the caption track's preset rather than a text block's `preset_id`. No TIME accordion — captions are already timestamped by transcription, not manually set start/end.
6. **HIGHLIGHT accordion for captions** — [parallel-safe, depends on Phase 2's highlight fields]. Adds a mode toggle: **current word only** (single active word highlighted) vs **progressive fill** (karaoke-style — all spoken words stay highlighted up to and including the current one). Likely a new `highlight_mode: str` field alongside Phase 2's `highlight`/`highlight_color`, scoped to whichever model ends up holding caption style per the open question above.
7. **Caption list subpanel** — [parallel-safe]. New drill-down component (structurally similar to the existing font list subpanel pattern — `UI.subPanelHeader`, a list, click/hover interactions) showing every caption word/line with its `t_start`/`t_end`, text editable inline (empty text deletes the word, per the original plan's Task 11 — timing itself stays non-editable in v1, matching that plan's accepted limitation).
8. **"Auto-caption" button wiring** — [sequential, after subthread 3]. Button in `editor.js` that calls the transcribe route and refreshes state on completion.
9. **`preview.js` caption overlay** — [sequential, after the above land]. Active-line rendering (grouped via `group_words`, mirrored client-side per the original plan) plus the live highlight tick implementing whichever mode is selected (current-word vs progressive-fill) against `Preview.currentTimelineTime()`.

## Verification (phase checkpoint)

- `pytest -q` green (transcription tests mock the model — CUDA never touched in tests).
- Manual: click Auto-caption on a real clip with speech → words appear timed to the audio; open the caption list, edit a wrong word, see it update live in the overlay; toggle highlight mode and confirm both current-word and progressive-fill render correctly in preview; export and confirm karaoke `\k` highlighting matches the preview.
