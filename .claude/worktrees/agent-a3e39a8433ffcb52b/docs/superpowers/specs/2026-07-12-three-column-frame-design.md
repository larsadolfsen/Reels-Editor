# Three-column app frame

## Problem

After merging the timeline-strip work, `#timeline-strip` sits below `main` as a full-width row spanning under the Left and Right panels. This doesn't match the intended frame: three columns (Left / Center / Right) where Center alone contains Video + Timeline stacked, and Left/Right run full height.

## Design

`main` becomes the three-column row and fills all height below the topbar (no more full-width timeline strip below it).

- **Left** (`#panel`) — 320px, full height. Unchanged internally.
- **Right** (`#style-panel`) — 320px, full height. Unchanged internally.
- **Center** (new `#center-col` wrapper) — flex: 1, flex column containing:
  - `#stage-wrap` (video area) — flex: 1, fills available height. `#stage` sizes to fill that height (was fixed 270×480px) at a fixed 9:16 aspect ratio, capped so it never exceeds the Center column's width.
  - `#timeline-strip` — fixed ~160px, unchanged internally, now scoped to Center's width instead of full app width.

Layout stays flexbox throughout, consistent with the rest of the codebase (`#app`, `main`, `#stage-wrap` are already flex).

## Files touched

- `static/index.html` — wrap `#stage-wrap` and `#timeline-strip` in a new `#center-col` inside `main`.
- `static/css/layout.css` — `main` height fix, add `#center-col` flex column rule.
- `static/css/components/stage.css` — `#stage` sizing: height-driven with `aspect-ratio: 9/16` instead of fixed px.
- `static/css/components/timeline.css` — drop assumptions tied to full-width placement (border-top still fine; no full-width-specific rule expected, but verify).

## Out of scope

- No change to Left/Right panel internals, widths (staying 320px per user), or timeline row/track behavior.
- No change to timeline.js/preview.js/editor.js logic — this is a pure CSS/HTML structural change.

## Verification

Visual: run the dev server, load the editor, confirm Left/Right panels run full height, Center shows video on top filling available height and timeline strip below it, and resizing the window keeps the video's 9:16 ratio without overflowing Center's width.
