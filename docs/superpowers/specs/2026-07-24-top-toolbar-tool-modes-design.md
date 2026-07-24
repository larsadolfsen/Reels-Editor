# Top toolbar with Select / Text tool modes — design

Date: 2026-07-24
Status: approved

## Goal

Add a full-width toolbar strip at the top of the editor (the app currently has no top bar) with tool icons centered. Two tools: **Select** and **Text**. This introduces a real tool-mode state that future tools can plug into.

## Reuse

- `.icon-btn` styling pattern (`static/css/components/button-group.css`) as the visual basis for the toolbar's icon buttons.
- Lucide icon paths (`mouse-pointer` for Select, `type` for Text), hand-inlined per project convention.
- Existing `addTextBlock()` / `Preview.enterTextEditMode()` (`static/panel-text.js`, `static/preview-text.js`) for text creation/editing — the Text tool composes these, it does not reimplement them.
- Design tokens (`static/css/tokens.css`) for all colors/spacing/radii.

## Components (new)

- `static/tool-mode.js` — `window.ToolMode.{get, set, onChange}`: DOM-free current-tool state holder. Default `"select"`. `set` notifies `onChange` subscribers. No persistence — resets to Select on reload.
- `static/ui-toolbar.js` — `UI.toolbar(container)`: renders the two icon buttons into the new `#toolbar` element, highlights the active tool (subscribes via `ToolMode.onChange`), clicking a button calls `ToolMode.set`.
- `static/css/components/toolbar.css` — `#toolbar`: full-width strip above `main` (new element in `static/index.html`, sibling before `main` inside `#app`), flex with `justify-content: center` so icons are centered; height/spacing/colors from tokens.

## Behavior

### Select (default)

Today's behavior, minus click-to-edit on text:

- Clicking any box (text block, video box) selects it and opens its side panel; dragging moves it.
- Clicking a text block **no longer enters edit mode** — the glyph-hit edit path in `static/ui-text-interaction.js` is gated on the active tool being `"text"`. In Select mode a glyph click behaves like a box click (select + panel; drag moves).

### Text

- Clicking an **existing text block** enters on-stage edit (`contentEditable`) and opens the TEXT panel. Does not revert the tool.
- Clicking **anywhere else on the stage** inserts a new text block at the click point — client coords converted to 1080×1920 canvas px via a small pure function; the converted point becomes the block preset's `x`/`y` (same coordinate semantics as existing blocks, clamped inside the canvas) — and enters edit immediately, opening the TEXT panel. After inserting, the tool **auto-reverts to Select** (Figma/Canva behavior).
- Clicks on video boxes in Text mode count as "anywhere else" (insert text on top).

## Data model

No changes. No persistence of the active tool.

## Error handling

No new failure surfaces: tool state is in-memory only; text insertion reuses the existing create/save path (autosave indicator already covers save failures).

## Testing

No JS test runner exists in this project (pytest covers the backend only), and this feature is thin UI wiring — a stated manual-verification decision:

- Pure bits stay in their own functions (`ToolMode` state; click→canvas-px conversion) so logic is isolated even without a runner.
- Verified manually in the preview browser: toolbar renders centered, Select selects/drags without entering edit, Text edits existing blocks, Text inserts at click point + auto-reverts.
