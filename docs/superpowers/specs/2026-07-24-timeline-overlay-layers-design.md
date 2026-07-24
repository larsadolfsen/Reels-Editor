# Unified overlay layer stack on the timeline (replaces Layers panel)

Date: 2026-07-24

**Supersedes:** `2026-07-24-text-timeline-lanes-design.md`. That spec's `TextBlockLayer.lane` field and TEXT-only overlap-avoidance lanes are dropped in favor of the design below, which folds the same "give each overlapping thing its own row" need into the existing z-order stacking model instead of inventing a parallel one. Do not implement the superseded spec's `lane` field or its Tasks 2-5.

## Problem

1. (Original report) All text blocks render into one `#row-text` timeline track, so overlapping blocks stack on top of each other illegibly.
2. (Revised ask) Z-order layering (currently a separate `#panel-layers` side panel — a flat drag-and-drop list of every text block + video box, sorted by `z_index`) should be merged into the timeline itself: each text block and each video box gets its own row directly in the timeline, and dragging a row up/down changes its `z_index` — "further up ... layers over those below." The side Layers panel is removed; its exact reordering behavior (`static/panel-layers.js`) moves onto the timeline.

## Scope

**Participates in the unified stack (draggable, per-item):** every `TextBlockLayer`, every `VideoBoxLayer` — same two types the existing Layers panel already covers, same granularity (per individual item, not grouped by type — confirmed with the user: a video box can sit interleaved between two specific text blocks in the stack, exactly like today's Layers panel allows).

**Fixed, not part of the stack:** the VIDEO row (main clip sequence) and the AUDIO row. Per the user: "Only sound and main video are fixed."

**Unchanged:** the CAPTIONS row stays exactly as it is today — its own single fixed row, not draggable, not part of the merged stack. This matches the existing Layers panel's scope, which has never included captions (it only ever listed text blocks + video boxes).

## Data model

**No changes.** `TextBlockLayer.z_index` and `VideoBoxLayer.z_index` already exist and already drive stacking order (`static/preview.js`/`static/video-box-preview.js` set each overlay element's CSS z-index from these fields). The unified stack is a pure rendering + interaction change: order in the visual stack is derived from `z_index` every render, and dragging a row renumbers `z_index` for the affected items — exactly the mechanism `static/panel-layers.js`'s `renumber()` already implements today, just relocated.

## Rendering

Today, `static/timeline.js`'s `render()` has three separate blocks: a TEXT row (`#row-text`), a VIDEO BOX row (`#row-videobox`), and a CAPTIONS row (`#row-captions`), each with its own fixed-height row and static label.

New behavior:
- The TEXT row and VIDEO BOX row are replaced by one merged row (`data-row="overlays"`, container `#row-overlays`), sitting where the TEXT row used to sit. CAPTIONS keeps its existing row/position, VIDEO and AUDIO are untouched.
- Every text block and video box becomes one 44px-tall lane inside `#row-overlays`, ordered top-to-bottom by `z_index` descending (top = highest `z_index` = frontmost, matching `panel-layers.js`'s existing convention).
- Each lane renders its item exactly as it renders today: a text block gets the same time-positioned block + resize handle it has now; a video box gets the same time-positioned, draggable-to-timeline block it has now. No change to how either item's own time-block behaves (trim, resize, click-to-select, drag-to-insert onto the VIDEO row).
- The label column (`#label-overlays`, replacing `#label-text`/`#label-videobox`) renders one label per lane — "TEXT" or "VIDEO BOX" — matching its type, at the same 44px height as its lane.
- **Hover-reveal drag handle:** hovering a lane's label reveals a small grip handle to its left (reusing the existing grip-vertical icon already used for the playhead handle). Grabbing the handle and dragging vertically reorders that lane among all other lanes in the stack (text and video-box lanes freely interleave); releasing renumbers every affected item's `z_index` to match the new order, saves, and re-renders. This is a pure reorder (no drop validity/overlap check — every item always has its own lane, unconditionally, regardless of whether it overlaps another item in time).
- The merged row collapses (hidden) when there are zero text blocks and zero video boxes, same convention as today's empty-row collapsing.

## Removed

- `static/panel-layers.js`, `#panel-layers` (`static/index.html`), `static/css/components/layers-panel.css` and its `<link>` tag.
- The LAYERS entry: `panel-nav.js`'s `showPanel()` panel-type list, `PANEL_NAV_ITEMS`, `openLayersPanel()`, and its `PANEL_NAV_HANDLERS` key.

## Non-goals

- Captions are not added to the draggable stack (matches current Layers panel scope).
- No change to how an individual text block's or video box's own time-range (trim/resize/move-in-time) works — only its vertical position (z-order) gains a new interaction.

## Testing

Same convention as the superseded spec: no JS test framework exists in this repo. The reorder/render logic is written as small, mostly-pure helper functions (merge + sort + renumber, mirroring `panel-layers.js`'s existing `mergedEntries`/`renumber`) and verified manually in the browser:
- Add two overlapping text blocks and a video box — confirm three separate 44px lanes, correctly labeled.
- Drag the video box's handle to a position between the two text blocks — confirm it visually renders between them and `z_index` values persist across a reload.
- Confirm the removed Layers panel's icon-rail entry, panel section, and file are gone with no console errors.
