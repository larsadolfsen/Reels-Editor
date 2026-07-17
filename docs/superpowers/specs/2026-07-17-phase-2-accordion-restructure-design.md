# Phase 2 — Text Panel Accordion Restructure

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — brainstormed in full for this revision; verify against the codebase's actual state at pickup time before writing the plan.

## Goal

Split the TEXT context panel's current two accordions (FONT, MISC — the latter a catch-all for TIME/STYLE/BOX/ALIGN/POSITION) into five purpose-built accordions, add saved style presets (reviving the original plan's never-built Task 8), and replace the side-panel heading textarea with editing directly on the stage. Components are built so Phase 4 (Captions) can reuse them against a different backing model (a caption track instead of a text block).

Text-highlight and any other per-selection formatting is **not** in this phase — split out into [Phase 3 — Rich-Text Formatting](2026-07-17-phase-3-rich-text-formatting-design.md), since it's a bigger, riskier unit of work (see that doc). This phase ships whole-block styling only, plus plain (non-rich) inline editing that Phase 3 then builds on.

## Target accordion layout

| Accordion | Contents | Source |
|---|---|---|
| **FONT** | Font family (existing drill-down, unchanged) + size, weight/bold, italic, underline, color, outline color/width (currently in MISC) | move |
| **STYLE** | Saved presets: save current style as a new named preset, browse/apply a saved one | new (revives original plan's Task 8) |
| **BOX** | Toggle, background color, border width/color/radius, drag+resize | already built in Phase 1, unchanged here |
| **POSITION** | Text align + anchor grid + pixel offsets (currently in MISC) | move, unchanged content |
| **TIME** | Start/end seconds (currently in MISC) | move, unchanged content |

## Resolved decisions

- **STYLE preset save is always save-as-new** (prompts for a name), never an in-place update of the currently-applied preset — matches the original plan's Task 8 design and the existing Font Family save flow; no "modified from X" state to track.
- **STYLE preset browsing is hybrid**: the accordion body shows the most-used/most-recent presets inline (small list, click to apply — cheap for the common case), plus a settings-row that opens a full drill-down subpanel (`UI.subPanelHeader` + list, same pattern as the Font Family list) for browsing the complete set. "Most used" needs a usage counter or last-applied timestamp on save/apply — pick whichever is cheaper to track correctly at implementation time (a simple increment-on-apply counter is likely sufficient).
- **Inline editing replaces the side-panel textarea entirely** — `#text-heading` is removed, not kept in sync. The `.text-block` div on the stage becomes `contenteditable` and is the *only* way to edit a heading's text. This also removes the two-way-sync complexity the original bullet list assumed.
- **Drag-vs-edit-click on the same element**: resolved together with Phase 1's box-drag — a plain click (no meaningful pointer movement) enters edit mode / places the caret; a click that moves past a small pixel threshold before release is a box-move drag instead. See [phase-1-text-box-finish-design.md](2026-07-17-phase-1-text-box-finish-design.md) subthread 3 for the full mechanism, since drag-to-move and click-to-edit are implemented together.

## Subthreads

### Backend

1. **`GET /api/presets` / `POST /api/presets` routes** — [parallel-safe]. `store.load_presets`/`store.save_preset` already exist in `app/store.py`; only the HTTP routes in `app/main.py` are missing (confirmed via grep — no `preset` routes exist yet). Wiring only, per `CLAUDE.md`'s "main.py is composition only" rule.

### Frontend — accordions

2. **FONT accordion consolidation** — [parallel-safe]. Move size/weight/italic/underline/color/outline controls out of `#text-misc-body` into `#text-font-body` in `static/index.html`, alongside the existing font-family row; update `editor.js`'s `renderTextPanel()`/`renderFontRow()` wiring accordingly.
3. **POSITION accordion** — [parallel-safe]. Extract the existing align-button-group + anchor grid + offset-X/Y fields out of MISC into their own accordion (new `#text-position-header`/`#text-position-body` following the BOX accordion's pattern from Phase 1).
4. **TIME accordion** — [parallel-safe]. Extract the existing start/end `UI.numberField`s out of MISC into their own accordion.
5. **STYLE accordion** — [depends on subthread 1, the preset routes]. New component(s): save-as-new-preset flow (name prompt), an inline most-used/recent list in the accordion body, and a drill-down subpanel (new, following the Font Family list's `UI.subPanelHeader` pattern) for the full preset list. Needs a usage-tracking field (counter or last-applied timestamp) on the preset or in a small client-side store.
6. **Confirm BOX accordion placement** — [sequential, after 2–5 land]. BOX already exists from Phase 1; just verify it sits correctly among the new five-accordion order (FONT, STYLE, BOX, POSITION, TIME) once the others are built. No code expected.

### Frontend — inline editing

7. **Inline stage text editing** — [parallel-safe]. Make the `.text-block` div's text `contenteditable` on the stage; wire `input` events to update `project.text_blocks[].heading` + debounced `saveProject()`. Remove `#text-heading` and its wiring from `static/index.html`/`editor.js` entirely (no sync logic needed — the stage is now the only editing surface).

## Verification (phase checkpoint)

- `pytest -q` green.
- Manual: all five accordions collapse/expand independently and contain the right controls; saving a preset prompts for a name and round-trips through a server restart; the most-used list and the full drill-down both apply presets correctly; typing directly on the stage edits the heading with no side-panel textarea present; a plain click enters edit mode while a click-drag moves the box (from Phase 1).
