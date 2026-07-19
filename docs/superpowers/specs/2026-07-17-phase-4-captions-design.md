# Phase 4 — Captions

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** brainstormed and resolved 2026-07-19 — ready for `superpowers:writing-plans`.

## Goal

Replace the current non-functional placeholder caption panel (`#panel-captions` in `static/index.html` — disabled B/I/U/align icons, a static preview box) with real, functional captions: transcription, a track-level style reusing Phase 1's accordion components, a self-contained karaoke highlight, and a caption list subpanel for reviewing/editing every word with its timestamp.

This revives the original [2026-07-09-first-reel.md](../plans/2026-07-09-first-reel.md) plan's Tasks 10–12 (auto-captions, editable words, karaoke highlight), which were never started, adapted to the accordion architecture Phase 1 builds.

**Note on ordering:** an earlier draft of this doc had captions' karaoke highlight reuse the per-range highlight primitive from the Rich-Text Formatting phase (structurally the same "background behind a range of characters" idea). That phase was later rescheduled to land *after* Captions (it's now Phase 5, the highest-technical-risk piece, deliberately scheduled last among the feature phases), so that reuse is no longer possible without blocking Captions on it. Captions' karaoke highlight goes back to being self-contained here — plain ASS `\k` timing tags (per the original plan's Task 12) and a matching browser-side per-word tick, not shared with any rich-text mechanism. If Rich-Text Formatting (Phase 5) later wants to reuse *this* code instead, that's a fine direction to explore then, but it's not a dependency in either direction.

## Resolved decisions (2026-07-19 brainstorm)

**Style scope:** one shared track-level style, matching the original plan's single hardcoded `Caption` ASS style. No per-line/per-word styling — nothing has demanded it.

