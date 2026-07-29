# Shared Style Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nineteen near-identical `text-panel-*.js` / `caption-panel-*.js` files and their hand-duplicated markup in `index.html` with one set of shared, markup-owning style-section components, so the TEXT and CAPTIONS panels cannot drift apart again.

**Architecture:** Four layers. A **style target** adapter absorbs the only real differences between the panels (which preset is read, which preview re-renders, and TEXT's selection-aware `FormatRun` writes). A **style panel host** manages drill-down subpages generically. **Section components** each own one control group *and build their own markup*. **Tab composers** render sections in a fixed order and are called by both panels, making the shared layout structural rather than conventional.

**Tech Stack:** Plain browser JavaScript, classic `<script>` tags, no bundler or module system. Node 24's built-in test runner (`node --test`) for the pure modules. Existing `window.UI.*` primitives for all widgets.

**Spec:** `docs/superpowers/specs/2026-07-29-shared-style-sections-design.md`

**Batch files:**

- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-1.md` — Foundation
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-2.md` — Font family & weight
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-3.md` — Size, emphasis, color
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-4.md` — Outline, shadow, highlight
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-5.md` — Box tab
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-6.md` — Style tab & cleanup

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No bundler, no module system, no build step.** Files are classic scripts loaded by ordered `<script>` tags in `static/index.html`. No `import`/`export` syntax in `static/`.
- **No inline `style="..."` attributes** in `static/index.html` or in JS-built markup. All styling is a class defined in `static/css/**`. Setting `el.style.fontFamily` / `el.style.fontWeight` from JS for a *live preview of the value being edited* is the one established exception and is preserved verbatim where it already exists.
- **Every new `static/*.js` file opens with a one- or two-line comment** stating that file's purpose and role.
- **Recurring CSS values are tokens** in `static/css/tokens.css`, referenced with `var(...)`. No literal repeated twice.
- **Icon SVGs are hand-inlined Lucide paths** with the wrapper attributes already used in this codebase: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`. Copy existing icon markup verbatim rather than inventing new paths.
- **Pure modules export twice:** `window.X = api` for the browser and a guarded `if (typeof module !== "undefined") module.exports = api;` for the test runner. Only the pure modules do this — DOM-building sections do not.
- **Tests:** `node --test tests/js` must pass before every commit from Batch 1 onward. The Python suite (`.venv/Scripts/python -m pytest -q`) is unaffected by this work but must still pass at the end of Batch 6.
- **Behaviour is preserved** except for the seven changes listed in "Resolved divergences" in the spec. If a batch changes anything else that a user can see, that is a bug in the batch.
- **Live verification never runs against real project data.** Create a throwaway project in the picker first — the app's unload keepalive-save flushes in-memory state to disk.
- **Commit after every task.** Never leave a batch half-applied at rest: at the end of each task both panels must open and work in the browser.

---

## File structure

### Created

| File | Responsibility | Batch |
|---|---|---|
| `static/font-size-scale.js` | Pure. The one font-size step scale + `stepFontSizePreset`. | 1 |
| `static/format-run-write.js` | Pure. `upsertFormatRun` — per-range `FormatRun` upsert. | 1 |
| `static/style-fields.js` | Pure. `styleFieldsOf` — the saved-style field list. | 1 |
| `static/style-target-text.js` | `StyleTarget.forTextBlock(deps?)`. | 1 |
| `static/style-target-caption.js` | `StyleTarget.forCaptionTrack(deps?)`. | 1 |
| `static/style-panel-host.js` | `StylePanelHost(mainEl, drillEl)` — generic drill-down subpages. | 1 |
| `static/style-section-font-family.js` | Font Family row + font list subpage. | 2 |
| `static/style-section-font-weight.js` | Weight row + weight list subpage. | 2 |
| `static/style-section-size.js` | SIZE field + the two stepper buttons. | 3 |
| `static/style-section-emphasis.js` | Italic + Underline + case group, one row. | 3 |
| `static/style-section-color.js` | Color row + color subpage. | 3 |
| `static/style-section-outline.js` | Outline row + outline subpage. | 4 |
| `static/style-section-shadow.js` | Shadow row + shadow subpage. | 4 |
| `static/style-section-highlight.js` | Highlight row + highlight subpage. | 4 |
| `static/style-section-box.js` | Size mode + WIDTH/HEIGHT + background + border. | 5 |
| `static/style-section-align.js` | TEXT ALIGN group. | 5 |
| `static/style-section-position.js` | HORIZONTAL/VERTICAL fields + anchor grid. | 5 |
| `static/style-section-preset-library.js` | Saved-style card grid + save form. | 6 |
| `static/style-tab-design.js` | `StyleTab.design` — composes the Design tab. | 2 |
| `static/style-tab-box.js` | `StyleTab.box` — composes the Box tab. | 5 |
| `static/style-tab-style.js` | `StyleTab.styleLibrary` — composes the Style tab. | 6 |
| `tests/js/*.test.js` | Node tests for the pure modules and targets. | 1 |

### Deleted

| File | Batch |
|---|---|
| `static/text-panel-font-family.js`, `static/caption-panel-font-family.js` | 2 |
| `static/text-panel-font-weight.js`, `static/caption-panel-font-weight.js` | 2 |
| `static/text-panel-font-style.js`, `static/caption-panel-font-style.js` | 3 |
| `static/text-panel-case.js`, `static/caption-panel-case.js` | 3 |
| `static/text-panel-outline.js`, `static/caption-panel-outline.js` | 4 |
| `static/text-panel-shadow.js`, `static/caption-panel-shadow.js` | 4 |
| `static/text-panel-highlight.js`, `static/caption-panel-highlight.js` | 4 |
| `static/text-panel-align.js`, `static/text-panel-position.js`, `static/caption-panel-box.js` | 5 |
| `static/text-panel-style.js`, `static/caption-panel-style.js` | 6 |

`renderBoxPanel()` is removed from `static/panel-text.js` in Batch 5.

### Unchanged

`static/text-panel-time.js`, `static/caption-panel-words.js`, `static/caption-panel-language.js`, `static/caption-panel-filler-words.js` — genuinely single-panel, no counterpart to share with.

---

## Interface contract

Every batch depends on these exact signatures. **Do not rename anything here.** A section written in Batch 4 must call the same `target.setField` that Batch 1 defined.

### `window.FontSizeScale` — `static/font-size-scale.js`

```js
FontSizeScale.FONT_SIZE_PRESETS               // [12,14,16,18,21,24,36,45,56,72,96]
FontSizeScale.stepFontSizePreset(currentSize, direction)  // direction: -1 | +1 -> number
```

### `window.FormatRunWrite` — `static/format-run-write.js`

```js
FormatRunWrite.upsertFormatRun(block, start, end, field, value)  // -> the run object
```

### `window.StyleFields` — `static/style-fields.js`

```js
StyleFields.STYLE_FIELD_NAMES     // string[] — the saved-style field list
StyleFields.styleFieldsOf(preset) // -> a new object holding only those fields
```

### `window.StyleTarget` — `static/style-target-text.js`, `static/style-target-caption.js`

Both factories return an object with **exactly** this shape:

```js
{
  kind,                          // "text" | "caption"
  supportsFormatRuns,            // true for text, false for caption
  getPreset(),                   // -> TextPreset (the live working preset)
  getFieldValue(field),          // -> the value a control should display:
                                 //    the active FormatRun's override if there is one,
                                 //    else the preset's value
  setField(field, value),        // selection-aware write + save + preview re-render
  setPresetField(field, value),  // ALWAYS whole-preset write + save + preview re-render
  previewField(field, value),    // transient preview only — no write, no save (hover)
  cancelPreview(),               // undo a previewField()
  clearFormatRuns(),             // text: block.formatting_runs = []; caption: no-op
  rerenderPreview(),
  rerenderPanel(),
  getBoxSize(),                  // -> {width, height} | null, in 1080x1920 canvas px
}
```

`setField` vs `setPresetField`: use `setField` for anything a `FormatRun` can override — `font`, `size_px`, `color`, `outline_color`, `outline_px`, `weight`, `italic`, `underline`, `highlight`, `highlight_color`. Use `setPresetField` for everything else — shadow, box, align, position, text case, highlight mode, highlight radius. Getting this wrong is silent: on the caption panel both behave identically, so **verify on the TEXT panel with a partial text selection active**.

Both factories accept an optional `deps` object so tests can inject collaborators. In the browser they are called with no argument and fall back to the existing globals.

`StyleTarget.forTextBlock(deps?)` defaults:

```js
{
  getBlock:        () => currentTextBlock(),
  getPreset:       (id) => ensureTextPreset(id),
  getSelection:    () => Preview.getActiveFormatSelection(),
  save:            () => saveProject(),
  rerenderPreview: () => renderTextPreview(),
  rerenderPanel:   () => renderTextPanel(),
  getBoxSize:      (id) => Preview.getTextBoxSize(id),
  renderPreviewWith: (presets) => Preview.renderText(project, presets, Preview.currentTimelineTime()),
  allPresets:      () => project.text_presets,
  upsert:          FormatRunWrite.upsertFormatRun,
}
```

`StyleTarget.forCaptionTrack(deps?)` defaults:

```js
{
  getPreset:       () => ensureCaptionPreset(ensureCaptionTrack().preset_id),
  getSelection:    () => null,
  save:            () => saveProject(),
  rerenderPreview: () => renderCaptionPreview(),
  rerenderPanel:   () => renderCaptionPanel(),
  getBoxSize:      () => Preview.getCaptionBoxSize(),
  renderPreviewWith: (presets) => Preview.renderCaptions(project, presets, Preview.currentTimelineTime()),
  allPresets:      () => project.text_presets,
}
```

### `window.StylePanelHost` — `static/style-panel-host.js`

```js
const host = StylePanelHost(mainEl, drillEl);
const page = host.page(title, buildBody);   // buildBody: (bodyEl) => void, called on each open()
page.open();                                 // hides mainEl, shows this subpage
page.close();                                // shows mainEl, hides every subpage
host.closeAll();                             // used when the panel is re-entered
```

The host builds each subpage's `UI.subPanelHeader` (back arrow + title) itself. `page.close()` fires the optional `onClose` passed as `host.page(title, buildBody, { onClose })`.

### `window.StyleSection.*` — every section file

```js
StyleSection.<name>(container, target, options) // -> { render() }
```

- Called **once** per panel at wiring time. It builds its markup into `container` and returns a handle.
- `render()` refreshes the section's displayed values from `target`. Panels call `render()` on every panel render; they never re-call the section factory.
- `options` is always an object, never `undefined`.

Section names and their options:

| Name | Options | Batch |
|---|---|---|
| `fontFamily` | `{ host }` | 2 |
| `fontWeight` | `{ host }` | 2 |
| `size` | `{}` | 3 |
| `emphasis` | `{}` | 3 |
| `color` | `{ host }` | 3 |
| `outline` | `{ host }` | 4 |
| `shadow` | `{ host }` | 4 |
| `highlight` | `{ host, modes }` | 4 |
| `box` | `{ sizeModes }` | 5 |
| `align` | `{}` | 5 |
| `position` | `{}` | 5 |
| `presetLibrary` | `{}` | 6 |

`render()` may be async (`fontWeight` is, because it awaits `Api.listFontWeights`). Callers must tolerate a promise being returned and ignore it, exactly as `panel-text.js` does today.

### `window.StyleTab.*` — the composers

```js
StyleTab.design(container, target, options)        // -> { render() }
StyleTab.box(container, target, options)           // -> { render() }
StyleTab.styleLibrary(container, target, options)  // -> { render() }
```

`StyleTab.design` renders, in this fixed order: `fontFamily`, `fontWeight`, `size`, `emphasis`, `color`, `outline`, `shadow`, `highlight`. This order is the resolved TEXT layout and is the single place it is defined.

`StyleTab.design` options: `{ host, highlightModes }`. `StyleTab.box` options: `{ sizeModes }`. `StyleTab.styleLibrary` options: `{}`.

---

## Script load order

`static/index.html` must load the new files in this order, after the `ui-*.js` block and before `panel-text.js` / `panel-captions.js`:

```html
<script src="/static/font-size-scale.js"></script>
<script src="/static/format-run-write.js"></script>
<script src="/static/style-fields.js"></script>
<script src="/static/style-target-text.js"></script>
<script src="/static/style-target-caption.js"></script>
<script src="/static/style-panel-host.js"></script>
<script src="/static/style-section-font-family.js"></script>
<script src="/static/style-section-font-weight.js"></script>
<script src="/static/style-section-size.js"></script>
<script src="/static/style-section-emphasis.js"></script>
<script src="/static/style-section-color.js"></script>
<script src="/static/style-section-outline.js"></script>
<script src="/static/style-section-shadow.js"></script>
<script src="/static/style-section-highlight.js"></script>
<script src="/static/style-section-box.js"></script>
<script src="/static/style-section-align.js"></script>
<script src="/static/style-section-position.js"></script>
<script src="/static/style-section-preset-library.js"></script>
<script src="/static/style-tab-design.js"></script>
<script src="/static/style-tab-box.js"></script>
<script src="/static/style-tab-style.js"></script>
```

Each batch adds only its own tags. The sections register into `window.StyleSection` at load and touch no DOM at load time — all DOM work happens inside the factory call, which the panels make. This removes the load-time `document.getElementById(...).addEventListener(...)` calls the old files did at IIFE time, which is why load order among the section files themselves does not matter.

---

## Verification procedure

Run at the end of every batch, before its final commit.

1. `node --test tests/js` — passes.
2. Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`
3. Open `http://127.0.0.1:8000`, create a **throwaway** project, import any clip.
4. Add a text block. Open the TEXT panel, Design tab. Exercise every control the batch touched; confirm the stage updates.
5. Run auto-caption or add caption words. Open the CAPTIONS panel, Design tab. Exercise the same controls.
6. **TEXT only:** select part of the heading text on the stage, then change size / color / weight / outline. Confirm only the selection changes — this is the `FormatRun` path that the caption panel cannot exercise.
7. Reload the page. Confirm every change persisted.
8. Screenshot both panels; compare against the previous batch's screenshots for unintended layout shifts.

---

## Self-review notes

Two things an implementer will get wrong if not warned:

1. **`setField` vs `setPresetField`.** They are indistinguishable on the CAPTIONS panel. Always verify on TEXT with an active selection.
2. **Sections are built once, rendered many times.** The old files interleaved building and updating on every render (`if (rowSetValue) { rowSetValue(...) } else { rowSetValue = UI.settingsRow(...) }`). The new split is explicit: build in the factory, update in `render()`. Do not call `UI.settingsRow` from inside `render()`.
