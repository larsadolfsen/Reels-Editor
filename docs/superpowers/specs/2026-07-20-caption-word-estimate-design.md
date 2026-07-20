# Caption Per-Word Timing Estimation — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

A `CaptionWord` entry's `text` can already hold more than one word (e.g. `"talks about this"`) — nothing in the model or the just-shipped word-timing editor stops that, and that's the intended authoring shape: a caption entry is a chunk (like a real subtitle line), authored with one `t_start`/`t_end`, not necessarily one word per entry.

The actual gap is downstream: karaoke highlighting (`preview.js`'s `renderCaptions`, `ass_render.py`'s `_karaoke_dialogue`/`_current_word_dialogues`) treats each entry as a single highlighted unit for its whole duration. A multi-word entry's text lights up all at once instead of sweeping word-by-word. There's no per-word timing to highlight against unless the entry happens to hold exactly one word (as real faster-whisper transcription output does today).

## Design

Add one pure function, mirrored in JS and Python (same pattern as `app/timeline.py` mirrored in `static/preview.js`, or `static/timeline-snap.js`'s standalone pure helpers):

- **Algorithm:** split `text` on whitespace into words, rejoin with single spaces to get a normalized string. For each word, take its character start/end offset in that normalized string, and linearly interpolate a `t_start`/`t_end` within the entry's own `[t_start, t_end]` proportional to `offset / total_length`. A single-word entry's normalized string equals the word itself, so its estimated range is exactly `[t_start, t_end]` — a no-op. This means real transcription output (already one word per entry with accurate timestamps) is unaffected; only multi-word entries get sub-divided.
- **Python:** `app/caption_word_estimate.py` — `estimate_word_timings(word: CaptionWord) -> list[CaptionWord]`. Takes one `CaptionWord`, returns one or more synthetic `CaptionWord` instances (same `id`, suffixed with `-0`, `-1`, … for multi-word splits — ids aren't persisted anywhere so collisions don't matter, they just need to be non-empty strings for the existing `CaptionWord` model to validate) covering the estimated sub-ranges. A whitespace-only or empty `text` returns `[]` (entries with empty text are already deleted by the editing UI, but export shouldn't choke if one somehow exists).
- **JS:** `static/caption-word-estimate.js` — `Timeline.estimateWordTimings(word) -> [{id, text, t_start, t_end}]`, same algorithm, same shape. Loads after `timeline.js` (attaches onto the existing `window.Timeline` object, same load-order pattern as `timeline-snap.js`) — safe because `groupWords`'s body only calls it at render time, long after all scripts have loaded, not at parse time.

**Integration point:** both existing grouping functions expand every entry through this helper *before* sorting/chunking into lines, so every current caller keeps working unchanged with zero call-site edits:
- `app/ass_render.py`'s `group_words(words, max_words)`: first flat-maps `words` through `estimate_word_timings`, then groups the expanded list exactly as it does today.
- `static/timeline.js`'s `groupWords(words, max)`: first flat-maps `words` through `Timeline.estimateWordTimings`, then groups as today.

Because grouping is the single choke point every caller already goes through (`preview.js`'s `renderCaptions`/`activeCaptionGroup`, `timeline.js`'s own CAPTIONS-row rendering, `timeline-snap.js`'s boundary collection, `ass_render.py`'s `render_caption_ass`), no other file changes. The CAPTIONS timeline row will now show one block per estimated word instead of one block per authored chunk — a more accurate reflection of what actually highlights during playback/export, not a regression.

The Caption-words drill-down (`static/caption-panel-words.js`, shipped earlier today) needs **no changes** — it already edits chunk-level `text`/`t_start`/`t_end` directly against `track.words`, which remains the single source of truth. The estimation is purely a rendering/export-time computation, never persisted.

## Data model

None. `CaptionWord.text`/`t_start`/`t_end` already support this; no new fields, no migration.

## Reuse

- `app/ass_render.py`'s existing `group_words`/`_karaoke_dialogue`/`_current_word_dialogues` — untouched except `group_words`'s first line.
- `static/timeline.js`'s existing `groupWords` — untouched except its first line.
- Load-order/attachment pattern from `static/timeline-snap.js` (pure helper file loaded after `timeline.js`, attaches onto the existing `window.Timeline`).

## Tasks

1. `app/caption_word_estimate.py` + `estimate_word_timings` + tests (single-word passthrough, multi-word proportional split, empty/whitespace text).
2. Wire into `app/ass_render.py`'s `group_words` (one-line change) + a test confirming a multi-word entry expands into multiple ASS `\k`/`\1c` segments.
3. `static/caption-word-estimate.js` + `Timeline.estimateWordTimings`, mirroring task 1's algorithm.
4. Wire into `static/timeline.js`'s `groupWords` (one-line change) + script tag in `static/index.html`.

## Testing

- Python: unit tests for `estimate_word_timings` (single word unchanged; two/three-word proportional split — longer words get proportionally longer windows; empty text returns `[]`); one `ass_render.py` test confirming a multi-word `CaptionWord` produces multiple karaoke segments in the rendered ASS.
- JS: pure function, same cases as the Python side — no test runner for JS in this project (existing convention, per `static/timeline-snap.js`'s precedent of being untested at the JS-file level); verify live instead: seed a multi-word caption entry via the console, confirm the stage preview's highlight sweeps word-by-word across it instead of lighting the whole phrase at once, and confirm the timeline CAPTIONS row now shows one block per estimated word.
- `pytest -q` green.

## Out of scope

- Manual per-word timing overrides within a chunk (declined earlier in this conversation — estimation is always derived, never independently editable).
- Changing how `max_words_per_line` line-grouping works (kept as-is, operating on the expanded flat word list).
- Any change to the Caption-words drill-down UI.
