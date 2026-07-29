# Shared style sections for the TEXT and CAPTIONS panels

Date: 2026-07-29

## Problem

The TEXT and CAPTIONS context panels style the same entity — a `TextPreset` — through
two entirely separate sets of files. Nineteen files across `static/text-panel-*.js` and
`static/caption-panel-*.js` (~1,700 lines) are near-identical copies of each other, and
their markup is hand-duplicated a second time inside `static/index.html`.

Every new styling feature has been added to one side and copied by hand to the other.
Several copies were incomplete, so the two panels have visibly diverged:

- Row order differs: TEXT is Font Family → Weight → SIZE, CAPTIONS is Font Family →
  SIZE → Weight.
- The case button group sits on the Italic/Underline row in TEXT
  (`class="btn-group-inline"`, `index.html:671`) but on its own row in CAPTIONS — the
  class was never copied across (`index.html:256`).
- The font-size step scale stops at 56 in TEXT
  (`text-panel-font-style.js:53`) but runs to 96 in CAPTIONS
  (`caption-panel-font-style.js:20`).
- Highlight is a drill-down row in TEXT and an inline MARKER/MODE group in CAPTIONS.

`static/caption-panel-case.js` is a byte-for-byte copy of `static/text-panel-case.js`
with three tokens changed. That is the shape of the whole problem.

### Bugs this surfaced

Two, both caused by an incomplete hand-copy.

#### 1. TEXT's step-up button moves the size down

`panel-text.js:41` defaults a new text block to `size_px: 96`, but TEXT's step scale
tops out at 56. `stepFontSizePreset(96, +1)` finds no larger preset and falls back to
the last entry, so clicking **step up** on a fresh text block moves the size *down* to
56. CAPTIONS' scale includes 72 and 96 and behaves correctly. Adopting the CAPTIONS
scale for both fixes this.

#### 2. CAPTIONS' saved styles silently drop the MARKER state

`text-panel-style.js:19-30`'s `styleFieldsOf` lists `highlight` among the fields a saved
style carries. `caption-panel-style.js:15-27`'s copy of the same function omits it while
keeping `highlight_color`, `highlight_mode` and `highlight_border_radius`. Saving a
caption style with MARKER on and re-applying it therefore comes back with MARKER off.

This is also why the `extraFields` option is unnecessary: the two field lists are
already meant to be identical, and one shared list — including `highlight` — is the fix.

## What actually differs between the pairs

Across all nineteen files, only four things ever change:

1. Which preset is read — `ensureTextPreset(currentTextBlock().preset_id)` versus
   `ensureCaptionPreset(ensureCaptionTrack().preset_id)`.
2. Which preview is re-rendered — `renderTextPreview()` versus `renderCaptionPreview()`.
3. The DOM element ids — `text-*` versus `caption-*`.
4. TEXT only: a write targets a per-range `FormatRun` when a stage text selection is
   active, instead of the whole-block preset.

Everything else is copied. Those four differences are the seam this design cuts along.

## Architecture

Three layers, each with one job.

### Layer 1 — Style target

A small adapter object describing *what* is being styled. It absorbs differences 1, 2
and 4 from the list above.

```js
{
  getPreset(),                    // -> TextPreset
  setField(field, value),         // writes, saves, re-renders the right preview
  rerenderPreview(),              // renderTextPreview() | renderCaptionPreview()
  rerenderPanel(),                // renderTextPanel()   | renderCaptionPanel()
  getBoxSize(),                   // Preview.getTextBoxSize(id) | getCaptionBoxSize()
}
```

Two implementations:

- `StyleTarget.forTextBlock()` — `setField` consults
  `Preview.getActiveFormatSelection()`; when a selection on the current block is
  active it upserts a `FormatRun` for that range instead of writing the base preset.
- `StyleTarget.forCaptionTrack()` — `setField` always writes the preset.

Because the selection branch lives inside the target, every component above it is
branch-free. This is what lets a single section file serve both panels.

`setField` is the only write path. Sections never touch `preset.x = v` directly, never
call `saveProject()`, and never call a `render*Preview()` function by name.

### Layer 2 — Style panel host

`StylePanelHost(mainEl, drillContainerEl)` manages drill-down subpages generically,
replacing seven hand-copied `openXPanel` / `closeXPanel` function pairs and their
`panel-text-main` / `panel-captions-main` id juggling.

```js
const page = host.page("Outline", (container) => { /* build subpage body */ });
page.open();   // hides mainEl, shows the subpage
page.close();  // reverse
```

The host builds each subpage's `UI.subPanelHeader` (back arrow + title) itself, so a
section only supplies its body.

### Layer 3 — Section components

One control group per file, namespaced `window.StyleSection.*`, signature
`(container, target, options)`. Each **builds its own markup** into `container` rather
than wiring markup that already exists in `index.html`.

