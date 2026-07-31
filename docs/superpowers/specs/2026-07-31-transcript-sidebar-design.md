# Transcript sidebar (editor-only paragraph captions view)

Date: 2026-07-31

## Problem

The CAPTIONS panel's transcript tab lists every word with its raw start/end timestamps — useful for precise editing, but hard to read as prose while monitoring playback. There's no at-a-glance view of "what sentence is being said right now."

## Goal

Add a new, always-visible, editor-only element beside the video stage that renders the caption transcript as flowing sentences directly on the app background (no panel chrome). The active sentence is highlighted (bright text vs. grey for the rest), the current word within it is highlighted in an accent color, and the view auto-scrolls to keep the active sentence in view during playback. Clicking any word seeks the playhead to that word's start time.

This is purely a frontend monitoring/navigation aid. It does not change the exported video, the on-video karaoke caption overlay, or the existing CAPTIONS side panel — all of that is untouched.

## Layout

`#stage-wrap` currently lays out `#stage` and `#transport` in a centered flex column. This changes to:

```
#app
 └─ main
     ├─ aside#panel            (left icon rail — unchanged)
     ├─ #center-col            (unchanged: flex column, full remaining width)
     │   ├─ section#stage-wrap (CHANGED: column → row)
     │   │   ├─ div#stage-column   (NEW wrapper — carries #stage-wrap's old column/center styling for #stage + #transport, unchanged look)
     │   │   └─ div#transcript-sidebar  (NEW — fills the row's remaining width)
     │   └─ #timeline-strip    (unchanged, full-width below both)
     └─ aside#style-panel      (right context panel — unchanged)
```

`#transcript-sidebar` is a sibling of `#stage-column` inside `#stage-wrap` only — not a new top-level column. It doesn't affect the left rail, the right context panel, or the timeline strip. When the project has no captions (`project.captions` unset or `words` empty), `#transcript-sidebar` renders nothing and `#stage-wrap`'s `justify-content: center` keeps the stage centered as it is today.

Styling: no border, no background box — text sits directly on `--bg-0`. `min-width: 0`, `max-width` capped (~480px) for readability, `overflow-y: auto` for scrolling, padding via existing `--space-*` tokens.

## Data: sentence grouping

New pure module `static/transcript-sentences.js`:

```js
window.TranscriptSentences.groupBySentence(words) -> [{ start, end, words: CaptionWord[] }]
```

Walks the flat `CaptionWord[]` list (`project.captions.words`) and starts a new group after any word whose text ends in `.`, `!`, or `?`. A trailing run of words with no terminal punctuation still forms a final group — no words are ever dropped. `start`/`end` are the first/last word's `t_start`/`t_end`. No Python mirror needed — this is editor-display-only, not part of export.

## Rendering & highlighting

New self-registered module `static/transcript-sidebar.js`, following the existing self-registered-subscriber pattern (`stage-tool-cursor.js`, `caption-clip-sync.js` consumers) rather than exposing a render loop the caller must drive:

- **Structural rebuild** — one `<div class="transcript-sentence">` per sentence, one `<span class="transcript-word">` per word (via `TranscriptSentences.groupBySentence`). Runs whenever caption words change: project load/restore (`openProject`, `applyRestore`/`reRenderAfterRestore`), word edits in `caption-panel-words.js`, and auto-caption completion (`caption-panel-auto-caption.js`). Also runs once on initial page load if a project with captions is already open.
- **Per-tick highlight** — subscribes via the existing `Preview.onTimeUpdate(fn)` hook (no changes to `preview.js`). On each tick: finds the active sentence (the one whose `[start, end)` contains the current timeline time) and the active word within it, toggles `.active`/`.active-word` classes (no DOM rebuild). Calls `scrollIntoView({ block: "center", behavior: "smooth" })` on the active sentence element only when the active sentence changes (not every tick).
- **Colors**: active sentence text `--text`, inactive sentence text `--text-muted` (or `--text-dim`), active word `--accent-gold` — a fixed color, independent of the caption preset's `spotlight_color`.

## Interaction

Each word `<span>` gets a click handler calling `Preview.seek(word.t_start)` — the same seek path already used by the playhead-grip drag and timeline ruler clicks.

## Files

- New: `static/transcript-sentences.js` (pure, node-testable), `static/transcript-sidebar.js`, `static/css/components/transcript-sidebar.css`
- Edited: `static/index.html` (introduce `#stage-column` wrapper, add `#transcript-sidebar`), `static/css/components/stage.css` (`#stage-wrap` column → row, `#stage-column` takes over the old column/centering rules)
- Small integration edits at existing caption-change call sites: `panel-captions.js`, `caption-panel-auto-caption.js`, `panel-nav.js`'s `reRenderAfterRestore`, and wherever `openProject` first loads a project

## Testing

`tests/js/transcript-sentences.test.js` (`node --test`) covers `groupBySentence`: splitting on `.`/`!`/`?`, a trailing fragment with no terminal punctuation, an empty word list, and a single run-on sentence. The rendering/DOM module (`transcript-sidebar.js`) stays thin per project convention (no business logic beyond wiring) and is verified live in the browser rather than unit tested.

## Non-goals

- No changes to the exported video or ASS caption burn-in.
- No changes to the on-video karaoke caption overlay (`preview-captions.js`) or the CAPTIONS side panel's transcript tab.
- No sentence-level click-to-seek (word-level only).
- No persistence of scroll position or any new project/model fields — this is purely derived, ephemeral UI state.
