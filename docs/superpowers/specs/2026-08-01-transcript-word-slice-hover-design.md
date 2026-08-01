# Transcript word hover slice-toolbar — design

Date: 2026-08-01

## Goal

In the transcript sidebar (`#transcript-sidebar`, `static/transcript-sidebar.js`), hovering a word
reveals a small popover toolbar with a scissors button. Clicking it slices the MAIN clip sequence
at that word's start time, exactly as if the user had scrubbed the playhead there and clicked the
existing timeline scissors button.

## Reuse

- `UI.popoverToolbar` (`static/ui-popover-toolbar.js`) — the existing hover-reveal chip component,
  already used by the timeline's overlay-lane copy toolbar. Reused as-is, no changes.
- `Timeline.sliceClip` / `Timeline.isSliceDisabled` (`static/timeline-slice.js`) — the existing pure
  main-clip slicing helpers, already driving the timeline's own `#slice-action` scissors button.
- The click handler's save/reload sequence (`saveProject()` → `Preview.load(project)` →
  `Preview.seek(t)` → `renderTimeline()`) mirrors `timeline-slice.js`'s existing main-clip branch
  verbatim (see its `#slice-action` click listener).

Nothing here needed a new pure helper or a new visual component — this is wiring on top of two
already-shared pieces.

## Data model

No changes. No new persisted fields.

## Design

### `static/transcript-sidebar.js` (small edit)

Each `.transcript-word` span, at creation time, gets `span.dataset.tStart = word.t_start` so the
word's timestamp can be read back off the DOM element itself. This is the only change to this
file.

### `static/transcript-word-slice.js` (new file)

One delegated `mouseover` listener on `#transcript-sidebar`, wired once at script load (the
container element itself is never replaced, only its children, across `TranscriptSidebar.render()`
calls — so a single listener on the container survives every re-render).

On each `mouseover` bubbling up from a `.transcript-word` span:

1. Read `tStart = parseFloat(span.dataset.tStart)`.
2. Compute `Timeline.isSliceDisabled(project.clips, tStart)` fresh, every time. If disabled (the
   word's timestamp falls outside every MAIN clip's timeline range, or within the existing 0.05s
   boundary tolerance), do nothing — no toolbar appears for that word right now.
3. If enabled and the span hasn't already been wired (`span.dataset.sliceToolbarBound`), call
   `UI.popoverToolbar(span, [...])` once and set the flag. `UI.popoverToolbar` attaches its own
   `mousemove`/`mouseleave` listeners directly onto `span`, so every subsequent hover of this same
   word is handled by the component itself — this delegated listener only ever does the one-time
   attach.

This keeps the added DOM (one popover chip) and event listeners (`UI.popoverToolbar`'s own
`mousemove`/`mouseleave` pair) limited to words a user actually hovers, not all words in a
transcript up front, since a transcript can run to hundreds of words.

The toolbar's one button: icon `"scissors"` (already in `ui-icon.js`'s `ICON_PATHS`), title "Slice
main clip here". `onClick`:

```
const { newId } = Timeline.sliceClip(project.clips, tStart);
if (!newId) return;                 // boundary / empty timeline -> harmless no-op
await saveProject();
Preview.load(project);
Preview.seek(tStart);
renderTimeline();
```

Reaches into `editor.js`'s `project`/`saveProject`/`renderTimeline` globals and the `Preview`
global at call time — same documented approach `static/timeline-slice.js` and
`static/timeline-overlay-copy-toolbar.js` already use.

### `static/css/components/transcript-sidebar.css` (small edit)

Add `position: relative;` to the existing `.transcript-word` rule, so `UI.popoverToolbar`'s
`position: absolute` chip anchors against the word span (it already adds the required
`ui-popover-toolbar-anchor` class itself).

### `static/index.html` (small edit)

Add `<script src="/static/transcript-word-slice.js"></script>` immediately after
`timeline-slice.js`'s script tag (both are loaded before `editor.js`; load order relative to
`editor.js` doesn't matter functionally since all cross-file access happens at click/hover time,
not load time, but this keeps the new file grouped with the slicing logic it depends on).

## Behavior notes / known limitation

- **Word's `t_start` is the cut point** (not `t_end`) — confirmed with the user.
- **Playhead seeks to the cut point after slicing** — matches the existing timeline scissors
  button's behavior, confirmed with the user.
- **Eligibility is rechecked on every hover**, not cached. A word that becomes slice-ineligible
  later (e.g. because the user has since deleted/reordered clips) after already having been wired
  once will still show its toolbar on a later hover, and clicking will silently no-op via
  `Timeline.sliceClip`'s own boundary check — this mirrors the tolerance the existing timeline
  scissors button already has for the exact same no-op case, so it's an accepted, not a fixed,
  edge case.

## Testing

This is DOM-driven wiring (delegated event listener + a third-party popover component), not a pure
function — consistent with the project's stated exception for thin UI wiring layers. No new pure
logic is introduced (`Timeline.isSliceDisabled`/`sliceClip` are already covered by
`tests/js/timeline-slice.test.js`). Verified manually in the browser: hovering transcript words at
various points (mid-clip, near a clip boundary, past the end of the MAIN sequence) shows/hides the
toolbar correctly, and clicking slices at the right point with the playhead landing there.
