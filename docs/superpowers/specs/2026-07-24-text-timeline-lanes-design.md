# Multi-lane TEXT timeline row

Date: 2026-07-24

## Problem

All text blocks render into a single `#row-text` timeline track (`static/timeline.js`, `render()`'s TEXT loop). When two text blocks' time ranges overlap, their blocks stack on top of each other in the same row, making both illegible (see reported screenshot: "Kortvarigt Pro..." and "Hvad er et" overlapping).

## Goal

Each text block that overlaps another in time gets its own visual lane (row) within the TEXT area, so overlapping blocks are always distinguishable. Non-overlapping blocks may share a lane, but only via explicit user action (drag), never automatically.

## Data model

`app/models.py`, `TextBlockLayer` gains:

```python
lane: int = 0
```

Existing saved projects have no `lane` field; Pydantic defaults every block to `0`, reproducing today's single-row look until the user creates or moves a second overlapping block.

## Lane assignment rules

- **New block:** always assigned a brand-new lane — `max(existing lanes) + 1`, or `0` if there are no text blocks yet. Never auto-placed into an existing lane, even if it wouldn't overlap anything there.
- **Duplicate:** the copy also gets a brand-new lane (assigned the same way), since a duplicate always starts out overlapping its original in time.
- **Manual re-lane (drag):** dragging a text block vertically onto a different lane's row moves it into that lane, but only if it does not overlap in time with any block already occupying that lane. If it would overlap, the drag is rejected and the block visually snaps back to its original lane — no model change.
- **Lane compaction:** whenever a block leaves a lane (deleted, or dragged to a different lane) and that lane becomes empty, lanes are immediately renumbered to close the gap (0..N-1, contiguous, ordered top-to-bottom). No lane is ever left empty in the middle of the stack.

Because lanes are always kept contiguous by compaction, "assign a new lane" is simply `current lane count` (i.e. `max lane + 1` given contiguity, or `0` when there are no blocks).

## Rendering

`static/timeline.js`'s TEXT row currently renders one flat `#row-text` track and a single static `#label-text` div (`"TEXT"`, `static/index.html`).

New behavior:
- Blocks are grouped by `lane`. One 44px-tall sub-track is rendered per lane inside the TEXT row (44px matches the existing CAPTIONS row height), stacked top-to-bottom by lane index.
- The label column (`#label-text`) is no longer a single static div — it becomes a container that render() populates with one "TEXT" label per lane (repeated per lane, not just the first), each 44px tall, so it stays visually aligned with its corresponding lane sub-track.
- The TEXT row's total height (and its label column's total height) is `laneCount * 44px`, recomputed every render.
- Empty-row collapsing behavior (`setRowVisible`) is unchanged for the TEXT row as a whole — it still hides entirely when there are zero text blocks.

## New files

- **`static/timeline-text-lanes.js`** — pure, dependency-free helpers, no DOM/fetch (mirrors the pattern of `static/timeline-snap.js` / `static/undo-history.js`):
  - `TextLanes.assignNewLane(textBlocks) -> number`
  - `TextLanes.canDropInLane(textBlocks, blockId, targetLane, start, end) -> boolean`
  - `TextLanes.compactLanes(textBlocks) -> void` (mutates each block's `.lane` in place to remove gaps)
- **`static/timeline-text-lane-drag.js`** — vertical drag-to-change-lane gesture for TEXT-row blocks: mousedown + threshold, follow the cursor vertically, resolve the target lane from drop Y position, call `TextLanes.canDropInLane`; on success set `block.lane`, call `TextLanes.compactLanes(project.text_blocks)`, save + re-render; on rejection, re-render with no model change (visual snap-back). Mirrors the existing horizontal drag pattern in `static/timeline-clip-drag.js`.

## Changed files

- `app/models.py` — add `TextBlockLayer.lane: int = 0`.
- `static/timeline.js` — TEXT row render loop rewritten to group-by-lane and render per-lane sub-tracks + row/label height math described above.
- `static/index.html` — `#label-text` becomes an empty container (`#label-text` or similar) that `timeline.js` fills dynamically instead of a hardcoded `<div>TEXT</div>`.
- `static/panel-text.js` — `addTextBlock()` and `duplicateTextBlock()` call `TextLanes.assignNewLane()` when constructing the new block; `deleteSelectedTextBlock()` calls `TextLanes.compactLanes()` after removing the block.
- `static/css/components/timeline.css` — add lane sub-track styling (reuses existing `.row-track`/`.timeline-block` rules, just repeated per lane; no new visual language).

## Non-goals

- Resizing a text block's horizontal trim (start/end) so it starts overlapping a lane-neighbor is **out of scope**. `static/timeline-text-resize.js` is untouched; two blocks in the same lane can still end up time-overlapping via resize, and this design does not add a check for that case.
- No cap on lane count — the TEXT area simply grows taller as needed.

## Testing

This repository has no JS test framework (no jest/vitest config found). Consistent with the existing convention for small pure frontend modules (e.g. `timeline-snap.js`, `undo-history.js`), the three `TextLanes` helpers are written as pure, framework-free functions for readability, but are verified manually in the running app rather than via automated tests:
- Add several overlapping text blocks — confirm each lands in its own lane.
- Drag a block onto a lane where it doesn't overlap — confirm it moves and the vacated lane compacts away if left empty.
- Drag a block onto a lane where it does overlap — confirm it snaps back, no save occurs.
- Delete a block from a middle lane — confirm lanes below shift up, no empty gap remains.
- Duplicate a block — confirm the copy lands in a new lane, not stacked on the original.
