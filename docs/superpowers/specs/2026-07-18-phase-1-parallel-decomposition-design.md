# Phase 1 — Parallel Task Decomposition

**Parent:** [2026-07-17-phase-1-text-styling-complete-design.md](2026-07-17-phase-1-text-styling-complete-design.md)
**Plan (superseded for Tasks 2–9):** [2026-07-17-phase-1-text-styling-complete.md](../plans/2026-07-17-phase-1-text-styling-complete.md)
**Status:** approved in conversation, ready to become an updated implementation plan.

## Goal

Restructure Phase 1's remaining tasks (2–9 of the original plan; Task 1 — `CLAUDE.md` docs — is already done and unaffected) so independent accordions become independent files, letting their implementation tasks run as true parallel subagents with zero shared-file conflicts, instead of four tasks serializing through the same `index.html`/`editor.js`.

## Problem with the original task split

The original plan's Tasks 3 (FONT), 4 (POSITION), 5 (TIME), 6 (STYLE) each edit the same two files — `static/index.html` and `static/editor.js` — just different sections. Dispatching them as simultaneous subagents in one working tree would corrupt each other's edits; running them in separate worktrees would still require a manual merge of overlapping-region edits in both files. Neither is genuine independence.

## Design: one component file per control, not per accordion

The master plan's process rule (`2026-07-17-major-plan-revision-design.md`) defines a task grain more precisely than "one accordion": **one `UI.*` JS component, one CSS component file, one backend model/route change, one service module** — and mandates worktree-per-task via `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development`. Re-applying that grain to each accordion surfaces further splits: some accordions bundle two distinct controls (a relocated existing component plus a new one), and the STYLE accordion's API layer is a service module independent of its UI.

