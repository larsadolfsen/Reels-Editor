# Phase 1 — Parallel Task Decomposition

**Parent:** [2026-07-17-phase-1-text-styling-complete-design.md](2026-07-17-phase-1-text-styling-complete-design.md)
**Plan (superseded for Tasks 2–9):** [2026-07-17-phase-1-text-styling-complete.md](../plans/2026-07-17-phase-1-text-styling-complete.md)
**Status:** approved in conversation, ready to become an updated implementation plan.

## Goal

Restructure Phase 1's remaining tasks (2–9 of the original plan; Task 1 — `CLAUDE.md` docs — is already done and unaffected) so independent accordions become independent files, letting their implementation tasks run as true parallel subagents with zero shared-file conflicts, instead of four tasks serializing through the same `index.html`/`editor.js`.

## Problem with the original task split

The original plan's Tasks 3 (FONT), 4 (POSITION), 5 (TIME), 6 (STYLE) each edit the same two files — `static/index.html` and `static/editor.js` — just different sections. Dispatching them as simultaneous subagents in one working tree would corrupt each other's edits; running them in separate worktrees would still require a manual merge of overlapping-region edits in both files. Neither is genuine independence.

## Design: one component file per accordion

Each of FONT/POSITION/TIME/STYLE becomes a self-contained file that owns both its wiring and its per-render field logic:

- `static/text-panel-font.js` — `window.TextPanel.renderFont()`: font-family row + drill-down (moved from `editor.js`'s `renderFontRow`/`openFontPanel`/`closeFontPanel`/`hoverPreviewFont`/`selectFont`/`renderFontList`) **plus** SIZE/Bold/Italic/Underline/Color/Outline-color/Outline-width (new, per original Task 3).
- `static/text-panel-position.js` — `window.TextPanel.renderPosition()`: TEXT ALIGN button group + POSITION anchor grid (row/col) + OFFSET H/V (moved from MISC, per original Task 4).
- `static/text-panel-time.js` — `window.TextPanel.renderTime()`: START/END (moved from MISC, per original Task 5).
- `static/text-panel-style.js` — `window.TextPanel.renderStyle()`: save-as-new-preset flow, most-used list, browse-all drill-down (new, per original Task 6). Owns its own module-level `savedPresets` array and `loadSavedPresets()`/`saveCurrentStyleAsPreset()`/`applySavedPreset()`/`openStylePanel()`/`closeStylePanel()` — all relocated from where the original plan put them in `editor.js`.

**No ctx/callback object.** This codebase has no bundler and no module system — every script runs in one global scope, and existing code (`renderBoxPanel`, `handleBoxResize`) already reaches directly for `editor.js`'s globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`, `computeXY()`, `project`, `Preview`). The four new files do the same — no new indirection layer. This works safely because each file only *defines* `window.TextPanel.renderX = function() {...}` at load time (deferred execution); the one-time accordion-header wiring (`UI.accordionSection(...)`) can run at top-level parse time in each file since it only needs `UI.*`, which is already loaded by the time any app script runs. Script tag order among the four new files and `editor.js` therefore does not matter.

**BOX is untouched.** It's already built and not part of this restructure — `renderBoxPanel()`/`handleBoxResize()`/`handleBoxResizeEnd()` stay exactly where they are in `editor.js`.

## Scaffolding task (sequential, first, small)

One task, touching `index.html` + `editor.js` (the only task that does):

1. In `index.html`: place the final-order markup for all four accordions — FONT's new SIZE/style/color/outline fields (appended into `#text-font-body`, per original Task 3 Step 1), the STYLE accordion + drill-down subpanel (per original Task 6 Step 3), POSITION's accordion + fields (per original Task 4 Step 1), TIME's accordion + fields (per original Task 5 Step 1) — and delete the old `#text-misc-accordion` wrapper entirely. Add four `<script src="/static/text-panel-*.js">` tags (plus `api-list-presets.js`/`api-save-preset.js` per original Task 6 Steps 1–2, which STYLE's file needs).
2. In `editor.js`: delete the field-wiring code that's moving out of `renderTextPanel()` (SIZE/color/outline-color/outline-px/start/end/offset-x/offset-y/align-group/position-row-group/position-col-group `UI.*` calls, the `wireTextStyleToggle` calls for bold/italic/underline, and `renderFontRow`/`openFontPanel`/`closeFontPanel`/`hoverPreviewFont`/`selectFont`/`renderFontList` — all relocating into `text-panel-font.js`). Delete the `UI.accordionSection(...)` calls for `text-misc-accordion` and the `UI.divider(...)` calls for `text-style-divider`/`text-align-divider` (each new file now wires its own accordion header/dividers). Replace with calls in `renderTextPanel()`: `TextPanel.renderFont(); TextPanel.renderStyle(); renderBoxPanel(); TextPanel.renderPosition(); TextPanel.renderTime();` — in that order, matching the target accordion order FONT/STYLE/BOX/POSITION/TIME.
3. Add `usage_count` awareness is NOT this task's job — that's the backend task (unchanged, parallel-safe already).

