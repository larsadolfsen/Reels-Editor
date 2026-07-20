# Caption Word-Timing Editing — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

The Caption-words drill-down (`static/caption-panel-words.js`) shows each word's start time display-only; transcription timing is often slightly off and can't be corrected. Make `t_start`/`t_end` editable. User chose number fields over timeline dragging.

## Design

- The word list lives in the CAPTIONS drill-down today; the right-panel-tabs item ([2026-07-20-right-panel-tabs-design.md](2026-07-20-right-panel-tabs-design.md)) relocates it to a Closed-caption tab. This item edits the rows wherever the list currently lives — no ordering constraint between the two.
- In each word row of the drill-down, replace the static time label with two small editable number inputs (start / end, seconds, one decimal — same `decimals` option `UI.numberField` already has; if a full `UI.numberField` is too heavy per row, plain `<input type="number">` styled like the existing inline text input is fine — build session picks based on row density).
- Validation on commit: clamp `t_start ≥ 0`, require `t_start < t_end` (invalid edit reverts the field to the stored value). Overlaps with neighboring words are allowed — transcription itself produces near-adjacent words, and karaoke grouping (`group_words`) is order-based, not overlap-sensitive.
- On commit: update the `CaptionWord`, `saveProject()`, re-render the stage caption preview (existing pattern in the same file for text edits) and the timeline CAPTIONS row.

## Data model

None — `CaptionWord.t_start`/`t_end` already exist.

## Reuse

- `caption-panel-words.js`'s existing row rendering, commit-on-blur/Enter handling, save + re-render flow.
- `UI.numberField`'s `decimals` option (or its styling) for the inputs.

## Tasks

1. Editable start/end inputs per word row + clamp/validate helper + save/re-render wiring (single task — one file, one feature).

## Testing

Pure UI wiring over existing model fields — untested layer stated per convention; keep any clamp/validate helper as a tiny standalone function. Manual verification: edit a word's start/end → karaoke highlight timing shifts accordingly in preview and in an export; invalid values (negative, start ≥ end) revert; word deletion via empty text still works.

## Out of scope

- Dragging word boundaries on the timeline (explicitly declined).
- Editing word timing anywhere other than the drill-down.
- Auto-rippling neighboring words when one changes.