This is the decisive property. The reported symptom — the missing `btn-group-inline`
class in CAPTIONS — was a *markup* divergence, not a JS one. Sharing only the JS while
leaving two hand-written copies of the markup in `index.html` would not have prevented
it. Markup-owning components also match how `UI.buttonGroup`, `UI.numberField`,
`UI.settingsRow` and `UI.colorSwatch` already work in this codebase.

Genuine per-panel differences become named options, never copied markup:

| Section | Option | TEXT | CAPTIONS |
|---|---|---|---|
| `boxSize` | `sizeModes` | `true` (FIT/FREE/FILL) | `false` (always fixed) |
| `highlight` | `modes` | `false` | `true` (current word / progressive fill / background) |

### Layer 4 — Tab composers

`StyleTab.design(container, target, options)`, `StyleTab.box(...)`,
`StyleTab.styleLibrary(...)` render their sections in a fixed order and are called by
both panels.

Without this layer the two panels would each enumerate sections themselves and could
still list them in different orders — reintroducing exactly the divergence this design
removes. The composers are what make the shared layout structural rather than
conventional.

## Files

### New (21)

```
static/style-target-text.js          # StyleTarget.forTextBlock()
static/style-target-caption.js       # StyleTarget.forCaptionTrack()
static/style-panel-host.js           # StylePanelHost: generic drill-down subpages
static/font-size-scale.js            # pure: FONT_SIZE_PRESETS + stepFontSizePreset
static/format-run-write.js           # pure: upsertFormatRun
static/style-fields.js               # pure: styleFieldsOf — the shared saved-style field list
static/style-section-font-family.js
static/style-section-font-weight.js
static/style-section-size.js         # size steppers + SIZE field
static/style-section-emphasis.js     # italic + underline + case, one row
static/style-section-color.js
static/style-section-outline.js
static/style-section-shadow.js
static/style-section-highlight.js
static/style-section-box.js          # size mode + w/h + background + border
static/style-section-align.js
static/style-section-position.js
static/style-section-preset-library.js
static/style-tab-design.js
static/style-tab-box.js
static/style-tab-style.js
```

### Deleted (19)

```
static/text-panel-font-family.js     static/caption-panel-font-family.js
static/text-panel-font-weight.js     static/caption-panel-font-weight.js
static/text-panel-font-style.js      static/caption-panel-font-style.js
static/text-panel-outline.js         static/caption-panel-outline.js
static/text-panel-shadow.js          static/caption-panel-shadow.js
static/text-panel-highlight.js       static/caption-panel-highlight.js
static/text-panel-style.js           static/caption-panel-style.js
static/text-panel-align.js           static/caption-panel-box.js
static/text-panel-case.js            static/caption-panel-case.js
static/text-panel-position.js
```

`renderBoxPanel()` is removed from `static/panel-text.js` in the same pass — it is the
TEXT half of what becomes `StyleSection.box`.

### Kept unchanged

`static/text-panel-time.js`, `static/caption-panel-words.js`,
`static/caption-panel-language.js`, `static/caption-panel-filler-words.js` — these are
genuinely single-panel and have no counterpart to share with.

### Changed

- `static/index.html` — loses ~250 lines of duplicated markup (the `#text-font-body`
  and `#caption-font-body` bodies and both Box-tab bodies become empty mount points),
  loses 19 script tags, gains 21.
- `static/panel-text.js` — `renderTextPanel()` builds a target once and calls the tab
  composers.
- `static/panel-captions.js` — same.
- `CLAUDE.md` — file structure tree and inventory updated in the final batch.

## Resolved divergences

The user chose "TEXT wins" where the two panels differ by accident.

