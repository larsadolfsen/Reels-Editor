# Undo/Redo — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

Every edit autosaves immediately (`saveProject()` after each mutation), so any mistake is permanent. Add per-session undo/redo: Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z), in-memory only — a page reload starts fresh from the saved project. User confirmed per-session history is enough.

## Design

**Approach: whole-project snapshots** (chosen over a command/inverse-operation pattern — snapshots are boring, impossible to get half-wrong per-edit, and a project JSON is a few KB so 50 copies is nothing).

- New file `static/undo-history.js` exposing `window.UndoHistory`:
  - `record(projectJsonString)` — push the *previous* state onto the undo stack (dedupe: skip if identical to the top), clear the redo stack, cap at 50 entries (drop oldest).
  - `undo(currentJsonString) -> string | null` / `redo(currentJsonString) -> string | null` — standard two-stack semantics; the current state moves to the opposite stack.
  - `reset()` — called on project switch/open so history never crosses projects.
  - Pure state machine, no DOM, no fetch — all side effects stay in `editor.js`.
- **Capture point:** `editor.js`'s `saveProject()` is the single chokepoint every mutation already flows through. Keep the last-saved JSON string in a module variable; at the start of `saveProject()`, `UndoHistory.record(lastSavedJson)` before overwriting it. No per-callsite instrumentation.
  - Coalescing rapid-fire mutations (drag previews, per-keystroke heading edits) comes for free where code already saves only on gesture end (`onMoveEnd`, `onEditEnd`, `onDragEnd`). Number-field typing saves per change; acceptable v1 granularity.
- **Restore:** on undo/redo, parse the returned JSON into `project`, `saveProject()` (which records into the opposite stack via the two-stack logic, not the undo stack — `UndoHistory` handles this internally with an `isRestoring` flag or by `saveProject()` taking a `skipHistory` option; build session picks, the simpler wins), then full re-render: `Preview.load`, `renderTimeline`, `renderMediaList`, and re-open/refresh whichever panel section is showing. Selection state that points at a now-deleted entity is cleared.
- **Keys:** wired in `editor.js`'s existing global-keyboard handler, with its existing guard (skipped while focus is in input/textarea/select) extended to contentEditable (the stage text editor keeps the browser's native text undo while editing).

## Data model

Nothing persisted. In-memory: two arrays of JSON strings + one cap constant.

## Reuse

- `saveProject()` as the sole capture/restore chokepoint.
- The existing global keydown handler + focus guard in `editor.js`.

## Tasks

1. `static/undo-history.js` — the pure two-stack state machine (record/undo/redo/reset, dedupe, cap 50).
2. `editor.js` integration: capture in `saveProject()`, restore + full re-render, Ctrl+Z/Y/Shift+Z wiring with the extended focus guard, `reset()` on project switch.

## Testing

`UndoHistory` is a pure state machine but the repo has no JS test runner — stated untested layer per convention. Mitigation: keep *all* logic (two-stack semantics, dedupe, cap) in `undo-history.js` with zero DOM/fetch so it stays trivially readable; manual verification checklist = edit → undo restores prior state on stage/timeline/panel; redo re-applies; new edit after undo clears redo; 50-cap doesn't error; history resets on project switch; Ctrl+Z inside a text field does native text undo, not project undo.

## Out of scope

- History surviving reload (explicitly declined).
- Undo of non-project state (theme, panel collapse, zoom level).
- A visible history list UI.