This is exactly the original plan's Tasks 3–6 "Step 1" HTML edits merged into one task, plus the `editor.js` surgery those tasks already specified — just relocated to run once, up front, instead of interleaved across four tasks.

## Updated task graph

| Task | Files touched | Depends on | Parallel-safe with |
|---|---|---|---|
| 1. CLAUDE.md docs | `CLAUDE.md` | — | **done** |
| 2. Backend preset routes | `app/models.py`, `app/main.py`, tests | — | 2b |
| 2b. Scaffolding | `static/index.html`, `static/editor.js` | — | 2 |
| 3. FONT component | `static/text-panel-font.js` (new) | 2b | 4, 5, 6 |
| 4. POSITION component | `static/text-panel-position.js` (new) | 2b | 3, 5, 6 |
| 5. TIME component | `static/text-panel-time.js` (new) | 2b | 3, 4, 6 |
| 6. STYLE component | `static/text-panel-style.js`, `static/api-list-presets.js`, `static/api-save-preset.js` (new) | 2b, 2 | 3, 4, 5 |
| 7. Integration check | none (manual verification only) | 3, 4, 5, 6 | — |
| 8. Inline stage text editing | `static/preview.js`, `static/editor.js`, `static/index.html` | 7 | — |
| 9. Drag-to-reposition | `static/preview.js`, `static/editor.js` | 8 (same mousedown handler, same element — inherently sequential, not file-splittable) | — |
| 10. End-to-end verification + finish branch | `CLAUDE.md` | 8, 9 | — |

Tasks 3–6 create only new files — genuinely parallel-safe in the *same* working tree (no worktree-per-task needed for them, since there's no shared-file edit to conflict on). Task 2 and 2b touch disjoint file sets and can also run concurrently with each other and with the 3–6 batch's prerequisite (2b must land before 3–6 start, but 2 doesn't block 3/4/5, only 6).

Tasks 8–9 stay sequential: they're the same `mousedown` handler on the same stage element, split by outcome (plain click = edit, drag = move) — not independently parallelizable regardless of file structure.

## Execution model

- **Batch 1 (parallel):** Task 2 (backend) + Task 2b (scaffolding) — dispatched together, reviewed independently, both merged before Batch 2 starts.
- **Batch 2 (parallel):** Tasks 3, 4, 5, 6 — dispatched together once Batch 1 lands, each a fresh subagent creating one new file, reviewed independently.
- **Sequential tail:** Task 7 (integration check) → 8 (inline edit) → 9 (drag) → 10 (finish).

## Resolved decisions

- No ctx/callback object between `editor.js` and the four new component files — direct global access, matching existing codebase convention.
- The scaffolding task absorbs all HTML/`editor.js` surgery that the original Tasks 3–6 specified as "Step 1"/wiring-removal; the four parallel tasks that follow write pure net-new files only.
- Tasks 8–9 (inline edit, drag) are not split into their own files beyond what the original plan specified — they remain in `preview.js`/`editor.js` since they're two phases of one coupled interaction on the same element, not independent components.
