# TEXT panel: Font accordion as its own component — design

## Goal

Extract the FONT accordion (currently hardcoded markup in `static/index.html` plus a one-off `change` listener and `UI.accordion(...)` wiring call in `static/editor.js`) into a single, self-contained, reusable component: `UI.fontAccordion(container, options)`. It should be reusable later by the CAPTIONS panel, once that panel's real editor (Task 10/11) needs a font control — not just by TEXT.

## Reuses

- `window.UI` module pattern (`static/ui-components.js`): prop-driven components taking `(container, { value, onChange, ... })` and returning an updater object, same convention as `numberField`/`colorSwatch`.
- `UI.accordion(header, body, options)` (already in `ui-components.js`) for expand/collapse behavior — `fontAccordion` builds its own header/body elements and wires them through this existing helper rather than reimplementing toggle logic.
- Existing `.accordion-header`/`.accordion-chevron`/`.accordion-body` CSS (`static/css/components/accordion.css`) and `.style-group`/`.style-row`/`.style-field` CSS (`style-panel.css`) — untouched, just applied to JS-created elements instead of static markup.

## New file: `static/components/font-accordion.js`

A new folder, `static/components/`, holds composite/shared widgets that (unlike the simple atoms in `ui-components.js`) may need their own file because they compose other components (here, `UI.accordion`) and are reused across more than one context panel. It attaches to the same `window.UI` namespace so call sites don't need to know which file a given `UI.*` function lives in.

`UI.fontAccordion(container, { value, onChange })`:
- Builds, entirely in JS, and appends into `container`:
  - `<button class="accordion-header" type="button">FONT <svg class="accordion-chevron" .../></button>` (same chevron markup/Lucide path as the MISC header).
  - `<div class="accordion-body" hidden>` wrapping a `<div class="style-group"><div class="style-row"><label class="style-field">FONT <select>...options...</select></label></div></div>`.
  - The `<select>` has the same two hardcoded options as today: `Public Sans`, `JetBrains Mono`.
- Sets the select's initial value from `value`.
- Wires the select's `change` event to call `onChange(select.value)`.
- Calls `UI.accordion(header, body, { expanded: false })` internally to wire expand/collapse — no separate call needed at the site that invokes `fontAccordion`.
- Returns `{ setValue(font) }` so a caller can update the displayed value later without rebuilding (matches the updater-return convention of other `UI.*` components), even though the TEXT panel doesn't need to call it today (see Markup changes below).

No new CSS is needed — the component reuses existing `accordion.css`/`style-panel.css` classes verbatim.

## Markup changes (`static/index.html`)

- `#panel-text`'s current FONT accordion markup (the `#text-font-header` button + `#text-font-body` div, holding the `#text-font-field` label/select) is deleted and replaced with a single empty placeholder: `<div id="text-font-accordion"></div>`, positioned exactly where the FONT accordion is today (above MISC).
- New script tag added: `<script src="/static/components/font-accordion.js"></script>`, placed after `ui-components.js` and before `editor.js` (so `UI.fontAccordion` exists before `editor.js` runs, and `UI.accordion` exists before `font-accordion.js` runs).

## Wiring changes (`static/editor.js`)

- Removed: the `document.getElementById("text-font").addEventListener("change", ...)` block, and the line `UI.accordion(document.getElementById("text-font-header"), document.getElementById("text-font-body"), { expanded: false })`.
- Removed: `document.getElementById("text-font").value = preset.font;` inside `renderTextPanel()`.
- Added, inside `renderTextPanel()` (which only runs once at app load today, so rebuilding the component's DOM each call is safe — no risk of losing expand/collapse state from user interaction):

```js
UI.fontAccordion(document.getElementById("text-font-accordion"), {
  value: preset.font,
  onChange: async (font) => {
    preset.font = font;
    await saveProject();
    renderTextPreview();
  }
});
```

## Out of scope

- No changes to the CAPTIONS panel's markup/behavior — its FONT-equivalent control doesn't exist yet (still the disabled placeholder from Task 10/11's stand-in). This spec only makes the component available for that future work to call; it does not wire it in there.
- No changes to the MISC accordion, its remaining fields (TIME/SIZE/B-I-U/colors/box/align/position), or any other context-panel section.
- No changes to any text-block/preset data model, ASS rendering, or export logic — purely a panel-layout/component-extraction change.
- No persistence of the Font accordion's expanded/collapsed state (matches existing MISC behavior — always starts collapsed).

## Testing

UI layout/wiring only, no pure-function logic to unit test (`app/` Python layer untouched, no new pytest coverage needed). Verified manually in the browser:
- Open TEXT panel, confirm FONT accordion renders above MISC, collapsed by default, with the select showing the current preset's font.
- Click FONT header, confirm body reveals (chevron rotates) independently of MISC's state.
- Change the font select, confirm the preview text updates and the value persists (reload confirms it was saved).
- Collapse FONT again, confirm MISC still toggles independently.
