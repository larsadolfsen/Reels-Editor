# TEXT panel: Misc accordion — design

## Goal

Restructure the right-hand TEXT context panel (`#panel-text`) so the heading text field stays pinned at the top, and everything else (TIME, STYLE, color/outline/box, TEXT ALIGN, POSITION) collapses into a single collapsible "MISC" accordion section, collapsed by default.

## Reuses

- `window.UI` module pattern in `static/ui-components.js` (`buttonGroup`, `numberField`, `colorSwatch`) — adding a new `UI.accordion` function to the same file/object, following the same "wire an existing DOM element" style used elsewhere in this codebase for panel markup.
- Existing `.context-panel` / `.style-group` / `.style-divider` classes in `style-panel.css` — untouched, just re-scoped inside the accordion body.

## Component: `UI.accordion(header, body, options)`

- `header`: an existing `<button>` element (already in the DOM, from `index.html`).
- `body`: an existing container element (already in the DOM) holding the section's content.
- `options.expanded` (boolean, default `false`): initial state.
- Behavior: sets `body.hidden` and `header.setAttribute('aria-expanded', ...)` to match initial state; adds a `click` listener on `header` that toggles both.
- Returns `{ setExpanded(bool) }` for programmatic control (not needed for this feature today, but matches the updater-return convention of `buttonGroup`/`numberField`/`colorSwatch`).
- No persistence — always starts collapsed each time the panel is (re)opened, matching current behavior of the rest of the style panel (no section remembers open/closed state across selections today).

## Markup changes (`static/index.html`, `#panel-text`)

Before (current order): heading textarea → TIME group → divider → STYLE group (font/size/B-I-U) → color/outline/box groups → divider → TEXT ALIGN → POSITION.

After:
1. Heading textarea (`#text-heading`) — unchanged, stays first, always visible.
2. `<button id="text-misc-header" class="accordion-header" type="button" aria-expanded="false">MISC <svg class="accordion-chevron">...</svg></button>`
3. `<div id="text-misc-body" class="accordion-body" hidden>` wrapping, unmodified: TIME group, divider, STYLE group, color/outline/box groups, divider, TEXT ALIGN group, POSITION group.

No IDs of the wrapped controls change, so no changes needed in `editor.js`'s existing `renderTextPanel`/`updateTextStyle`/etc. wiring — only one new call is added during panel setup:

```js
UI.accordion(document.getElementById('text-misc-header'), document.getElementById('text-misc-body'), { expanded: false });
```

## CSS

New file `static/css/components/accordion.css`, linked from `index.html`:
- `.accordion-header`: full-width button, flex row (title + chevron pushed right), styled consistently with `.style-group-label` (mono-caps) but clickable/hoverable.
- `.accordion-chevron`: small SVG, `transform: rotate(90deg)` when `aria-expanded="true"` on the parent header (`.accordion-header[aria-expanded="true"] .accordion-chevron`).
- `.accordion-body`: no special styling beyond `[hidden]` — content inside keeps using existing `.style-group`/`.style-divider` classes.

## Out of scope

- No other accordion sections beyond MISC (confirmed with user — single section only).
- No persistence of expanded/collapsed state.
- No changes to the CAPTIONS or VIDEO context-panel sections.
- No changes to any text-block data model or styling logic — this is purely a panel-layout change.

## Testing

This is UI layout/wiring with no pure-function logic to unit test beyond `UI.accordion`'s toggle behavior, which is thin DOM wiring (open/close, aria-expanded, hidden). Verified manually in the browser: open TEXT panel, confirm heading field visible + MISC collapsed by default, click MISC header, confirm body reveals and chevron rotates, click again to collapse. No new pytest coverage needed (`app/` Python layer is untouched).