- `static/text-panel-font-family.js` — `window.TextPanel.renderFontFamily()`: font-family row + drill-down. **Pure relocation** of `editor.js`'s existing `renderFontRow`/`openFontPanel`/`closeFontPanel`/`hoverPreviewFont`/`selectFont`/`renderFontList` — zero new logic, lowest-risk task in the batch.
- `static/text-panel-font-style.js` — `window.TextPanel.renderFontStyle()`: SIZE/Bold/Italic/Underline/Color/Outline-color/Outline-width (net-new, per original Task 3's actual new scope). Distinct component from font-family — different controls, no shared state beyond the same `preset` object both read/write independently.
- `static/text-panel-align.js` — `window.TextPanel.renderAlign()`: TEXT ALIGN button group (moved from MISC).
- `static/text-panel-position.js` — `window.TextPanel.renderPosition()`: POSITION anchor grid (row/col) + OFFSET H/V (moved from MISC, per original Task 4's anchor-grid content). Align and anchor-grid+offset are separate controls that happen to render in the same accordion body — no shared state between the two files.
- `static/text-panel-time.js` — `window.TextPanel.renderTime()`: START/END (moved from MISC, per original Task 5). Two number fields — already minimal, not split further.
- `static/api-list-presets.js` / `static/api-save-preset.js` — `Api.listPresets()`/`Api.savePreset(preset)`: the preset-library service module (per original Task 6 Steps 1–2). Depends only on Task 2's route contract, which the plan already pins verbatim — no dependency on the STYLE UI task, so it runs in the *first* parallel batch alongside the backend task, not the accordion batch.
- `static/text-panel-style.js` — `window.TextPanel.renderStyle()`: save-as-new-preset flow, most-used list, browse-all drill-down (new UI, per original Task 6's UI scope). Owns its own module-level `savedPresets` array and `loadSavedPresets()`/`saveCurrentStyleAsPreset()`/`applySavedPreset()`/`openStylePanel()`/`closeStylePanel()`. Not split further from itself — save/most-used/browse all read and write the same `savedPresets` list and `usage_count` bookkeeping, so they're one cohesive component, not three independent ones.

**No ctx/callback object.** This codebase has no bundler and no module system — every script runs in one global scope, and existing code (`renderBoxPanel`, `handleBoxResize`) already reaches directly for `editor.js`'s globals (`ensureTextBlock()`, `ensureTextPreset()`, `saveProject()`, `renderTextPreview()`, `computeXY()`, `project`, `Preview`). The new `text-panel-*.js` files do the same — no new indirection layer. Each file only *defines* `window.TextPanel.renderX = function() {...}` at load time (deferred execution), so script tag order among the new files and `editor.js` does not matter.

**Accordion headers and shared dividers belong to `2b-js`, not the component files.** FONT and POSITION each split into two sibling files that render into the *same* accordion body (font-family/font-style; align/position). An accordion has exactly one header — if both siblings tried to self-register `UI.accordionSection(...)` for it, the second call would double-wire the same header button. So `2b-js` (not `3a`/`3b`/`4a`/`4b`) owns every accordion-header registration in this restructure — FONT's (pre-existing, untouched), and the three new ones (STYLE, POSITION, TIME) — plus the divider between font-family and font-style content (`text-font-family-style-divider`). This is a natural fit for `2b-js`'s existing job of being the one-time orchestrator setup; the component files only ever touch elements exclusively inside their own half of the body (e.g. `3a` only touches `#text-font-row`, `3b` only touches the SIZE/style/color/outline fields).

**BOX is untouched.** It's already built and not part of this restructure — `renderBoxPanel()`/`handleBoxResize()`/`handleBoxResizeEnd()` stay exactly where they are in `editor.js`.

## Scaffolding: two tasks, not one — `index.html` and `editor.js` don't overlap

The original draft of this doc bundled the scaffolding into one task because both edits are one-time and small. But `index.html` and `editor.js` are different files with no overlap between them — bundling them was leftover coarseness from the accordion-grained thinking this doc is now moving away from. Splitting costs nothing and buys another parallel slot:

**Task 2b-html** (`static/index.html` only): place the final-order markup for all accordions — FONT's new SIZE/style/color/outline fields (appended into `#text-font-body`, per original Task 3 Step 1), the STYLE accordion + drill-down subpanel (per original Task 6 Step 3), POSITION's accordion + align group + anchor grid + offset fields (per original Task 4 Step 1), TIME's accordion + fields (per original Task 5 Step 1) — and delete the old `#text-misc-accordion` wrapper entirely. Add the six new `<script src="/static/...">` tags: `text-panel-font-family.js`, `text-panel-font-style.js`, `text-panel-align.js`, `text-panel-position.js`, `text-panel-time.js`, `text-panel-style.js`, plus `api-list-presets.js`/`api-save-preset.js`.

**Task 2b-js** (`static/editor.js` only): delete the field-wiring code moving out of `renderTextPanel()` (SIZE/color/outline-color/outline-px/start/end/offset-x/offset-y/align-group/position-row-group/position-col-group `UI.*` calls, the `wireTextStyleToggle` calls for bold/italic/underline, and `renderFontRow`/`openFontPanel`/`closeFontPanel`/`hoverPreviewFont`/`selectFont`/`renderFontList`). Delete the `UI.accordionSection(...)` call for `text-misc-accordion` and the `UI.divider(...)` calls for `text-style-divider`/`text-align-divider` (each new file now wires its own accordion header/dividers). Replace with, in `renderTextPanel()`: `TextPanel.renderFontFamily(); TextPanel.renderFontStyle(); TextPanel.renderStyle(); renderBoxPanel(); TextPanel.renderAlign(); TextPanel.renderPosition(); TextPanel.renderTime();` — in that order, matching the target accordion order FONT/STYLE/BOX/POSITION/TIME (align+position share the POSITION accordion body, rendered back to back).

Both tasks only need the *names* the other side will produce (container element IDs from 2b-html; function names `TextPanel.renderX()` from 2b-js) — both already pinned by this doc and the original plan's verbatim markup/code, so there's no live coordination needed between them; they can be dispatched in the same parallel batch.

This is exactly the original plan's Tasks 3–6 "Step 1" HTML edits plus their `editor.js` surgery — relocated to run once, up front, split by file instead of interleaved across six tasks.

## Inline editing + drag: one new file, still sequential

The original plan puts the click-vs-drag `mousedown` handler directly inline in `static/preview.js`. But `preview.js` already has a precedent for exactly this situation — `static/ui-resize-handles.js` is a standalone file implementing a stage interaction (8-handle drag-resize) that `preview.js` merely calls into, via a `{getSize, onResize, onDragEnd}` callback object. The edit/drag interaction should follow the same pattern instead of growing `preview.js` directly:

- `static/ui-text-interaction.js` (new) — `window.UI.textInteraction(div, { onEditStart, onEditInput, onEditEnd, onMove, onMoveEnd })`: owns the `contentEditable` enter/exit logic and the click-vs-drag `mousedown`/`mouseup` handling on one element, mirroring `ui-resize-handles.js`'s shape. `preview.js` mounts/unmounts it during `renderText()` exactly like it does `UI.resizeHandles`.

Edit and drag still can't be split into two *tasks* that run in parallel — per the spec's own resolved decision, they're one `mousedown`/`mouseup` handler branching on pointer movement, not two independent listeners — but they now land in one dedicated new file instead of bloating `preview.js`, and the task sequence (edit-only first, then extend with drag) stays as originally planned since it's about incremental verifiability, not file conflicts.

## Updated task graph

| Task | Files touched | Depends on | Parallel batch |
|---|---|---|---|
| 1. CLAUDE.md docs | `CLAUDE.md` | — | **done** |
| 2. Backend preset routes | `app/models.py`, `app/main.py`, tests | — | 1 |
| 2b-html. Scaffolding (markup) | `static/index.html` | — | 1 |
| 2b-js. Scaffolding (orchestrator) | `static/editor.js` | — | 1 |
| 6a. Preset API service | `static/api-list-presets.js`, `static/api-save-preset.js` (new) | Task 2's route contract (pinned in plan text, not a live dependency) | 1 |
| 3a. FONT family component | `static/text-panel-font-family.js` (new) | 2b-html, 2b-js | 2 |
| 3b. FONT style component | `static/text-panel-font-style.js` (new) | 2b-html, 2b-js | 2 |
| 4a. TEXT ALIGN component | `static/text-panel-align.js` (new) | 2b-html, 2b-js | 2 |
| 4b. POSITION component | `static/text-panel-position.js` (new) | 2b-html, 2b-js | 2 |
| 5. TIME component | `static/text-panel-time.js` (new) | 2b-html, 2b-js | 2 |
| 6b. STYLE UI component | `static/text-panel-style.js` (new) | 2b-html, 2b-js, 6a | 2 |
| 7. Integration check | none (manual verification only) | 3a, 3b, 4a, 4b, 5, 6b | — (sequential) |
| 8. Inline stage text editing | `static/ui-text-interaction.js` (new), `static/preview.js`, `static/editor.js`, `static/index.html` | 7 | — (sequential) |
| 9. Drag-to-reposition | `static/ui-text-interaction.js`, `static/editor.js` | 8 (same handler, same element — inherently sequential) | — (sequential) |
| 10. End-to-end verification + finish branch | `CLAUDE.md` | 8, 9 | — (sequential) |

Batch 1's four tasks touch four disjoint file sets — no shared-file edits, no coordination needed beyond the already-pinned route/function contracts. Batch 2's six tasks each create exactly one new file plus optionally extend `preview.js`'s callback registration point (already established, see below) — also disjoint. Per the master plan's process rule, each task in both batches runs in its own worktree via `superpowers:using-git-worktrees`, reviewed independently, merged back before the next batch/the phase's visual checkpoint.

## Execution model

- **Batch 1 (4 parallel tasks, own worktrees):** Task 2 (backend), 2b-html, 2b-js, 6a (API service files) — dispatched together, reviewed independently, all merged before Batch 2 starts.
- **Batch 2 (6 parallel tasks, own worktrees):** Tasks 3a, 3b, 4a, 4b, 5, 6b — dispatched together once Batch 1 lands, each creating exactly one new file, reviewed independently, all merged before Task 7.
- **Sequential tail:** Task 7 (integration check) → 8 (inline edit) → 9 (drag) → 10 (finish).

## Resolved decisions

- No ctx/callback object between `editor.js` and the new component files — direct global access, matching existing codebase convention (`renderBoxPanel`/`handleBoxResize` already do this).
- Scaffolding is two tasks (`2b-html`, `2b-js`), not one — they touch disjoint files, so bundling them bought nothing and cost a parallel slot.
- FONT and POSITION each split into two component files (family/style, align/position) because they bundle two genuinely distinct controls; TIME and STYLE stay as one file each because further splitting would separate tightly-coupled state (STYLE's `savedPresets` list) or add overhead disproportionate to two number fields (TIME).
- STYLE's API service files (`api-list-presets.js`/`api-save-preset.js`) are pulled out of the STYLE UI task into their own Batch-1 task — they're a service module independent of the UI that consumes them, and only need Task 2's already-pinned route contract, not the STYLE UI task's completion.
- Tasks 8–9 (inline edit, drag) get their own new file (`static/ui-text-interaction.js`), mirroring the existing `ui-resize-handles.js` precedent, instead of being inlined into `preview.js`. They stay sequential tasks against that one file — genuinely coupled (one `mousedown` handler, one element, branching on outcome) — but no longer grow `preview.js` directly.
- Per the master plan's process rule, both parallel batches use `superpowers:using-git-worktrees` (one worktree per task) + `superpowers:subagent-driven-development`, not same-directory dispatch — matches the standing process for all future phases, not just this one.
