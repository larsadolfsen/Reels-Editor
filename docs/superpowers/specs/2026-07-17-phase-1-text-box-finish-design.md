# Phase 1 — Text Box Finish

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — brainstormed in full for this revision; verify against the codebase's actual state at pickup time before writing the plan (things may have shifted since).

## Goal

Close out the existing Text Box component (background/border box behind a text block) and add the one piece of interaction it was explicitly missing: dragging the box to reposition it.

## Current state

[2026-07-17-text-box.md](../plans/2026-07-17-text-box.md) Tasks 1–11 are done and merged: `TextPreset` box fields + migration, ASS `\p1` vector-drawn box rendering with word-wrap, the BOX accordion (width/height fit-vs-fixed, background, border), CSS rendering in `preview.js`, and `UI.resizeHandles` wired for on-stage resizing. Only documentation, verification, and one new feature remain.

## Subthreads

### 1. `CLAUDE.md` inventory update — [sequential]
Task 12 of the existing plan. Documentation only: add `app/font_metrics.py` and the two new `static/ui-resize-handles.js`/`resize-handles.css` files to the file tree and Inventory section, update the `TextPreset`/`ass_render.py`/`preview.js`/`editor.js` bullets for the Box fields. No code risk; can run any time, doesn't block the other two.

### 2. End-to-end verification + finish branch — [sequential, after subthread 1]
Task 13 of the existing plan: full `pytest -q` pass, a manual walkthrough (fixed-width wrapping, background+border rendering, drag-resize + reload persistence, exported mp4 matching the preview), then `superpowers:finishing-a-development-branch`. Needs `ffmpeg`/`ffprobe` on PATH. This is the phase's visual/functional checkpoint — nothing in Phase 2 starts until this passes.

### 3. Drag-to-reposition the box body — [new]
Not in the existing plan — it explicitly deferred body-drag as "a fast-follow," resize-only for now (see that plan's Global Constraints). Brainstormed as part of this revision:

- **Trigger:** clicking and dragging anywhere inside the box that isn't one of the 8 existing resize handles starts a move-drag; the handles keep working exactly as they do today. (This will need to coexist with Phase 2's inline text editing on the same element — resolved there: a drag that moves further than a small pixel threshold is a move, a plain click/mouseup with no movement enters edit mode. Revisit if that threshold feels wrong in practice.)
- **Model:** free pixel drag while dragging (updates `offset_x`/`offset_y` live, same fields the POSITION anchor grid already writes to) — no visual snapping to the anchor grid mid-drag. On drag-end, recompute which of the 9 anchor thirds the final position falls into, update `pos_row`/`pos_col` to that cell, and rebase `offset_x`/`offset_y` to the remaining distance from that cell's anchor point — keeping the anchor model meaningful (a later "snap while dragging" visual affordance can build on this without changing the underlying write, since the anchor recompute already happens on drop).
- Implementation touches `preview.js` (mousedown-drag on `.text-block`, mirroring `UI.resizeHandles`'s drag-tracking pattern but without handles) and `editor.js` (drag-end handler recomputing anchor + offset, symmetric to how `handleBoxResizeEnd` already works). No backend/model change — this is presentation-layer only, using fields (`offset_x`, `offset_y`, `pos_row`, `pos_col`) that already exist.

## Verification (phase checkpoint)

- `pytest -q` green.
- Manual: box background/border/radius, fixed-size word-wrap, resize handles, and the new drag all work in the browser; exported mp4 visually matches.
- Branch merged (or otherwise resolved) via `superpowers:finishing-a-development-branch` before Phase 2 starts.
