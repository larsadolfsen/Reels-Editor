# Subpanel host convergence

Six files hand-roll the same "open a drill-down, hide the main view" toggle instead of using the
shared `SubpanelHost` component (`static/subpanel-host.js`, renamed 2026-08-01 from
`StylePanelHost` when `box-panel-mask.js`'s MASK tab became a second consumer beyond TEXT/CAPTIONS):

1. `static/text-panel-background.js`
2. `static/text-panel-border.js`
3. `static/caption-panel-background.js`
4. `static/caption-panel-border.js`
5. `static/caption-panel-filler-words.js`
6. `static/caption-panel-language.js`

## Why converge

`panel-text.js`/`panel-captions.js` already construct one `SubpanelHost` instance per panel
(`textStyleHost` over `#panel-text-main`/`#panel-text`, `captionStyleHost` over
`#panel-captions-main`/`#panel-captions`) that every shared `style-section-*.js` file registers
its drill-downs against (Font Family, Weight, Color, Outline, Shadow, Highlight, Position,
Spotlight). The 6 files above hide/show the *same* main/drill pair by hand instead — so today,
opening e.g. Background's hand-rolled panel and then clicking Font Family doesn't coordinate: both
could show open at once, since the shared host has no idea the hand-rolled panel exists. Converging
onto the one host instance per panel fixes that class of bug for free, and gets the `style-sub-panel`
CSS class (full-width layout + the `[hidden]` display override) automatically — the same fix that
resolved the MASK tab's Type-picker squeeze/overlap bug earlier today.

## Reuse

- `SubpanelHost` (`static/subpanel-host.js`) — no changes needed; it's already general-purpose.
- The existing `textStyleHost`/`captionStyleHost` instances in `panel-text.js`/`panel-captions.js`
  — top-level `const` bindings in a classic script are visible across `<script>` tags in the same
  page (same mechanism `project` in `editor.js` already relies on), so each of the 6 files can call
  `textStyleHost.page(...)`/`captionStyleHost.page(...)` by name without any new plumbing to pass
  the host in.
- `UI.subPanelHeader`, `UI.settingsRow`, `UI.listRow` etc. — unchanged, `SubpanelHost.page()` already
  wires the header for every registered page.

## Design

Per file, the migration is mechanical:

1. Delete the file's `openXPanel`/`closeXPanel` functions and its manual
   `UI.subPanelHeader(document.getElementById("...-subpanel-header"), {...})` wiring.
2. Register one page: `const xPage = textStyleHost.page("Title", (bodyEl) => { ...build the
   subpage's fields into bodyEl... });` — called once, at module scope (mirrors how
   `style-section-*.js` files build their own subpages).
3. Point the settings row's `onClick` at `xPage.open` instead of the old `openXPanel`.
4. Rewrite the subpage's field-building to construct DOM in `buildBody(bodyEl)` instead of reading
   static markup by id (`document.getElementById("text-box-background-color-field")` etc.) — since
   `SubpanelHost.page()` rebuilds the body fresh into a plain div on every open, it doesn't read
   index.html markup at all. This mirrors the existing `style-section-*.js` pattern exactly (e.g.
   `style-section-color.js`'s drill-down body-building).
5. Delete the now-unused static markup for that subpage from `static/index.html` (the drill-down
   container and its header/field divs — e.g. `#panel-text-background`,
   `#text-background-subpanel-header`, `#text-box-background-color-field`). The **settings row**
   that opens it (e.g. "Background: None >") is unaffected and stays exactly where it is — only the
   drill-down body it opens moves from static markup to JS-built.

Each file's content is small (a toggle, a color swatch, sometimes a width/radius field, or — for
filler-words/language — a short list), so the body-building rewrite per file is bounded, not a
large effort.

## Scope boundary

`SubpanelHost` itself is not touched. No behavior change to any *other* already-converged subpage
(Font Family, Weight, Color, ...). No change to `box-panel-mask.js`'s MASK tab (already converged
today). This is purely: 6 files migrate their toggle + body-building onto the existing host
instances, and their now-dead static markup is removed from `index.html`.

## Testing

- `node --test "tests/js/**/*.test.js"` after each file's migration (315 tests today; this class of
  file has no dedicated DOM tests — a stated, pre-existing gap the map already documents for
  `style-section-*.js` files, unaffected by this migration).
- Live browser verification per file: open the subpage, confirm it matches Font Family's look
  (full-width, correct header), confirm Back returns to the main view correctly, confirm opening a
  *different* panel's subpage (e.g. Font Family) while this one is open doesn't show both at once.

## Execution

Six independent files, one subagent per file (subagent-driven-development), since none of the 6
share any file-level state with each other — only the read-only `textStyleHost`/`captionStyleHost`
they all reference. Each subagent's task: migrate its one file + delete its dead markup from
`index.html` + verify live in browser + run the JS test suite. A final whole-branch review checks
no two migrations stepped on each other's `index.html` edits.
