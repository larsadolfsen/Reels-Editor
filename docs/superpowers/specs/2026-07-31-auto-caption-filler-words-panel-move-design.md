# Move Auto-caption into CAPTIONS panel's Auto tab; filler words into a subpanel

## Problem

Two related automations are currently split across panels and layouts in a way that makes them hard to find together:

- AUTO CAPTION (Language row + Auto-caption button) lives in the VIDEO panel's Auto tab, alongside the unrelated AUTO SILENCE feature.
- The CAPTIONS panel's "Filler words" tab always shows the full filler-word add-field + list inline, even before any transcript exists (the "found in transcript" flagging is meaningless with no transcript).

## Goal

- Move AUTO CAPTION (Language + Auto-caption button) out of the VIDEO panel's Auto tab into the CAPTIONS panel, renaming that panel's "Filler words" tab to **"Auto"**.
- VIDEO panel's Auto tab keeps only AUTO SILENCE.
- The filler-word list (add-field + word rows) becomes a drill-down subpanel opened from a "Filler words" settings row, instead of being always inline.
- The whole FILLER WORDS section (button + settings row) is hidden until a transcript exists.

No backend or data-model changes — this is a pure frontend reorganization.

## New layout — CAPTIONS panel's "Auto" tab (`#caption-auto-body`, tab value `auto`)

Top to bottom:

1. **AUTO CAPTION** eyebrow
   - `#caption-language-row` — settings row (label "Language", value = selected language label), opens `#panel-captions-language` drill-down (language list, same content/behavior as today's `#video-audio-language`).
   - `#caption-auto-caption-btn` — "Auto-caption" button (same `runAutoCaption()` behavior as today).
   - `#caption-transcribe-error` — error text (503/network-failure message).
2. **FILLER WORDS** section, wrapped in a container hidden unless `project.captions && project.captions.words.length > 0`:
   - `#caption-filler-auto-remove-btn` — "Auto-remove filler words" button (unchanged behavior).
   - `#caption-filler-words-row` — settings row (label "Filler words", value "`N words`"), opens `#panel-captions-filler` drill-down containing the existing add-input + `#caption-filler-words-list`.

VIDEO panel's Auto tab (`#video-auto-body`) keeps only the AUTO SILENCE section; the AUTO CAPTION markup is removed from it entirely (moved, not duplicated).

Tab icon: switch from the current "slice" icon to the `sparkles` icon (same one VIDEO panel's Auto tab already uses), for visual consistency between the two "Auto" tabs across panels.

## File changes

- **`static/audio-panel-auto-caption.js` → `static/caption-panel-auto-caption.js`**: same `runAutoCaption()` global function and logic, DOM ids updated to `caption-auto-caption-btn`/`caption-transcribe-error`. Still calls `renderCaptionPanel()` and `AudioTrackPanel.render()` (the latter refreshes AUTO SILENCE's "no transcript yet" hint in the VIDEO panel, which stays relevant).
- **`static/audio-panel-language.js` → `static/caption-panel-language.js`**: same list/select logic; `openLanguagePanel`/`closeLanguagePanel` now toggle `#panel-captions-main`/`#panel-captions-language` instead of `#video-main`/`#video-audio-language`. Settings row targets `#caption-language-row`.
- **`static/panel-audio-track.js`**: simplified — `render()` becomes `ensureCaptionTrack(); AutoSlicePanel.render();` (drops the language-row call and the error-hidden reset, both now owned by the CAPTIONS panel). Header comment updated to describe it as AUTO SILENCE-only.
- **`static/caption-panel-filler-words.js`**: adds `openFillerPanel`/`closeFillerPanel` (same hand-rolled pattern as `caption-panel-background.js`) toggling `#panel-captions-main`/`#panel-captions-filler`, plus a `UI.settingsRow` builder for `#caption-filler-words-row` showing `"${project.filler_words.length} words"`. `autoRemoveFillerWords()` and word add/remove logic unchanged. The whole FILLER WORDS container's `hidden` is set based on transcript presence on every render, mirroring `caption-panel-words.js`'s `caption-transcript-section` gating.
- **`static/panel-captions.js`**: `CAPTION_TABS` entry renamed `filler`→`auto`, label "Filler words"→"Auto", icon swapped to `sparkles`; `captionTabPanes.auto = [document.getElementById("caption-auto-body")]`; `renderCaptionPanel()` gains a call to render the language row (`CaptionPanel.renderLanguage()`, new export from the renamed language file) alongside the existing `CaptionPanel.renderFillerWords()`.
- **`static/panel-video.js`**: header comment updated (drop "AUTO CAPTION +" from the Auto tab description). No functional change — `video-auto-body` and the `AudioTrackPanel.render()` call stay.
- **`static/index.html`**: move the AUTO CAPTION markup block from `#video-auto-body` into a new `#caption-auto-body` (renamed from `#caption-filler-body`); remove `#video-audio-language`; add `#panel-captions-language` and `#panel-captions-filler` subpanel divs as siblings of `#panel-captions-main` inside `#panel-captions`, following the existing `#panel-captions-background`/`#panel-captions-border` pattern.

## Copy fixes (required for correctness, not scope creep)

- `panel-auto-slice.js`'s `auto-slice-no-transcript-hint` text ("Run Auto-caption above to also catch filler words.") no longer makes sense once Auto-caption isn't "above" it in the same panel — reword to reference the CAPTIONS panel's Auto tab.
- `caption-panel-words.js`'s empty-transcript hint ("No transcript yet — run Auto-caption in the AUDIO panel.") is already stale (Auto-caption hasn't lived in the AUDIO panel since the 2026-07-30 AUTO tab relocation) and becomes doubly wrong once Auto-caption lives in this same panel — reword to say "Auto-caption above" (it's now in the same panel, one tab over).

## Out of scope

- No changes to AUTO SILENCE's behavior or detection logic.
- No changes to the filler-word detection/matching logic (`FillerWords.detectRanges`, `/auto-slice/apply`).
- No backend changes.

## Testing

Pure-logic files here (`filler-word-ranges.js`, backend `auto_slice.py`) are untouched. This change is DOM wiring/layout only — no new pure functions to unit-test. Verify live in the browser on a throwaway project: open CAPTIONS panel's Auto tab with no transcript (FILLER WORDS section hidden, AUTO CAPTION visible), run Auto-caption, confirm FILLER WORDS section appears, open the Filler words subpanel and add/remove a word, confirm the settings-row count updates, and confirm VIDEO panel's Auto tab now shows only AUTO SILENCE.
