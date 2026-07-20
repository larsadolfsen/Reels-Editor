# Insert Model: Left Rail Inserts, Timeline Opens — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No open questions.

## What / Why

User-defined interaction model: **clicking an item in the timeline opens its right panel** (selection/editing entry point); **the left rail's buttons insert items** (creation entry point). Today the rail buttons only open panels. The timeline-row + buttons (from `2026-07-20-empty-project-and-multi-text-design.md`) **stay** — two entry points to the same add flows (user-confirmed).

## Design

- **TEXT rail button** → inserts a new text block (the shared `addTextBlock()` from the empty-project item: new block + preset, select, open TEXT panel, enter on-stage edit). No longer a plain "open panel" — opening an *existing* block's panel happens by clicking it on the timeline or stage.
- **CAPTIONS rail button** → if no caption track exists, creates one (empty words) and opens the CAPTIONS panel with Auto-caption as the visible next step; if one exists, opens its panel (there is only one track — insert degrades to open).
- **FILES rail button** → unchanged: opens the media library, whose import button is the insert flow for clips (and, once the audio item lands, music). The VIDEO row's + button covers direct clip insertion.
- **PROJECTS / SETTINGS / EXPORT rail buttons** → unchanged (nothing to insert).
- **Timeline click → panel** already works via `editor.js`'s `onTimelineSelect` (VIDEO/TEXT/CAPTIONS); verify it covers every row (incl. AUDIO once that item lands) and keep it the sole "open existing item" path from the timeline.
- Rail affordance: insert-capable rail items get a small plus badge on the icon (CSS overlay in `ui-icon-rail.js`'s markup) so insert vs. open is visible.

## Data model

None.

## Reuse

- `addTextBlock()` / clip-add flow / `ensureCaptionTrack()` — all shared with the empty-project item and existing code.
- `PANEL_NAV_ITEMS` / `PANEL_NAV_HANDLERS` in `editor.js` — handlers change behavior; the rail component itself (`ui-icon-rail.js`) only gains the badge option.

## Tasks

1. TEXT rail handler → insert flow (+ plus-badge option in `ui-icon-rail.js`).
2. CAPTIONS rail handler → create-or-open flow.
3. Audit `onTimelineSelect` covers all rows and selection states; fix gaps.

## Testing

UI wiring — untested layer per convention. Manual verification: TEXT rail click adds a block each time; CAPTIONS rail click creates then opens; timeline clicks open the right panel for every row; + buttons and rail inserts produce identical results.

## Out of scope

- Changing FILES/PROJECTS/SETTINGS/EXPORT behavior.
- Drag-from-library-to-timeline insertion.

## Dependency note

Builds on `addTextBlock()` and the + buttons from [2026-07-20-empty-project-and-multi-text-design.md](2026-07-20-empty-project-and-multi-text-design.md) — if picked up first, this item extracts those shared flows itself and the other item consumes them.
