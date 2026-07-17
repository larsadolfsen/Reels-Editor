# Phase 1 — Text Box Finish

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — subthreads verified/refined by a brainstorm at pickup time before their plans are written (the drag subthread needs a brainstorm outright; it has no existing design).

## Goal

Close out the existing Text Box component (background/border box behind a text block) and add the one piece of interaction it was explicitly missing: dragging the box to reposition it.

## Current state

[2026-07-17-text-box.md](../plans/2026-07-17-text-box.md) Tasks 1–11 are done and merged: `TextPreset` box fields + migration, ASS `\p1` vector-drawn box rendering with word-wrap, the BOX accordion (width/height fit-vs-fixed, background, border), CSS rendering in `preview.js`, and `UI.resizeHandles` wired for on-stage resizing. Only documentation, verification, and one new feature remain.

## Subthreads

### 1. `CLAUDE.md` inventory update — [sequential]
Task 12 of the existing plan. Documentation only: add `app/font_metrics.py` and the two new `static/ui-resize-handles.js`/`resize-handles.css` files to the file tree and Inventory section, update the `TextPreset`/`ass_render.py`/`preview.js`/`editor.js` bullets for the Box fields. No code risk; can run any time, doesn't block the other two.

### 2. End-to-end verification + finish branch — [sequential, after subthread 1]
Task 13 of the existing plan: full `pytest -q` pass, a manual walkthrough (fixed-width wrapping, background+border rendering, drag-resize + reload persistence, exported mp4 matching the preview), then `superpowers:finishing-a-development-branch`. Needs `ffmpeg`/`ffprobe` on PATH. This is the phase's visual/functional checkpoint — nothing in Phase 2 starts until this passes.

### 3. Drag-to-reposition the box body — [new, brainstorm first]
Not in the existing plan — it explicitly deferred body-drag as "a fast-follow," resize-only for now (see that plan's Global Constraints). Needs its own brainstorming session before a plan is written. Known shape, to confirm in that session:
- Likely touches `preview.js` (mousedown-drag on `.text-block`'s body, distinct from the existing `UI.resizeHandles` corner/edge handles) and `editor.js` (translate the drag delta into `offset_x`/`offset_y` or a direct `x`/`y` write — the anchor-grid + offset split already exists for the POSITION controls, so dragging should very likely feed into that same model rather than adding new fields).
- Open questions for the brainstorm: does dragging move the anchor grid selection too (snap to nearest third) or only adjust the pixel offset from the current anchor? Does drag conflict with the resize handles' hit area, and if so how do they coexist on the same element?
- No backend/model change expected — this is presentation-layer only, using fields that already exist.

## Verification (phase checkpoint)

- `pytest -q` green.
- Manual: box background/border/radius, fixed-size word-wrap, resize handles, and the new drag all work in the browser; exported mp4 visually matches.
- Branch merged (or otherwise resolved) via `superpowers:finishing-a-development-branch` before Phase 2 starts.
