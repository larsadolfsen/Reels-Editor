# Insert Model: Left Rail Inserts, Timeline Opens — Design

**Status:** brainstormed 2026-07-20, verified against code 2026-07-21, ready for a build session to write its implementation plan. No open questions.

## Verification against current code (2026-07-21)

Code has moved on since this was first brainstormed (multi-text-block selection, panel extractions). Re-checked every assumption:

- `addTextBlock()` / `addTextBlockAndEdit()` (`static/panel-text.js`) already exist exactly as assumed — creates a block + preset, selects it, opens the panel, enters on-stage edit.
- **CAPTIONS insert-or-open is already the actual behavior, no code change needed.** `openCaptionsPanel()` → `renderCaptionPanel()` → `ensureCaptionTrack()` unconditionally creates the track in memory if missing, and the "Auto-caption" button (`#caption-auto-btn`) is already always visible at the top of the panel, not gated by the empty state. Task 2 below is satisfied by existing code — confirming it in manual verification is enough, nothing to build.
- `onTimelineSelect` (`static/editor.js`) already routes video/text/caption/video-box clicks to the right panel and selects the right item. AUDIO row doesn't exist yet — correctly out of scope.
- **New finding:** `static/editor.js` is now 456 lines (already over the ~400 guideline) and this task's only remaining code change (the TEXT rail handler) lives in exactly the navigation code that makes up most of that size. Extracting `PANEL_NAV_ITEMS`, `PANEL_NAV_HANDLERS`, `showPanel()`, `onTimelineSelect()`, every `openXPanel()` function, and `reRenderAfterRestore()` into a new `static/panel-nav.js` is added as Task 0 below — a pure move (same pattern as the `panel-text.js`/`panel-captions.js` extractions), done before the TEXT handler change so that change lands in the new home file, not the old one. `editor.js` keeps thin wrapper calls where those functions are invoked from other wiring (e.g. `Preview.setOnStageTextActivate`, the `#row-video` drop handler's video-box fallback).

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

- `addTextBlockAndEdit()` / clip-add flow / `ensureCaptionTrack()` — already exist, all shared with the empty-project item and existing code.
- `PANEL_NAV_ITEMS` / `PANEL_NAV_HANDLERS` — move from `editor.js` to the new `static/panel-nav.js` (Task 0); the `text` entry's handler changes from `openTextPanel` to `addTextBlockAndEdit`. The rail component itself (`ui-icon-rail.js`) only gains the badge option.

## Tasks

0. Extract `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS`/`showPanel()`/`onTimelineSelect()`/every `openXPanel()`/`reRenderAfterRestore()` from `editor.js` into `static/panel-nav.js` (pure move, zero behavior change).
1. TEXT rail handler → insert flow (`openTextPanel()`'s rail wiring now calls `addTextBlockAndEdit()` instead of just opening the panel) + plus-badge option in `ui-icon-rail.js` (+ `icon-rail.css`), applied to the TEXT and CAPTIONS rail items in `PANEL_NAV_ITEMS`.
2. ~~CAPTIONS rail handler → create-or-open flow~~ — already true of existing code (see Verification above); confirm via manual check only, no code change.
3. Audit `onTimelineSelect` covers all rows and selection states; fix gaps — already covers video/text/caption/video-box (see Verification above); confirm via manual check only, no code change expected.

## Testing

UI wiring — untested layer per convention. Manual verification: TEXT rail click adds a block each time; CAPTIONS rail click creates then opens; timeline clicks open the right panel for every row; + buttons and rail inserts produce identical results.

## Out of scope

- Changing FILES/PROJECTS/SETTINGS/EXPORT behavior.
- Drag-from-library-to-timeline insertion.

## Dependency note

Builds on `addTextBlock()`/`addTextBlockAndEdit()` and the + buttons from [2026-07-20-empty-project-and-multi-text-design.md](2026-07-20-empty-project-and-multi-text-design.md) — already landed in `static/panel-text.js`/`static/timeline.js` as of 2026-07-21, confirmed in the Verification section above. No extraction needed here; this item just reuses them as-is.
