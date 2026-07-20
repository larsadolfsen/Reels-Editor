# Snap Playhead — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Scrubbing lands on arbitrary times; slicing and aligning text/captions wants exact boundaries. Snap seek-by-ruler to nearby edges.

## Design

- Pure helper `static/timeline-snap.js`: `Timeline.snapTime(t, boundaries, tolerancePx, pxPerSecond) -> t'` — snaps `t` to the nearest boundary within `tolerancePx / pxPerSecond` seconds, else returns `t` unchanged.
- Boundaries: clip starts/ends, text-block start/end, caption-group starts. Collected by a small `collectBoundaries(project)` in the same file.
- Wired into `timeline.js`'s ruler click/drag seek path only (transport step buttons and arrow-key nudge stay exact). Tolerance 8 px at current zoom — zooming in naturally tightens the snap window, which is the expected editor feel.
- Holding Alt during drag disables snapping (standard idiom).
- Depends on nothing; composes with zoom from the slice item (uses `pxPerSecond` if that landed, else the current fixed scale).

## Data model

None.

## Tasks

1. `timeline-snap.js` (pure snap + boundary collection) + ruler-seek wiring + Alt bypass.

## Testing

Pure JS, no runner — stated untested per convention; logic kept in one tiny dependency-free file. Manual: dragging near a clip join lands exactly on it (verify slice at that point yields no ε-rejection); Alt-drag is free; step buttons unaffected.

## Out of scope

- Snapping while dragging clips/blocks (only the playhead).
- Magnetic timeline behavior.
