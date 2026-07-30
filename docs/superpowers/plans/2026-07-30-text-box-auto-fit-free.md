# Text box auto FIT→FREE, drop FILL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the TEXT panel's explicit FIT/FREE/FILL box-size toggle; a text block auto-sizes to its content (with the existing empty-state placeholder) until the user finishes editing it with text present, at which point it permanently freezes to a manually-resizable fixed size. FILL mode (auto-shrinking font) is dropped entirely.

**Architecture:** Extend the existing FIT→FIXED auto-switch that already fires on a resize-handle drag (`handleBoxResizeEnd` in `panel-text.js`) to also fire on blur-with-content. Remove the SIZE button group from the shared Box-tab section. Delete the FILL-only code paths (auto font-refit in `preview-text.js`, the disabled-SIZE-field check in `style-section-size.js`, and the now-unused `fitFontSize`/`wrapText` in `font-fit.js`).

**Tech Stack:** Vanilla JS, no build step, no bundler, no framework (per project convention — see CLAUDE.md Conventions). No backend changes.

## Global Constraints

- No JS build step/bundler; every file loaded as a plain `<script>` tag from `static/index.html`.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — styling lives in `static/css/**`.
- Reusable JS logic stays one function/concern per file (existing files here already follow this — no new files needed for this plan).
- No automated test coverage for these files: they are DOM-dependent (contentEditable, canvas measurement, live layout reads) and outside `tests/js`'s "pure JS modules only — no DOM" scope, matching the spec's stated decision. Each task is verified manually against the running dev server instead.
- Dev server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, then open `http://127.0.0.1:8000`. Verify on a throwaway project, never real project data (an unload handler flushes in-memory edits to disk).

---

### Task 1: Auto-freeze FIT→FIXED on blur when text is present

**Files:**
- Modify: `static/panel-text.js:174-190` (the `Preview.setSelectedTextBlock` call inside `renderTextPanel`, specifically its `onEditEnd` callback at line 185)
- Modify: `static/panel-text.js:222-235` (`handleBoxResizeEnd`)

**Interfaces:**
- Consumes: `Preview.getTextBoxSize(blockId) -> {width, height} | null` (already exists, `static/preview.js:344`, canvas px on the 1080×1920 basis, returns `null` if the block's div isn't currently in `#overlay` or the stage has zero size).
- Consumes: `preset.box_width_mode` / `preset.box_height_mode` (string, `"fit"` | `"fixed"` after this plan — `"fill"` is removed in Task 3), `preset.box_width` / `preset.box_height` (int, canvas px), `block.heading` (string).
- Produces: no new exported names. Behavior change only — `renderTextPanel`'s `onEditEnd` now mutates `preset.box_width_mode`/`box_height_mode`/`box_width`/`box_height` before saving, and `renderBoxTab` (existing function, same file) is called when it does so the Box tab's fields reflect the frozen size immediately.

- [ ] **Step 1: Add the freeze check to `onEditEnd`**

In `static/panel-text.js`, inside `renderTextPanel`, locate the `Preview.setSelectedTextBlock(block.id, { ... })` call (around line 174) and replace its `onEditEnd` callback:

```javascript
    onEditEnd: async () => {
      // Typing into a block that's still auto-sizing to its content (`fit`) freezes it to a
      // manually-resizable fixed size the moment editing ends with text present — mirrors the
      // existing precedent in handleBoxResizeEnd, which does the same thing on a resize drag.
      // One-way: once frozen, later clearing the text back to empty does not revert this.
      if (preset.box_width_mode === "fit" && (block.heading || "").trim()) {
        const size = Preview.getTextBoxSize(block.id);
        if (size) {
          preset.box_width = Math.round(size.width);
          preset.box_height = Math.round(size.height);
          preset.box_width_mode = "fixed";
          preset.box_height_mode = "fixed";
          renderBoxTab();
        }
      }
      renderTextPreview();
      await saveProject();
    },
```

This replaces the existing single-line `onEditEnd: async () => { renderTextPreview(); await saveProject(); },`.

- [ ] **Step 2: Simplify `handleBoxResizeEnd`**

In the same file, replace `handleBoxResizeEnd` (around line 222):

```javascript
async function handleBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  preset.box_width_mode = "fixed";
  preset.box_height_mode = "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  renderTextPreview();
  await saveProject();
  renderBoxTab();
}
```

