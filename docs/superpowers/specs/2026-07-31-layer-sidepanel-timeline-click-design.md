# Click a timeline row label to open its side panel

## Problem

The timeline's left-column row labels (TEXT, VIDEO BOX, IMAGE BOX, SHAPE lane labels;
MAIN, AUDIO, CAPTIONS fixed-row labels) are currently plain text with no click
behavior. Only clicking a row's *block* selects that item and opens its side panel.
Users expect clicking the label itself to do the same.

## Scope

Pure DOM event wiring — no new data model fields, no new panels. Reuses the existing
`onSelect`/panel-open functions that block clicks already call.

## Design

### 1. Overlay lanes (TEXT / VIDEO BOX / IMAGE BOX / SHAPE)

In `static/timeline.js`'s `renderOverlaysRow`, each lane's `text` label span (currently
just `textContent`, sibling of the `.overlay-lane-handle` icon) gets a `click` listener
that calls the same `onSelect({ type, item })` its block's click handler already calls
for that `entry`.

The listener is added to the `text` span specifically, not the parent
`.overlay-lane-label` div — the handle icon's lock-toggle/drag-reorder listener
(`timeline-overlay-layer-drag.js`) is delegated on `#label-overlays` and gated by
`e.target.closest(".overlay-lane-handle")`, so it only reacts to the handle itself and
is unaffected by this change. Scoping the new listener to the `text` span (rather than
the whole label) keeps the two interactions independent: clicking the handle only
locks/drags, clicking the text only selects/opens.

### 2. MAIN label (`#label-video`)

Click selects the currently-selected clip if one is selected (`selected.type ===
"video"`), else the first clip (`clips[0]`), then calls `onSelect({ type: "video", item:
clip })`. No-ops if there are zero clips. Bound once per page load via the existing
`dataset.selectBound` guard pattern (matching `#row-audio`'s existing wiring), reading
fresh clip/selection state from `renderTimeline`'s module-level `lastProject`/
`lastSelected` trackers so the handler stays correct across re-renders without
re-binding.

### 3. AUDIO label (`#label-audio`)

Same guard pattern as MAIN, calling the existing `actions.onSelectAudio` callback —
already wired by `editor.js` to `openAudioPanel()` and already used by `#row-audio`'s
content click. No new callback needed.

### 4. CAPTIONS label (`#label-captions`)

Same guard pattern, calling a new `actions.onOpenCaptionsPanel` callback. `editor.js`
wires it to `openCaptionsPanel()` (the same function the CAPTIONS rail entry and
`onTimelineSelect`'s caption branch use), mirroring how `onSelectAudio` is wired today.
Clicking this label just opens the panel — it doesn't select a specific caption group.

## CSS

Add `cursor: pointer` in `static/css/components/timeline.css` to the now-clickable
labels: `#label-video`, `#label-audio`, `#label-captions`, and the overlay lane's `text`
span (needs a class, e.g. `.overlay-lane-label-text`, since it's currently an unstyled
anonymous span).

## Out of scope / explicitly declined

- No visual distinction (e.g. underline) beyond the pointer cursor — matches how block
  clicks look today (no special "clickable" affordance beyond cursor).
- No behavior change to the handle icon's own click (lock toggle) or drag (reorder).

## Testing

Pure DOM event wiring with no new decision logic to unit test. Verified manually in the
browser on a throwaway project: click each row/lane label type and confirm the correct
panel opens with the correct item selected (MAIN falls back to first clip when nothing
is selected, and keeps the current selection otherwise).