**Data model:** `CaptionTrack` gets a `preset_id: str` field pointing at a `TextPreset` row, the same pattern `TextBlockLayer.preset_id` already uses. This reuses the entire FONT/STYLE/BOX/POSITION UI code path (`TextPanel.renderFontFamily/renderFontStyle/renderStyle/renderPosition`, `editor.js`'s `renderBoxPanel`) almost verbatim, and the STYLE accordion's saved-style library works unmodified — a saved style can be applied to a text block or a caption track interchangeably.

```python
class TextPreset(BaseModel):
    ...  # all existing fields unchanged
    highlight_color: str = "#FFD400"
    highlight_mode: str = "current_word"   # current_word | progressive_fill
    max_words_per_line: int = 4
    # highlight_color / highlight_mode / max_words_per_line are read only by caption
    # rendering; harmless unused fields on a TextBlockLayer's preset.

class CaptionTrack(BaseModel):
    id: str = Field(default_factory=new_id)
    words: list[CaptionWord] = []
    z_index: int = 0
    preset_id: str   # NEW — points at a TextPreset, same pattern as TextBlockLayer.preset_id
```

**Highlight settings location:** `highlight_color`/`highlight_mode` live on `TextPreset` itself (not on `CaptionTrack`), so they travel with the STYLE accordion's saved/browse library along with font/box/position.

**Line grouping:** `max_words_per_line` is user-adjustable (not hardcoded at 4), also stored on `TextPreset`, surfaced as a number field in the HIGHLIGHT accordion.

**Panel layout** (`#panel-captions`, top to bottom):

```
[Auto-caption button]           (+ empty-state copy when no words yet)
(accordions, collapsed by default, same UI.accordionSection pattern as TEXT)
  FONT
  STYLE
  BOX
  POSITION
  HIGHLIGHT                     <- new, captions-only
    Mode: Current word | Progressive fill   (UI.buttonGroup)
    Highlight color                          (UI.colorSwatch)
    Max words per line                       (UI.numberField, default 4)
[Caption words >]                (UI.settingsRow -> drill-down list, mirrors Font Family list)
```

No TIME accordion — captions are already timestamped by transcription, not manually set start/end.

**Lazy creation:** `editor.js` gets `ensureCaptionTrack()`/`ensureCaptionPreset()`, mirroring the existing `ensureTextBlock()`/`ensureTextPreset()` — created the first time `#panel-captions` opens, so the accordions have something to bind to even before any words exist. Caption-appropriate defaults (not `TextPreset`'s generic size-96/y-700 defaults):

```
TextPreset(name="Caption", size_px=72, x=540, y=1520, align="center",
           highlight_color="#FFD400", highlight_mode="current_word",
           max_words_per_line=4)
```

**Re-transcribe behavior:** clicking Auto-caption when `project.captions` already exists overwrites `project.captions.words` with the new transcription but keeps the existing `preset_id` (and therefore all style edits) intact. No confirmation dialog — low stakes, easy to re-run.

**Caption word editing:** unchanged from the original plan's Task 11 — inline text editing per word in the drill-down list, empty text deletes the word, timing itself is not editable in v1.

## Subthreads

### Backend

1. **`app/transcribe.py`** — [parallel-safe]. faster-whisper wrapper: `words_from_segments(segments) -> list[CaptionWord]` (pure, testable without loading a real model) and `transcribe_file(path) -> list[CaptionWord]` (lazy `WhisperModel` load, module-level cache). Original plan's Task 10, Steps 1–3. Requires the `ml` optional dependency group (`faster-whisper`) — install with `.venv/Scripts/pip install -e .[ml]` when this subthread is picked up.
2. **`ffmpeg_cmd.build_audio_cmd`** — [parallel-safe]. Exports the assembled reel's audio-only track to a temp wav so transcribed word times are timeline-relative, not source-relative. Original plan's Task 10 addition to `app/ffmpeg_cmd.py`, with a test asserting one `atrim` per clip, `-vn` present, wav path last.
3. **`POST /api/projects/{pid}/transcribe` route** — [sequential, needs subthreads 1 and 2]. Wiring only in `app/main.py`: export audio via subthread 2 → `run_export` → `transcribe_file` (subthread 1) → if `project.captions` exists, overwrite its `words` in place (keep `preset_id`); otherwise create a fresh `CaptionTrack` with a new default-styled `TextPreset` (covers calling the route before the panel has ever opened) → save → return project.
4. **`ass_render.group_words` + karaoke dialogue** — [parallel-safe]. `group_words(words, max_words: int) -> list[list[CaptionWord]]` (pure, `max_words` now a parameter sourced from the track's preset rather than a hardcoded constant) plus `\k`-tag Dialogue-line generation, reading style from the track's actual `TextPreset` via the existing `_style()` helper (font/size/color/box/position) instead of the old hardcoded `CAPTION_STYLE` constant. Highlight color comes from `preset.highlight_color`. Both `highlight_mode` values are achievable with ASS karaoke tags — current-word-only and progressive-fill differ in which secondary-color tag (`\k` vs `\kf`/`\2c` sequencing) is emitted per word; pin down the exact tag sequence during plan-writing/implementation, verifying against real libass output rather than guessing here.

### Frontend — panel wiring

5. **Wire FONT/STYLE/BOX/POSITION accordions into the CAPTIONS panel** — [depends on Phase 1's accordion components existing]. Reuses Phase 1's `TextPanel.renderFontFamily/renderFontStyle/renderStyle/renderPosition` and `editor.js`'s `renderBoxPanel`, pointed at the caption track's preset (via `ensureCaptionPreset()`) rather than a text block's `preset_id`. No TIME accordion.
6. **HIGHLIGHT accordion** — [parallel-safe]. New, captions-only accordion: mode `UI.buttonGroup` (Current word / Progressive fill), `UI.colorSwatch` for highlight color, `UI.numberField` for max words/line — all writing directly onto the caption track's preset.
7. **Caption words drill-down** — [parallel-safe]. `UI.settingsRow` ("Caption words") opens a `UI.subPanelHeader` list (same shape as the Font Family drill-down) of every word, inline-editable text; empty text deletes the word.
8. **"Auto-caption" button wiring** — [sequential, after subthread 3 and 5]. Button at the top of `#panel-captions` that calls `ensureCaptionTrack()` (if needed) then `POST /api/projects/{pid}/transcribe`, shows a loading state, refreshes the panel on completion. Empty-state copy shown when no words exist yet.
9. **`preview.js` caption overlay** — [sequential, after Batch A lands]. Active-line rendering via a JS port of `group_words` (mirrors `font-fit.js`'s porting pattern from Python to JS), reading the caption preset's font/box/position exactly like `renderText()` does for text blocks, plus the live highlight tick (current-word vs progressive-fill) driven off `Preview.currentTimelineTime()`.

## Batching for parallel dispatch

- **Batch A — dispatch simultaneously:** subthreads 1, 2, 4 (backend, non-route) and 5, 6, 7 (frontend panel pieces — independent regions of `static/index.html`/`static/editor.js`, plus new files for the HIGHLIGHT accordion and caption-words drill-down).
- **Sequential, needs 1 + 2:** subthread 3 (transcribe route).
- **Sequential, needs Batch A merged:** subthread 8 (Auto-caption button needs the route from 3 and `ensureCaptionTrack`/panel wiring from 5).
- **Sequential, needs Batch A merged:** subthread 9 (preview overlay needs the preset shape settled by 5/6).
- **Last:** phase verification checkpoint, then `superpowers:finishing-a-development-branch`.

## Verification (phase checkpoint)

- `pytest -q` green (transcription tests mock the model — CUDA never touched in tests).
- Manual: open CAPTIONS panel on a fresh project → accordions/HIGHLIGHT/caption-words all present with caption-appropriate defaults even before transcribing. Click Auto-caption on a real clip with speech → words appear timed to the audio. Open the caption list, edit a wrong word, see it update live in the overlay. Toggle highlight mode and confirm both current-word and progressive-fill render correctly in preview. Adjust max words/line and confirm line grouping changes in preview. Style the caption track (font/box/position) and confirm it's independent of any text block's style. Re-run Auto-caption and confirm words refresh but style is preserved. Export and confirm karaoke `\k` highlighting matches the preview.