This removes the `wasFill` branch (`box_width_mode === "fill"` no longer exists as an option a user can pick — Task 2/3 remove it — so a drag always locks to `"fixed"`).

- [ ] **Step 3: Manual verification**

Start the dev server and open a throwaway project:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

In the browser:
1. Add a new text block (left rail TEXT entry, or the timeline's `+`). Confirm it shows the "Add your text here" placeholder and the Box tab's WIDTH/HEIGHT fields are hidden (still in `"fit"`).
2. Click the block, type a short line of text, then click elsewhere on the stage to blur it.
3. Open the TEXT panel's Box tab. Confirm WIDTH/HEIGHT now show non-zero values close to the text's actual rendered size, and the block now shows resize handles when selected.
4. Drag a handle to resize it. Confirm it resizes normally (unchanged from today's FREE behavior).
5. Click into the block again, delete all its text back to empty, and blur. Confirm the box stays at its fixed size (does not revert to auto-fit or re-show the placeholder's auto-hugging behavior) — the placeholder text itself may still show since `heading` is empty, but WIDTH/HEIGHT stay populated in the Box tab.

- [ ] **Step 4: Commit**

```bash
git add static/panel-text.js
git commit -m "feat: auto-freeze text box from fit to fixed size on blur"
```

---

### Task 2: Remove the FIT/FREE/FILL SIZE toggle from the Box tab

**Files:**
- Modify: `static/style-section-box.js`

**Interfaces:**
- Consumes: `target.getPreset()` (existing `StyleTarget` interface), `options.sizeModes` (boolean, unchanged meaning: `true` for TEXT hides WIDTH/HEIGHT while `box_width_mode === "fit"`; `false` for CAPTIONS always shows them).
- Produces: `window.StyleSection.box(container, target, options) -> {render}` — same signature as before. No caller (`style-tab-box.js`, `panel-text.js`, `panel-captions.js`) needs to change.

- [ ] **Step 1: Remove the button-group markup and wiring**

In `static/style-section-box.js`, delete the SIZE label + button group block. Replace lines 43-77 (the `sizeModeEl`/`groupLabel("SIZE")`/`setSizeMode` block) so the file becomes:

```javascript
  const preset0 = target.getPreset();

  // ---- markup, built once -------------------------------------------------------------
  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  styleGroup(styleRow([widthEl, heightEl]));

  // ---- controls, built once; render() drives the setters they return --------------------
  const setWidth = UI.numberField(widthEl,
    { label: "WIDTH", unit: "PX", value: preset0.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => target.setPresetField("box_width", v) });

  const setHeight = UI.numberField(heightEl,
    { label: "HEIGHT", unit: "PX", value: preset0.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => target.setPresetField("box_height", v) });

  function render() {
    const preset = target.getPreset();
    // WIDTH/HEIGHT serve FREE (manual fixed size) — only FIT sizes the box to its content and
    // has no use for them. A block auto-freezes from FIT to FIXED once it has content (see
    // panel-text.js's onEditEnd/handleBoxResizeEnd), so this is never user-toggled; with
    // sizeModes off (CAPTIONS) there is no FIT to be in, so they always show.
    const sizeFieldsHidden = sizeModes && preset.box_width_mode === "fit";
    widthEl.hidden = sizeFieldsHidden;
    heightEl.hidden = sizeFieldsHidden;
    setWidth(preset.box_width);
    setHeight(preset.box_height);
  }

  render();
  return { render };
};
```

The `groupLabel`/`styleGroup`/`styleRow` helper functions (lines 21-38) and the `sizeModes` variable declaration (line 17) stay unchanged — `styleGroup`/`styleRow` are still used for the WIDTH/HEIGHT row, and `sizeModes` is still read in `render()`. Only `groupLabel` becomes unused by this file if nothing else in it calls it — check before deleting the helper itself; if `groupLabel` has no remaining caller in this file, delete that helper function too (it's a private local function, not exported).

- [ ] **Step 2: Update the file's own header comment**

Update the top-of-file comment (lines 1-14) to remove the sentence describing the SIZE mode group, since it no longer exists:

```javascript
// Shared Box-tab section: WIDTH/HEIGHT for a text block or caption box — one file serving both
// the TEXT and CAPTIONS panels. Sizing mode (fit vs. fixed) is driven automatically elsewhere
// (panel-text.js auto-freezes a TEXT block from fit to fixed once it has content), not by a
// user-facing toggle here. Background and border are NOT built here: they already have their
// own settings-row + drill-down UI (text-panel-background.js/text-panel-border.js and the
// CAPTIONS equivalents), rendered as siblings of this section inside the same Box tab body —
// this section must not duplicate or replace that UI. Builds its own markup once in the
// factory; render() only pushes current values back through the setters the UI.* primitives
// returned. Every write here is whole-preset (setPresetField): no box field is FormatRun-capable.
window.StyleSection = window.StyleSection || {};

// options.sizeModes
//   true  -> TEXT: hides WIDTH/HEIGHT while the block is still auto-sizing to its content
//            (box_width_mode === "fit").
//   false -> CAPTIONS: WIDTH/HEIGHT are unconditionally visible — a caption box is always a
//            fixed size. This is an option, never a check on target.kind — a section must not
//            know which panel it is in.
```

- [ ] **Step 3: Manual verification**

With the dev server still running, open the TEXT panel's Box tab for both an empty block and one with content. Confirm no SIZE FIT/FREE/FILL button group renders in either case — only WIDTH/HEIGHT (hidden for the empty/fit block, visible for the one with content). Open the CAPTIONS panel's Box tab and confirm it is unaffected (WIDTH/HEIGHT still always visible, no SIZE group — it never had one).

- [ ] **Step 4: Commit**

```bash
git add static/style-section-box.js
git commit -m "feat: remove FIT/FREE/FILL size toggle from text box panel"
```

---

### Task 3: Delete FILL-only dead code

**Files:**
- Modify: `static/preview-text.js`
- Modify: `static/style-section-size.js`
- Modify: `static/font-fit.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `window.FontFit` now exposes only `{canvasMeasurer}` (was `{wrapText, canvasMeasurer, fitFontSize}`). `static/preview-captions.js` is the only remaining consumer of `FontFit.canvasMeasurer` and needs no change — it already calls only that function.

- [ ] **Step 1: Remove `maybeRefitFillText` and its cache from `preview-text.js`**

In `static/preview-text.js`, delete the `fitCache` declaration (line 23: `const fitCache = new Map(); // blockId -> { key: string, size: number }`), the `fitCacheKey` function (lines 33-35), and the `maybeRefitFillText` function (lines 37-50):

```javascript
  function fitCacheKey(preset, heading) {
    return JSON.stringify([heading, preset.box_width, preset.box_height, preset.font, preset.weight, preset.italic, preset.text_case]);
  }

  function maybeRefitFillText(block, preset) {
    if (preset.box_width_mode !== "fill") return;
    const key = fitCacheKey(preset, block.heading || "");
    const cached = fitCache.get(block.id);
    if (cached && cached.key === key) {
      preset.size_px = cached.size;
      return;
    }
    const measurerFactory = (size) =>
      FontFit.canvasMeasurer(preset.font, size, { weight: preset.weight, italic: preset.italic });
    const { size } = FontFit.fitFontSize(TextCase.apply(block.heading || "", preset.text_case), measurerFactory, preset.box_width, preset.box_height);
    preset.size_px = size;
    fitCache.set(block.id, { key, size });
  }
```

Then remove the call site at line 106 (`maybeRefitFillText(block, preset);`) inside `renderText`'s per-block loop.

- [ ] **Step 2: Drop the `"fill"` branch from `widthIsBoxed`/`heightIsBoxed`**

Still in `static/preview-text.js`, around line 129-130, change:

```javascript
      const widthIsBoxed = preset.box_width_mode === "fixed" || preset.box_width_mode === "fill";
      const heightIsBoxed = preset.box_height_mode === "fixed" || preset.box_height_mode === "fill";
```

to:

```javascript
      const widthIsBoxed = preset.box_width_mode === "fixed";
      const heightIsBoxed = preset.box_height_mode === "fixed";
```

- [ ] **Step 3: Update `preview-text.js`'s file header**

The header comment (line 2) currently says `composites one .text-block div per visible text block into #overlay (rich-text runs, box background/border, BOX FILL auto-sizing)`. Remove the "BOX FILL auto-sizing" clause since that code is gone:

```javascript
// Stage text-block overlay rendering + selection state: composites one .text-block div per
// visible text block into #overlay (rich-text runs, box background/border), and owns
```

- [ ] **Step 4: Remove the FILL-disabled check from `style-section-size.js`**

In `static/style-section-size.js`, replace the `render()` method (lines 56-67):

```javascript
    return {
      render() {
        setFieldValue(target.getFieldValue("size_px"));
      },
    };
```

This drops the `disabled`/`setDisabled`/`stepDown.disabled`/`stepUp.disabled` lines entirely — the SIZE field is never auto-disabled now that FILL doesn't exist.

- [ ] **Step 5: Trim `font-fit.js` to just `canvasMeasurer`**

Replace the full contents of `static/font-fit.js`:

```javascript
// Shared canvas-based text measurer, used by caption pagination (preview-captions.js via
// app/caption_layout.py's paginate_words) to measure rendered glyph widths without a DOM
// text node. Mirrors app/font_metrics.py's pil_font_measurer.
// Exposes window.FontFit.{canvasMeasurer}.
window.FontFit = (() => {
  let sharedCanvas = null;
  function canvasMeasurer(fontFamily, sizePx, { weight = 400, italic = false } = {}) {
    if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
    const ctx = sharedCanvas.getContext("2d");
    const style = italic ? "italic " : "";
    ctx.font = `${style}${weight} ${sizePx}px "${fontFamily}"`;
    return (text) => ctx.measureText(text).width;
  }

  return { canvasMeasurer };
})();
```

- [ ] **Step 6: Confirm no remaining references**

```bash
grep -rn "fitFontSize\|wrapText\|maybeRefitFillText\|box_width_mode === \"fill\"\|box_height_mode === \"fill\"" static/
```

Expected: no matches (the `app/font_metrics.py`/`app/box_mask.py` Python files have their own unrelated `wrap_text`/`wrap_text_runs` functions — this grep is scoped to `static/` only, so it won't touch those).

- [ ] **Step 7: Manual verification**

With the dev server running:
1. Open the CAPTIONS panel and confirm caption pagination/word-wrap still renders correctly (this exercises `FontFit.canvasMeasurer`, the one surviving export).
2. Open a TEXT block, confirm the SIZE (PX) field is always editable/steppable (never grayed out) regardless of the block's state.
3. Open the browser console, confirm no errors on load or on any of the interactions from Task 1/2's verification steps.
4. Run the frontend test suite to confirm nothing else broke:

```bash
node --test "tests/js/**/*.test.js"
```

Expected: all tests pass (none of them cover `font-fit.js`/`preview-text.js`/`style-section-size.js`, so this is a regression check on the rest of the suite, not new coverage).

- [ ] **Step 8: Commit**

```bash
git add static/preview-text.js static/style-section-size.js static/font-fit.js
git commit -m "refactor: remove FILL mode dead code (auto font-refit, disabled-size-field)"
```

---

### Task 4: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (project root, the "Codebase map" section's file-structure entries for the files touched above)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `preview-text.js`'s entry**

In `CLAUDE.md`'s file structure tree, find the `preview-text.js` entry (long paragraph starting `# window.PreviewText: stage text-block overlay rendering...`). Remove references to `fitCache`/BOX FILL auto-sizing from its description, replacing them with a short note that box sizing auto-freezes from fit to fixed on first edit (see `panel-text.js`'s entry, updated below) rather than being a user-facing FILL mode.

- [ ] **Step 2: Update `panel-text.js`'s entry**

Add a short clause to `panel-text.js`'s entry describing the new auto-freeze behavior in `onEditEnd`/`handleBoxResizeEnd`, replacing any existing description of FILL-preserving logic in `handleBoxResizeEnd`.

- [ ] **Step 3: Update `style-section-box.js`'s entry**

Update its one-line description to say it renders WIDTH/HEIGHT only (no SIZE mode toggle), sizing mode being driven automatically rather than picked by the user.

- [ ] **Step 4: Update `font-fit.js`'s entry**

Update its description from "BOX FILL auto font sizing (consumed by preview.js)" to "shared canvas text measurer (consumed by caption pagination in preview-captions.js)".

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for text-box auto FIT/FREE change"
```