| Item | Resolution |
|---|---|
| Row order | Font Family → Weight → SIZE (TEXT's order) for both |
| Case buttons | inline on the Italic/Underline row (`btn-group-inline`) for both |
| Highlight | drill-down row for both; CAPTIONS' MARKER/MODE/color/radius move inside the drill-down |
| Font-size scale | one scale `[12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96]` (CAPTIONS' superset) — fixes the TEXT step-up bug |
| TEXT Box tab | unchanged; keeps FIT/FREE/FILL via `sizeModes: true` |
| CAPTIONS Box tab | unchanged; stays always-fixed via `sizeModes: false` |
| Saved styles | one shared `styleFieldsOf` list — TEXT's, which includes `highlight`; fixes bug 2 |
| Weight row label | "Regular 400" (TEXT's format) for both; CAPTIONS showed just "Regular" |
| Control state under a selection | Italic, Underline and the weight checkmark show the *selected range's* value, not the block's base value |

The font-size scale is the one place CAPTIONS' version wins, because TEXT's is a
straightforward bug. Everywhere else TEXT's version is the more complete one.

The last two rows were found while drafting the batch plans, after the first seven
were agreed, and are approved additions. The "control state" row is arguably a bug
fix in its own right: today you can select bold text on the stage and the Bold button
still reads unpressed, because `text-panel-font-style.js:42-45` updates `aria-pressed`
only in the no-selection branch.

### Raised and declined

Two further convergences were considered and rejected. The shared components must
actively **preserve** each difference rather than erase it.

- **CAPTIONS' size-row alignment.** `style-panel.css` has
  `#text-size-row { gap: 6px; align-items: end }` plus a `-34px` label offset, with no
  `#caption-size-row` equivalent, so the two size rows have always been aligned
  differently. `StyleSection.size` takes a `compactRow` option that TEXT passes and
  CAPTIONS does not. Converging it later is a one-word change at the CAPTIONS call
  site.
- **Selection-aware font family.** Writing `font` through `setField` would add
  per-range fonts within a single heading. `FormatRun.font` exists and
  `preview-text.js` resolves it, but no current file ever writes one, so this would be
  a new capability rather than a de-duplication. `font` uses `setPresetField`.

### CSS is a third divergence surface

The problem statement cites markup and JS. Id-scoped CSS is a third place the panels
drift, and a markup-owning component forces every such rule to resolve — a shared
section renders twice and so cannot carry an id. There are exactly three such rules,
enumerated with their resolutions in the implementation plan's "CSS divergence
surface" section. Going forward, a section that needs styling defines a class.

## Data model

No changes. `TextPreset`, `FormatRun` and `TextBlockLayer` in `app/models.py` are
untouched, no new persisted entities are introduced, and no saved project needs
migrating. This is a frontend composition change only; the backend, the export
pipeline and the ASS renderer are not involved.

## Testing

The frontend currently has no test suite — `tests/` is entirely Python. This design
adds Node's built-in test runner, which needs no new dependency (Node 24 is already
installed).

Command, to be added to `CLAUDE.md`'s run commands:

```
node --test "tests/js/**/*.test.js"
```

Pure modules export for both environments — a `window` assignment for the browser and
a guarded `module.exports` for the test runner:

```js
if (typeof module !== "undefined") module.exports = { stepFontSizePreset, FONT_SIZE_PRESETS };
```

Covered:

| Module | Cases |
|---|---|
| `font-size-scale.js` | step up/down from an on-scale value; snap from an off-scale value; clamp at both ends without wrapping; **step up from 96 stays at 96** (the regression test for the bug above) |
| `format-run-write.js` | creates a run for a new range; updates in place on an exact-range re-edit rather than duplicating; initialises `formatting_runs` when the key is absent on a freshly created block |
| `style-target-text.js` | `setField` writes a `FormatRun` when a selection on the current block is active; writes the base preset when there is no selection; writes the base preset when the selection belongs to a *different* block |
| `style-target-caption.js` | `setField` always writes the preset |
| `style-fields.js` | the shared `styleFieldsOf` list includes `highlight` (the regression test for bug 2) |

The targets are testable because they take their collaborators (`getSelection`,
`save`, `rerender`) as injected functions rather than reaching for globals — which is
also what makes them readable.

### Stated gap

The section components build DOM and are not unit-tested. This is accepted rather than
silent: the sections are kept as thin as possible, with all decision logic pushed into
the pure modules and the targets above, and each migration batch is verified in the
browser on a throwaway project with before/after screenshots of both panels. Per
project convention, live verification never runs against real project data, because the
app's unload keepalive-save flushes in-memory state to disk.

## Migration

Six batches. Each one ends with both panels fully working in the browser and a commit;
no batch leaves the app in a half-migrated state at rest.

**Batch 1 — Foundation.** `style-target-text.js`, `style-target-caption.js`,
`style-panel-host.js`, `font-size-scale.js`, `format-run-write.js`, plus `tests/js`
and the `node --test` command. Nothing is wired into the panels yet. Verified by the
test run.

**Batch 2 — Font family and weight.** `style-section-font-family.js`,
`style-section-font-weight.js`, `style-tab-design.js` (partial). Both panels switch
over; the four old files are deleted.

**Batch 3 — Size, emphasis, color.** `style-section-size.js`,
`style-section-emphasis.js`, `style-section-color.js`. This batch lands the row-order
change, the inline case group and the unified size scale.

**Batch 4 — Outline, shadow, highlight.** `style-section-outline.js`,
`style-section-shadow.js`, `style-section-highlight.js`. This batch moves CAPTIONS'
MARKER/MODE into the drill-down.

**Batch 5 — Box tab.** `style-section-box.js`, `style-section-align.js`,
`style-section-position.js`, `style-tab-box.js`. `renderBoxPanel()` leaves
`panel-text.js`; `caption-panel-box.js` is deleted.

**Batch 6 — Style tab and cleanup.** `style-section-preset-library.js`,
`style-tab-style.js`. Remaining old files deleted, `index.html` script tags tidied,
`CLAUDE.md` file structure and inventory updated.

## Non-goals

- No change to what any control does, only to where its code lives and how the two
  panels are laid out relative to each other.
- No new styling features.
- No JS build step, bundler, or module system. The codebase deliberately has none, and
  these stay classic scripts loaded by ordered `<script>` tags.
- No refactoring of the single-panel files (`text-panel-time.js`,
  `caption-panel-{words,language,filler-words}.js`).
- No backend or export-pipeline changes.
