# Empty New Project + Timeline Add Buttons + Multiple Text Blocks — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

Two user-reported bugs and one feature, which turned out to be one coherent unit of work:

1. **Bug:** starting a new project shows the previous project's video on the stage.
2. **Bug + feature:** a new project's timeline must be completely empty — no seeded caption, no auto-created text block, no clips — and the VIDEO and TEXT timeline rows get **+ add buttons** as the way to put the first (and further) layers on it.
3. **Feature (user-chosen scope):** the TEXT row's + button adds *another* text block on every click — i.e. real multiple-text-block support, not a single-block empty-state affordance.

## Design

### 1. Truly empty new project

- Delete `static/seed.js` entirely (its script tag in `static/index.html` and the `seedDefaults(project)` call in `editor.js`'s `openProject()`). It was a dev convenience from before real transcription existed.
- Stop lazily auto-creating a text block: `editor.js`'s `ensureTextBlock()` no longer *creates* — opening the TEXT panel with zero blocks shows an empty state (see + buttons below) instead. `ensureTextPreset()` stays for blocks that exist.
- A brand-new project therefore has: `clips: []`, `text_blocks: []`, `captions: null`, empty media library. The CAPTIONS row stays empty until Auto-caption is run (existing flow, unchanged).

### 2. Stale-video fix

When `Preview.load(project)` is called for a project with zero clips, the stage `<video>` element currently keeps its previous `src` and shows the last project's frame. Fix in `static/preview.js`: on load with `clips.length === 0`, clear the player (`player.removeAttribute("src"); player.load();`) and reset the preload element's state (`preloadedIndex`) so nothing lingers. Verify the same reset path runs when switching projects via the PROJECTS panel.

### 3. Timeline + add buttons

- **VIDEO row:** a `+` button rendered at the end of the clips row (also when the row is empty). Click → the existing native file-picker flow (`GET /api/pick-file` → probe → `addClip()`), i.e. exactly what the MEDIA panel's import button does today — one shared code path, no duplicate logic.
- **TEXT row:** a `+` button rendered at the end of the text-blocks row (always visible). Click → creates a new empty `TextBlockLayer` with its own `TextPreset` (same defaults `defaultTextPreset()` uses today), selects it, opens the TEXT panel, and enters on-stage edit mode so the user can type immediately (reusing the existing empty-block minimum-clickable-size path in `preview.js`).
- Styling: a small square `.icon-btn`-style button inside the row track (Lucide plus icon, hand-inlined per convention). New CSS lives in `static/css/components/timeline.css`.

### 4. Multiple text blocks

The data model (`Project.text_blocks: list[TextBlockLayer]`, per-block `preset_id`), `app/ass_render.py` (iterates all blocks), and `static/preview.js` (renders all blocks) already support N blocks. The single-block assumption lives only in `static/editor.js`:

- Replace the implicit "the block" (`text_blocks[0]` via `ensureTextBlock()`) with an explicit `selectedTextBlockId` (module state in `editor.js`, analogous to `selectedMediaId`).
- The TEXT panel (`renderTextPanel()` and every `text-panel-*.js` file) targets the *selected* block. The `text-panel-*.js` files already receive the block/preset through `editor.js` accessors — audit each for direct `text_blocks[0]` reads and route them through one shared accessor (`currentTextBlock()`).
- Selection sources: clicking a block on the stage (existing `Preview.setOnStageTextActivate` path — extend it to carry the block id), clicking a block in the timeline TEXT row (existing `onTimelineSelect`), and the + button on create.
- The timeline TEXT row renders one block per entry (verify `timeline.js` already iterates; extend its click handling to pass the specific block).
- **Delete:** with multiple blocks there must be a way to remove one. A "Delete text" button at the bottom of the TEXT panel (outline/danger styling), plus the Delete key when a text block is selected and *not* in edit mode (guard: skip when focus is in an input/contentEditable, same guard the transport shortcuts use). Deleting removes the block and its preset from the project, clears selection, saves.

## Data model

No new entities or fields. `text_blocks` is already a list; each block already links its own preset via `preset_id`.

## Reuse

- Clip add: the MEDIA panel's existing pick-file → probe → `addClip()` path, called from the new button.
- Block create: `defaultTextPreset()` + the existing block-creation code inside `ensureTextBlock()`, extracted into `addTextBlock()`.
- Selection/panel plumbing: `selected` state, `showPanel("text")`, `Preview.setSelectedTextBlock`, `UI.textInteraction` — all existing.
- Icons: Lucide plus/trash paths, hand-inlined per convention.

## Testing

- Backend untouched except possibly none at all — `pytest` suite must stay green.
- `ass_render` multi-block output is already covered by existing tests (verify; add a two-block test case if not).
- JS/UI layer is thin wiring per convention — untestable layer stated explicitly: manual verification checklist = new project is fully empty; stage shows no stale video after switching; VIDEO + adds a clip; TEXT + adds a block, typing works immediately; two blocks are independently selectable/editable/stylable from stage and timeline; delete removes only the selected block; export burns both blocks.

## Out of scope

- A + button on the CAPTIONS row (Auto-caption is the entry point) and the AUDIO row (music is the separate audio item, `2026-07-20-audio-volume-music-design.md`).
- Z-ordering/layering UI between overlapping text blocks (blocks render in list order; fine for v1).
- Copy/duplicate a text block.
