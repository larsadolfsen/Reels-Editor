# TEXT panel: Font accordion as its own component — design

## Goal

Extract the FONT accordion (currently hardcoded header/chevron/select markup in `static/index.html` plus a one-off `change` listener and `UI.accordion(...)` wiring call in `static/editor.js`) into a single, self-contained, reusable component: `UI.fontAccordion(container, options)`. It should be reusable later by the CAPTIONS panel, once that panel's real editor (Task 10/11) needs a font control — not just by TEXT.

Along the way, factor out the accordion **header+wiring shell** itself (title text + chevron SVG + `UI.accordion` call) into one shared component, so `fontAccordion` and the existing MISC accordion both build on it instead of each hand-writing the same header markup. MISC is migrated onto the shell in this same pass.

## Reuses

- `window.UI` module pattern (`static/ui-components.js`): prop-driven components taking `(container, options)` and returning an updater object, same convention as `numberField`/`colorSwatch`.
- `UI.accordion(header, body, options)` (already in `ui-components.js`) for expand/collapse behavior — the new shell builds on top of it rather than replacing it.
- Existing `.accordion-header`/`.accordion-chevron`/`.accordion-body` CSS (`static/css/components/accordion.css`) and `.style-group`/`.style-row`/`.style-field` CSS (`style-panel.css`) — untouched, just applied to JS-created elements instead of static markup where noted below.

## New shell: `UI.accordionSection(container, body, { title, expanded })` (added to `static/ui-components.js`)

Generic and data-agnostic, same category as `UI.accordion` — lives in the same file, right next to it.

- `container`: parent element the header and body live in.
- `body`: an element holding the section's content. Two ways to use it:
  - **Pre-populated** (MISC's case): `body` already contains static HTML content and may already be a child of `container` in the DOM (nested there for readability in `index.html`) — the function just adds it as `container`'s last child (a no-op move if it's already there and already last).
  - **Empty, freshly created** (Font's case): caller does `document.createElement('div')`, fills it in afterward (or before — order doesn't matter since nothing is visible until expanded), and passes it in not yet attached to any parent.
- Behavior:
  1. Builds `<button class="accordion-header" type="button">{title} <svg class="accordion-chevron" .../></button>` (same chevron path used by today's MISC header).
  2. Adds the `accordion-body` class to `body`.
  3. Appends header then body into `container` (this is what makes the "pre-populated, already a child" case safe — `appendChild` on an existing child just repositions it to last, which is where it needs to be relative to the newly created header anyway).
  4. Calls `UI.accordion(header, body, { expanded })` to wire the actual toggle behavior.
- Returns `{ header, body }`.

## New file: `static/components/font-accordion.js`

A new folder, `static/components/`, holds composite/shared widgets that (unlike the simple atoms in `ui-components.js`) may need their own file because they compose other `UI.*` components and are reused across more than one context panel. It attaches to the same `window.UI` namespace so call sites don't need to know which file a given `UI.*` function lives in.

`UI.fontAccordion(container, { value, onChange })`:
- Builds, entirely in JS: a `<div class="style-group"><div class="style-row"><label class="style-field">FONT <select>...options...</select></label></div></div>` as a detached body element. The `<select>` has the same two hardcoded options as today: `Public Sans`, `JetBrains Mono`.
- Sets the select's initial value from `value`.
- Wires the select's `change` event to call `onChange(select.value)`.
- Calls `UI.accordionSection(container, body, { title: "FONT", expanded: false })` to build the header and wire expand/collapse — no separate header markup or `UI.accordion` call needed here.
- Returns `{ setValue(font) }` so a caller can update the displayed value later without rebuilding (matches the updater-return convention of other `UI.*` components), even though the TEXT panel doesn't need to call it today (see Wiring changes below).

No new CSS is needed — both the shell and `fontAccordion` reuse existing `accordion.css`/`style-panel.css` classes verbatim.

## Markup changes (`static/index.html`)

**FONT:**
- `#panel-text`'s current FONT accordion markup (the `#text-font-header` button + `#text-font-body` div, holding the `#text-font-field` label/select) is deleted and replaced with a single empty placeholder: `<div id="text-font-accordion"></div>`, positioned exactly where the FONT accordion is today (above MISC).

**MISC:**
- The hand-written `<button id="text-misc-header">MISC <svg>...</svg></button>` is deleted.
- `<div id="text-misc-body" class="accordion-body" hidden>` becomes plain `<div id="text-misc-body">` (no `class`/`hidden` — `UI.accordionSection` adds those), nested one level deeper inside a new wrapper: `<div id="text-misc-accordion"><div id="text-misc-body">...unchanged content (TIME/STYLE/colors/box/align/position)...</div></div>`.

**Script tags:**
- New `<script src="/static/components/font-accordion.js"></script>` added after `ui-components.js` and before `editor.js` (so `UI.fontAccordion` exists before `editor.js` runs, and `UI.accordionSection`/`UI.accordion` exist before `font-accordion.js` runs).

## Wiring changes (`static/editor.js`)

- Removed: the `document.getElementById("text-font").addEventListener("change", ...)` block.
- Removed: `document.getElementById("text-font").value = preset.font;` inside `renderTextPanel()`.
- Removed: `UI.accordion(document.getElementById("text-font-header"), document.getElementById("text-font-body"), { expanded: false })`.
- Changed: `UI.accordion(document.getElementById("text-misc-header"), document.getElementById("text-misc-body"), { expanded: false })` becomes:
  ```js
  UI.accordionSection(document.getElementById("text-misc-accordion"), document.getElementById("text-misc-body"), { title: "MISC", expanded: false });
  ```
- Added, inside `renderTextPanel()` (which only runs once at app load today, so rebuilding the Font component's DOM each call is safe — no risk of losing expand/collapse state from user interaction):
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

- No changes to the CAPTIONS panel's markup/behavior — its FONT-equivalent control doesn't exist yet (still the disabled placeholder from Task 10/11's stand-in). This spec only makes `UI.fontAccordion`/`UI.accordionSection` available for that future work to call; it does not wire either into CAPTIONS.
- No changes to MISC's remaining fields (TIME/SIZE/B-I-U/colors/box/align/position) or their wiring — only its header/body wrapper markup moves onto the new shell.
- No changes to any text-block/preset data model, ASS rendering, or export logic — purely a panel-layout/component-extraction change.
- No persistence of either accordion's expanded/collapsed state (matches existing behavior — always starts collapsed).

## Testing

UI layout/wiring only, no pure-function logic to unit test (`app/` Python layer untouched, no new pytest coverage needed). Verified manually in the browser:
- Open TEXT panel, confirm FONT accordion renders above MISC, collapsed by default, with the select showing the current preset's font.
- Click FONT header, confirm body reveals (chevron rotates) independently of MISC's state.
- Change the font select, confirm the preview text updates and the value persists (reload confirms it was saved).
- Click MISC header, confirm it still expands/collapses correctly (chevron rotates, all its fields still visible and functional) after moving onto `UI.accordionSection`.
- Collapse FONT again, confirm MISC still toggles independently.
