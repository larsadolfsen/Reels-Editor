# Phase 1 — Text Styling Complete

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Plan:** [2026-07-17-phase-1-text-styling-complete.md](../plans/2026-07-17-phase-1-text-styling-complete.md)
**Status:** brainstormed in full; implementation plan written (linked above), ready to execute.

## Goal

Finish **every** whole-block text-styling feature before starting rich-text (per-selection) formatting in Phase 2. Merges what was originally scoped as two separate phases (Text Box finish, then a separate accordion restructure) into one, so all styling work for a text block lands together: the Text Box component (background/border/resize/drag), the five-accordion panel restructure (FONT/STYLE/BOX/POSITION/TIME), saved style presets, and inline on-stage text editing. Rich-text formatting (Phase 2) then has one stable, fully-wired foundation to build per-selection formatting on top of, instead of overlapping with in-flight accordion changes.

## Current state

[2026-07-17-text-box.md](../plans/2026-07-17-text-box.md) Tasks 1–11 and 13 are done and merged: `TextPreset` box fields + migration, ASS `\p1` vector-drawn box rendering with word-wrap, the BOX accordion (width/height fit-vs-fixed, background, border), CSS rendering in `preview.js`, `UI.resizeHandles` wired for on-stage resizing, and end-to-end verification (which found and fixed two real export bugs: ASS rendering was never wired into the ffmpeg export at all, and the box dialogue referenced a non-existent ASS style). Only Task 12 (`CLAUDE.md` docs) remains from that plan.

## Target accordion layout

| Accordion | Contents | Source |
|---|---|---|
| **FONT** | Font family (existing drill-down, unchanged) + size, weight/bold, italic, underline, color, outline color/width (currently in MISC) | move |
| **STYLE** | Saved presets: save current style as a new named preset, browse/apply a saved one | new (revives original plan's Task 8) |
| **BOX** | Toggle, background color, border width/color/radius, drag+resize | already built, finished here |
| **POSITION** | Text align + anchor grid + pixel offsets (currently in MISC) | move, unchanged content |
| **TIME** | Start/end seconds (currently in MISC) | move, unchanged content |

## Resolved decisions

- **STYLE preset save is always save-as-new** (prompts for a name), never an in-place update of the currently-applied preset — matches the original plan's Task 8 design and the existing Font Family save flow; no "modified from X" state to track.
- **STYLE preset browsing is hybrid**: the accordion body shows the most-used/most-recent presets inline (small list, click to apply — cheap for the common case), plus a settings-row that opens a full drill-down subpanel (`UI.subPanelHeader` + list, same pattern as the Font Family list) for browsing the complete set. "Most used" needs a usage counter or last-applied timestamp on save/apply — a simple increment-on-apply counter is sufficient.
- **Inline editing replaces the side-panel textarea entirely** — `#text-heading` is removed, not kept in sync. The `.text-block` div on the stage becomes `contenteditable` and is the *only* way to edit a heading's text. No rich formatting yet (that's Phase 2) — plain text only.
- **Drag-to-reposition the box body**: clicking and dragging anywhere inside the box that isn't one of the 8 existing resize handles starts a move-drag; the handles keep working exactly as they do today. Free pixel drag while dragging (updates `offset_x`/`offset_y` live, the same fields the POSITION anchor grid already writes to) — no visual snapping to the anchor grid mid-drag. On drag-end, recompute which of the 9 anchor thirds the final position falls into, update `pos_row`/`pos_col` to that cell, and rebase `offset_x`/`offset_y` to the remaining distance from that cell's anchor point.
- **Drag-vs-edit-click on the same element**: a plain click (no meaningful pointer movement) enters edit mode / places the caret in the now-contenteditable box; a click that moves past a small pixel threshold before release is a box-move drag instead. Both land together since they're the same `mousedown`/`mouseup` handling on the same element.
- Two small existing backlog polish items are folded in here since they touch the same accordions: moving the Color control into the FONT accordion (already happens naturally as part of FONT consolidation) and BOX accordion's checkmark/transparent-default cosmetic fix.

## Subthreads

### Finishing the existing Text Box plan

1. **`CLAUDE.md` inventory update** — [sequential]. Task 12 of the existing Text Box plan. Documentation only: add `app/font_metrics.py` and the two new `static/ui-resize-handles.js`/`resize-handles.css` files to the file tree and Inventory section, update the `TextPreset`/`ass_render.py`/`preview.js`/`editor.js` bullets for the Box fields.

### Backend

2. **`GET /api/presets` / `POST /api/presets` routes** — [parallel-safe]. `store.load_presets`/`store.save_preset` already exist in `app/store.py`; only the HTTP routes in `app/main.py` are missing. Wiring only, per `CLAUDE.md`'s "main.py is composition only" rule.

### Frontend — accordions

3. **FONT accordion consolidation** — [parallel-safe]. Move size/weight/italic/underline/color/outline controls out of `#text-misc-body` into `#text-font-body` in `static/index.html`, alongside the existing font-family row; update `editor.js`'s `renderTextPanel()`/`renderFontRow()` wiring accordingly.
4. **POSITION accordion** — [parallel-safe]. Extract the existing align-button-group + anchor grid + offset-X/Y fields out of MISC into their own accordion.
5. **TIME accordion** — [parallel-safe]. Extract the existing start/end `UI.numberField`s out of MISC into their own accordion.
6. **STYLE accordion** — [depends on subthread 2]. New component(s): save-as-new-preset flow (name prompt), an inline most-used/recent list in the accordion body, and a drill-down subpanel for the full preset list.
7. **BOX accordion cosmetic fixes** — [parallel-safe]. Remove the stray checkmark, set background transparent by default.
8. **Confirm five-accordion order** — [sequential, after 3–7 land]. FONT, STYLE, BOX, POSITION, TIME. No code expected, just placement/verification.

### Frontend — drag + inline editing

9. **Drag-to-reposition the box body** — [parallel-safe, but shares the same element/handlers as subthread 10]. `preview.js` (mousedown-drag on `.text-block`, mirroring `UI.resizeHandles`'s drag-tracking pattern but without handles) and `editor.js` (drag-end handler recomputing anchor + offset, symmetric to `handleBoxResizeEnd`).
10. **Inline stage text editing** — [same element as subthread 9, land together]. Make the `.text-block` div's text `contenteditable`; wire `input` events to update `project.text_blocks[].heading` + debounced `saveProject()`. Remove `#text-heading` and its wiring entirely.

### Finish

11. **End-to-end verification + finish branch** — [sequential, last]. Full `pytest -q` pass, a manual walkthrough of every item above, then `superpowers:finishing-a-development-branch`. This is the phase's visual/functional checkpoint — nothing in Phase 2 (rich-text formatting) starts until this passes.

## Verification (phase checkpoint)

- `pytest -q` green.
- Manual: all five accordions collapse/expand independently with the right controls; box background/border/radius/fixed-size word-wrap/resize/drag all work and persist; saving a preset prompts for a name and round-trips through a server restart; the most-used list and drill-down both apply presets; typing directly on the stage edits the heading with no side-panel textarea present; a plain click enters edit mode while a click-drag moves the box; exported mp4 visually matches preview for all of the above.
