# Settings-row "None" state + Background/Border/Highlight subpages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every optional style row in the TEXT and CAPTIONS panels read `None` when its effect is off, and move Background, Border and the CAPTIONS Highlight group behind the existing settings-row + drill-down subpage pattern.

**Architecture:** Frontend only. One new three-line pure helper (`SettingsRowValue.orNone`) owns the `"None"` string. Four new panel files (`text-panel-background.js`, `text-panel-border.js`, `caption-panel-background.js`, `caption-panel-border.js`) each copy the shape of the existing `static/text-panel-shadow.js`: a module-scoped `rowSetValue`, an `openXPanel`/`closeXPanel` pair that toggles the panel's `-main` div against a new subpanel div, a `UI.subPanelHeader`, and one exported render function. `caption-panel-highlight.js` is converted in place to the same shape. The orchestrators (`panel-text.js`'s `renderBoxPanel`, `caption-panel-box.js`'s `renderBox`) hand their background/border wiring to the new files.

**Tech Stack:** Plain browser JS, no build step, no bundler. Classic `<script>` tags in `static/index.html`. `window.UI.*` presentational helpers. Python/FastAPI backend is untouched.

## Global Constraints

- **No Python changes.** No Pydantic model field, no route, no export-path change. Every field written already exists on `TextPreset` in `app/models.py`.
- **Every `static/*.js` file opens with a one- or two-line comment** stating that file's purpose/role. New files must have one; edited files whose role changes must have theirs updated.
- **No inline `style="..."` attributes** in `static/index.html` or JS-rendered markup.
- **One function/feature per file.** Do not group the new panel files into a shared catch-all.
- **The `"None"` literal appears in exactly one place:** `static/settings-row-value.js`. Every other file calls `SettingsRowValue.orNone(...)`.
- **Border "off" is `box_border_width === 0`.** There is no `box_border` boolean and none may be added.
- **Turning Border on** sets `box_border_width = 2` only when it is currently `0`; an existing non-zero width is left alone.
- **Do not extend either orchestrator's "reset to main view" subpanel list.** `renderTextPanel()` resets only `#panel-text-font` / `#panel-text-weight`; `renderCaptionPanel()` only font, weight and language. New subpanels follow the Outline/Shadow/Highlight precedent and are not added.
- **Test suite:** `.venv/Scripts/python -m pytest -q` must stay green. It exercises none of this code — it is a regression guard only.
- **Verification is live in the browser against a throwaway project**, never real project data (the app's unload keepalive-save writes in-memory state to disk).
- **Commit after every task.** End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

**Created:**
- `static/settings-row-value.js` — `window.SettingsRowValue.orNone(isOn, text)`, the single definition of the `"None"` row value.
- `static/text-panel-background.js` — `TextPanel.renderBackground()`: the TEXT Box tab's Background row + `#panel-text-background` subpanel.
- `static/text-panel-border.js` — `TextPanel.renderBorder()`: the TEXT Box tab's Border row + `#panel-text-border` subpanel.
- `static/caption-panel-background.js` — `CaptionPanel.renderBackground()`: the CAPTIONS Box tab's Background row + `#panel-captions-background` subpanel.
- `static/caption-panel-border.js` — `CaptionPanel.renderBorder()`: the CAPTIONS Box tab's Border row + `#panel-captions-border` subpanel.

**Modified:**
- `static/index.html` — Box-tab markup swaps in both panels, the CAPTIONS Design tab's Highlight row, five new subpanel divs, five new `<script>` tags.
- `static/text-panel-outline.js` — row value gains the `None` state.
- `static/text-panel-shadow.js` — row value gains the `None` state, shows blur px when on.
- `static/text-panel-highlight.js` — row value gains the `None` state, shows the colour hex when on.
- `static/caption-panel-outline.js` — same as its TEXT twin.
- `static/caption-panel-shadow.js` — same as its TEXT twin.
- `static/caption-panel-highlight.js` — converted from an inline group to row + `#panel-captions-highlight` subpanel.
- `static/panel-text.js` — `renderBoxPanel()` drops background/border wiring, calls the two new renders; drops the `text-box-background-border-divider` `UI.divider` call.
- `static/caption-panel-box.js` — `renderBox()` drops background/border wiring.
- `static/panel-captions.js` — calls the two new renders; `captionTabPanes.design` drops `#caption-highlight-body`; drops the `caption-box-background-border-divider` `UI.divider` call.
- `CLAUDE.md` — codebase map + inventory, updated in the same commit as the change it describes.

---

### Task 1: The `SettingsRowValue.orNone` helper

Creates the single definition of the `"None"` row value, plus loads it early enough for every consumer.

**Files:**
- Create: `static/settings-row-value.js`
- Modify: `static/index.html` (script tag, near line 837)

**Interfaces:**
- Consumes: nothing.
- Produces: `window.SettingsRowValue.orNone(isOn: boolean, text: string) -> string` — returns `text` when `isOn` is truthy, the string `"None"` otherwise. Every later task calls this.

- [ ] **Step 1: Create the helper file**

Create `static/settings-row-value.js`:

```js
// Shared value formatter for UI.settingsRow rows whose effect can be switched off
// (Outline, Shadow, Highlight, Background, Border). Single definition of the "None" label.
window.SettingsRowValue = {
  orNone(isOn, text) { return isOn ? text : "None"; },
};
```

- [ ] **Step 2: Load it in index.html**

In `static/index.html`, find this line (near line 837):

```html
<script src="/static/ui-settings-row.js"></script>
```

Add the new script tag immediately after it:

```html
<script src="/static/ui-settings-row.js"></script>
<script src="/static/settings-row-value.js"></script>
```

`settings-row-value.js` must load before any `text-panel-*.js` / `caption-panel-*.js` file (those start near line 871), which this ordering satisfies.

- [ ] **Step 3: Verify it loads**

Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000, open the browser console, and run:

```js
SettingsRowValue.orNone(true, "2px")
SettingsRowValue.orNone(false, "2px")
```

Expected: `"2px"` then `"None"`. No console errors on page load.

- [ ] **Step 4: Commit**

```bash
git add static/settings-row-value.js static/index.html
git commit -m "feat: add SettingsRowValue.orNone shared settings-row value formatter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `None` state on the existing TEXT rows

Outline, Shadow and Highlight in the TEXT panel currently read `0px` / `OFF` when off. Each gets the `None` state and a more informative on-state value.

**Files:**
- Modify: `static/text-panel-outline.js:40-47`
- Modify: `static/text-panel-shadow.js:25-32`
- Modify: `static/text-panel-highlight.js:25-32`

**Interfaces:**
- Consumes: `SettingsRowValue.orNone(isOn, text)` from Task 1.
- Produces: nothing new. `TextPanel.renderOutline()`, `TextPanel.renderShadow()` and `TextPanel.renderHighlight()` keep their existing names and signatures (no arguments, no return value).

- [ ] **Step 1: Update the Outline row**

In `static/text-panel-outline.js`, replace this block:

```js
    if (outlineRowSetValue) {
      outlineRowSetValue(`${preset.outline_px}px`, null, preset.outline_color);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("text-outline-row"), {
        label: "Outline", value: `${preset.outline_px}px`, swatchColor: preset.outline_color,
        onClick: openOutlinePanel,
      });
    }
```

with:

```js
    const outlineOn = preset.outline_px > 0;
    const outlineValue = SettingsRowValue.orNone(outlineOn, `${preset.outline_px}px`);
    const outlineSwatch = outlineOn ? preset.outline_color : null;

    if (outlineRowSetValue) {
      outlineRowSetValue(outlineValue, null, outlineSwatch);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("text-outline-row"), {
        label: "Outline", value: outlineValue, swatchColor: outlineSwatch,
        onClick: openOutlinePanel,
      });
    }
```

- [ ] **Step 2: Update the Shadow row**

In `static/text-panel-shadow.js`, replace this block:

```js
    if (shadowRowSetValue) {
      shadowRowSetValue(preset.shadow ? "ON" : "OFF", null, preset.shadow ? preset.shadow_color : null);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("text-shadow-row"), {
        label: "Shadow", value: preset.shadow ? "ON" : "OFF", swatchColor: preset.shadow ? preset.shadow_color : null,
        onClick: openShadowPanel,
      });
    }
```

with:

```js
    const shadowValue = SettingsRowValue.orNone(preset.shadow, `${preset.shadow_blur}px`);
    const shadowSwatch = preset.shadow ? preset.shadow_color : null;

    if (shadowRowSetValue) {
      shadowRowSetValue(shadowValue, null, shadowSwatch);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("text-shadow-row"), {
        label: "Shadow", value: shadowValue, swatchColor: shadowSwatch,
        onClick: openShadowPanel,
      });
    }
```

The `OFF`/`ON` labels on the `#text-shadow-toggle-group` button group inside the subpanel are unchanged — a two-state toggle reads correctly as OFF/ON. Only the row value changes.

- [ ] **Step 3: Update the Highlight row**

In `static/text-panel-highlight.js`, replace this block:

```js
    if (highlightRowSetValue) {
      highlightRowSetValue(preset.highlight ? "ON" : "OFF", null, preset.highlight ? preset.highlight_color : null);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("text-highlight-row"), {
        label: "Highlight", value: preset.highlight ? "ON" : "OFF", swatchColor: preset.highlight ? preset.highlight_color : null,
        onClick: openHighlightPanel,
      });
    }
```

with:

```js
    const highlightValue = SettingsRowValue.orNone(preset.highlight, preset.highlight_color);
    const highlightSwatch = preset.highlight ? preset.highlight_color : null;

    if (highlightRowSetValue) {
      highlightRowSetValue(highlightValue, null, highlightSwatch);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("text-highlight-row"), {
        label: "Highlight", value: highlightValue, swatchColor: highlightSwatch,
        onClick: openHighlightPanel,
      });
    }
```

- [ ] **Step 4: Verify in the browser**

With the server running, open http://127.0.0.1:8000 and open a **throwaway** project (create a new one from the picker — never use real project data).

1. Add a text block, open the TEXT panel, select the Design tab.
2. Set Outline width to `0` in its subpage → the Outline row reads `None` with no colour square. Set it to `4` → the row reads `4px` with a colour square.
3. Open Shadow, toggle OFF → the Shadow row reads `None`, no square. Toggle ON, set BLUR to `6` → the row reads `6px` with a square.
4. Open Highlight, toggle OFF → row reads `None`. Toggle ON → row reads the colour hex (e.g. `#FFD400`) with a matching square.

- [ ] **Step 5: Commit**

```bash
git add static/text-panel-outline.js static/text-panel-shadow.js static/text-panel-highlight.js
git commit -m "feat: TEXT Outline/Shadow/Highlight rows read None when off

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `None` state on the existing CAPTIONS rows

The CAPTIONS panel's Outline and Shadow rows get the same treatment. (CAPTIONS has no Highlight row yet — that arrives in Task 7.)

**Files:**
- Modify: `static/caption-panel-outline.js:24-31`
- Modify: `static/caption-panel-shadow.js:24-31`

**Interfaces:**
- Consumes: `SettingsRowValue.orNone(isOn, text)` from Task 1.
- Produces: nothing new. `CaptionPanel.renderOutline()` and `CaptionPanel.renderShadow()` keep their existing names and signatures.

- [ ] **Step 1: Update the CAPTIONS Outline row**

In `static/caption-panel-outline.js`, replace this block:

```js
    if (outlineRowSetValue) {
      outlineRowSetValue(`${preset.outline_px}px`, null, preset.outline_color);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("caption-outline-row"), {
        label: "Outline", value: `${preset.outline_px}px`, swatchColor: preset.outline_color,
        onClick: openOutlinePanel,
      });
    }
```

with:

```js
    const outlineOn = preset.outline_px > 0;
    const outlineValue = SettingsRowValue.orNone(outlineOn, `${preset.outline_px}px`);
    const outlineSwatch = outlineOn ? preset.outline_color : null;

    if (outlineRowSetValue) {
      outlineRowSetValue(outlineValue, null, outlineSwatch);
    } else {
      outlineRowSetValue = UI.settingsRow(document.getElementById("caption-outline-row"), {
        label: "Outline", value: outlineValue, swatchColor: outlineSwatch,
        onClick: openOutlinePanel,
      });
    }
```

- [ ] **Step 2: Update the CAPTIONS Shadow row**

In `static/caption-panel-shadow.js`, replace this block:

```js
    if (shadowRowSetValue) {
      shadowRowSetValue(preset.shadow ? "ON" : "OFF", null, preset.shadow ? preset.shadow_color : null);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("caption-shadow-row"), {
        label: "Shadow", value: preset.shadow ? "ON" : "OFF", swatchColor: preset.shadow ? preset.shadow_color : null,
        onClick: openShadowPanel,
      });
    }
```

with:

```js
    const shadowValue = SettingsRowValue.orNone(preset.shadow, `${preset.shadow_blur}px`);
    const shadowSwatch = preset.shadow ? preset.shadow_color : null;

    if (shadowRowSetValue) {
      shadowRowSetValue(shadowValue, null, shadowSwatch);
    } else {
      shadowRowSetValue = UI.settingsRow(document.getElementById("caption-shadow-row"), {
        label: "Shadow", value: shadowValue, swatchColor: shadowSwatch,
        onClick: openShadowPanel,
      });
    }
```

- [ ] **Step 3: Verify in the browser**

In the same throwaway project, open the CAPTIONS panel (left icon rail → CAPTIONS) and select the Design tab.

1. Open Outline, set width to `0` → the Outline row reads `None`, no square. Set it to `4` → reads `4px` with a square.
2. Open Shadow, toggle OFF → row reads `None`. Toggle ON, BLUR `6` → row reads `6px` with a square.

- [ ] **Step 4: Commit**

```bash
git add static/caption-panel-outline.js static/caption-panel-shadow.js
git commit -m "feat: CAPTIONS Outline/Shadow rows read None when off

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: TEXT Background row + subpage

Moves the TEXT Box tab's background colour + opacity fields behind a `Background` settings row.

**Files:**
- Create: `static/text-panel-background.js`
- Modify: `static/index.html` (Box-tab markup near line 706-711; new subpanel div after `#panel-text-highlight`; new script tag near line 895)
- Modify: `static/panel-text.js:222-228` (drop background wiring from `renderBoxPanel`), `static/panel-text.js:167-175` (call the new render)

**Interfaces:**
- Consumes: `SettingsRowValue.orNone(isOn, text)` from Task 1; the globals `currentTextBlock()`, `ensureTextPreset(id)`, `saveProject()`, `renderTextPreview()` from `panel-text.js` / `editor.js`.
- Produces: `window.TextPanel.renderBackground()` — no arguments, no return value. Called by `panel-text.js`'s `renderBoxPanel()`.

- [ ] **Step 1: Create the panel file**

Create `static/text-panel-background.js`:

```js
// TEXT panel Box tab: Background row + drill-down subpanel (on/off toggle + color + opacity),
// same row+subpanel pattern as text-panel-shadow.js. Whole-block preset only — no per-range
// FormatRun override. Exposes window.TextPanel.renderBackground().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function openBackgroundPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-background").hidden = false;
  }

  function closeBackgroundPanel() {
    document.getElementById("panel-text-background").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-background-subpanel-header"), { title: "Background", onBack: closeBackgroundPanel });

  window.TextPanel.renderBackground = function renderBackground() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("text-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: openBackgroundPanel,
      });
    }

    const fieldsHidden = !preset.box_background;
    document.getElementById("text-box-background-color-field").hidden = fieldsHidden;
    document.getElementById("text-box-background-opacity-field").hidden = fieldsHidden;

    UI.buttonGroup(document.getElementById("text-box-background-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderTextPreview();
        renderBackground();
      });

    UI.colorSwatch(document.getElementById("text-box-background-color-field"),
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderTextPreview(); renderBackground(); } });

    UI.numberField(document.getElementById("text-box-background-opacity-field"),
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); renderBackground(); } });
  };
})();
```

Note the deliberate difference from the old inline swatch: the old `onChange` also forced `preset.box_background = true` as a side effect of picking a colour. That is no longer needed — the toggle owns the boolean — so it is dropped.

- [ ] **Step 2: Replace the Box-tab markup**

In `static/index.html`, find this block inside `#text-box-body` (near line 706):

```html
          <div class="style-group">
            <div class="style-row">
              <div id="text-box-background-color-field"></div>
              <label id="text-box-background-opacity-field"></label>
            </div>
          </div>
```

Replace it with:

```html
          <div class="style-group">
            <div id="text-box-background-row" class="col-8"></div>
          </div>
```

The `#text-box-background-color-field` and `#text-box-background-opacity-field` ids are not deleted — they move into the subpanel in the next step.

- [ ] **Step 3: Add the subpanel div**

In `static/index.html`, find the end of the `#panel-text-highlight` div (it starts near line 815) and add a new sibling immediately after its closing `</div>`:

```html
        <div id="panel-text-background" hidden>
          <div id="text-background-subpanel-header"></div>
          <div class="style-group">
            <div id="text-box-background-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="text-box-background-color-field"></label>
          </div>
          <div class="style-group">
            <label id="text-box-background-opacity-field"></label>
          </div>
        </div>
```

- [ ] **Step 4: Add the script tag**

In `static/index.html`, find this line (near line 895):

```html
<script src="/static/text-panel-highlight.js"></script>
```

Add after it:

```html
<script src="/static/text-panel-background.js"></script>
```

- [ ] **Step 5: Rewire `panel-text.js`**

In `static/panel-text.js`, inside `renderBoxPanel()`, delete this block:

```js
  UI.colorSwatch(document.getElementById("text-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color, span: 1,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); } });
```

and in its place call the new render (keep it above the border wiring that is still there):

```js
  TextPanel.renderBackground();
```

`renderBoxPanel()` opens with `const preset = ensureTextPreset(currentTextBlock().preset_id);` — that line stays, the remaining fields still use it.

- [ ] **Step 6: Verify in the browser**

Reload http://127.0.0.1:8000 in the throwaway project. Select a text block, open the TEXT panel, Box tab.

1. The Background row is present and reads `None` with no colour square (a new block's `box_background` is false).
2. Click it → the Background subpage opens with an OFF/ON toggle and no other fields.
3. Toggle ON → colour + OPACITY appear; the text block on the stage gains a background.
4. Set OPACITY to `60`, press Back → the row reads `60%` with a colour square.
5. Change the colour → the square and the stage both follow.
6. Toggle OFF → fields hide, the stage background disappears; Back → row reads `None`.
7. Reload the page → the state persisted.
8. Browser console shows no errors.

- [ ] **Step 7: Commit**

```bash
git add static/text-panel-background.js static/index.html static/panel-text.js
git commit -m "feat: TEXT Background moves to a settings row + subpage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: TEXT Border row + subpage

Moves the TEXT Box tab's border width / radius / colour fields behind a `Border` settings row. `box_border_width === 0` is "no border".

**Files:**
- Create: `static/text-panel-border.js`
- Modify: `static/index.html` (Box-tab markup near line 713-722; new subpanel div after `#panel-text-background`; new script tag)
- Modify: `static/panel-text.js` (drop border wiring from `renderBoxPanel`, drop the background/border divider)

**Interfaces:**
- Consumes: `SettingsRowValue.orNone(isOn, text)` from Task 1; the globals `currentTextBlock()`, `ensureTextPreset(id)`, `saveProject()`, `renderTextPreview()`.
- Produces: `window.TextPanel.renderBorder()` — no arguments, no return value. Called by `panel-text.js`'s `renderBoxPanel()`.

- [ ] **Step 1: Create the panel file**

Create `static/text-panel-border.js`:

```js
// TEXT panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same row+subpanel pattern as text-panel-background.js. There is no box_border boolean —
// box_border_width === 0 IS "no border", so the toggle writes the width (off -> 0, on -> 2 when
// currently 0). Exposes window.TextPanel.renderBorder().
// Reaches into editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview).
window.TextPanel = window.TextPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;

  function openBorderPanel() {
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-border").hidden = false;
  }

  function closeBorderPanel() {
    document.getElementById("panel-text-border").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("text-border-subpanel-header"), { title: "Border", onBack: closeBorderPanel });

  window.TextPanel.renderBorder = function renderBorder() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);

    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("text-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: openBorderPanel,
      });
    }

    document.getElementById("text-box-border-width-field").hidden = !on;
    document.getElementById("text-box-border-radius-field").hidden = !on;
    document.getElementById("text-box-border-color-field").hidden = !on;

    UI.buttonGroup(document.getElementById("text-box-border-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      on ? "on" : "off",
      (v) => {
        if (v === "on") {
          if (preset.box_border_width === 0) preset.box_border_width = DEFAULT_BORDER_WIDTH;
        } else {
          preset.box_border_width = 0;
        }
        saveProject();
        renderTextPreview();
        renderBorder();
      });

    UI.numberField(document.getElementById("text-box-border-width-field"),
      { label: "WIDTH", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
        onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); renderBorder(); } });

    UI.numberField(document.getElementById("text-box-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 4,
        onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-box-border-color-field"),
      { label: "Border", value: preset.box_border_color, span: 8,
        onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); renderBorder(); } });
  };
})();
```

Setting WIDTH to `0` from inside the subpage is equivalent to toggling off: `renderBorder()` re-runs, the toggle flips to OFF and the fields hide. That is intended.

- [ ] **Step 2: Replace the Box-tab markup**

In `static/index.html`, find this block inside `#text-box-body` (near line 713):

```html
          <div id="text-box-background-border-divider"></div>

          <div class="style-group-label">BORDER</div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-box-border-width-field"></label>
              <label id="text-box-border-radius-field"></label>
              <div id="text-box-border-color-field"></div>
            </div>
          </div>
```

Replace it with:

```html
          <div class="style-group">
            <div id="text-box-border-row" class="col-8"></div>
          </div>
```

The `#text-box-background-border-divider` div is removed entirely (the two rows sit adjacent, as the Design tab's rows do).

- [ ] **Step 3: Add the subpanel div**

In `static/index.html`, immediately after the `#panel-text-background` div added in Task 4, add:

```html
        <div id="panel-text-border" hidden>
          <div id="text-border-subpanel-header"></div>
          <div class="style-group">
            <div id="text-box-border-toggle-group"></div>
          </div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-box-border-width-field"></label>
              <label id="text-box-border-radius-field"></label>
            </div>
          </div>
          <div class="style-group">
            <label id="text-box-border-color-field"></label>
          </div>
        </div>
```

- [ ] **Step 4: Add the script tag**

In `static/index.html`, after the `text-panel-background.js` tag added in Task 4:

```html
<script src="/static/text-panel-border.js"></script>
```

- [ ] **Step 5: Rewire `panel-text.js`**

In `static/panel-text.js`, inside `renderBoxPanel()`, delete this block:

```js
  UI.numberField(document.getElementById("text-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); } });
```

and put in its place:

```js
  TextPanel.renderBorder();
```

Then delete this line further down the file (near line 317, in the module's bottom wiring section):

```js
UI.divider(document.getElementById("text-box-background-border-divider"));
```

`UI.divider(document.getElementById("text-box-width-height-divider"));` and `UI.divider(document.getElementById("text-box-border-position-divider"));` both stay.

- [ ] **Step 6: Verify in the browser**

Reload in the throwaway project. TEXT panel → Box tab.

1. Box tab now reads: SIZE → divider → Background row → Border row → divider → TEXT ALIGN → POSITION. No stray `BORDER` group label, no divider between the two rows.
2. Border row reads `None`, no square.
3. Click → subpage with OFF/ON only. Toggle ON → WIDTH shows `2`, RADIUS and colour appear, the block gains a 2px border on the stage.
4. Set WIDTH to `8` → Back → row reads `8px` with a square.
5. Re-enter, set WIDTH to `0` → the toggle flips to OFF and the fields hide; Back → row reads `None` and the stage border is gone.
6. Toggle ON again → WIDTH returns to `2` (not `8` — it was zeroed).
7. Set WIDTH `8`, toggle OFF, toggle ON → WIDTH is `2`. Toggling off genuinely zeroes the width; this is the accepted behaviour.
8. Reload → state persisted. No console errors.

- [ ] **Step 7: Commit**

```bash
git add static/text-panel-border.js static/index.html static/panel-text.js
git commit -m "feat: TEXT Border moves to a settings row + subpage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: CAPTIONS Background + Border rows + subpages

The CAPTIONS Box tab gets the same two rows. Per this codebase's per-panel-duplication convention, these are separate files pointed at the caption track's preset — they do not share a module with the TEXT versions.

**Files:**
- Create: `static/caption-panel-background.js`
- Create: `static/caption-panel-border.js`
- Modify: `static/index.html` (Box-tab markup near line 283-299; two subpanel divs after `#panel-captions-language`; two script tags near line 878)
- Modify: `static/caption-panel-box.js:20-38` (drop background/border wiring)
- Modify: `static/panel-captions.js` (call the two new renders; drop the background/border divider)

**Interfaces:**
- Consumes: `SettingsRowValue.orNone(isOn, text)` from Task 1; the globals `ensureCaptionTrack()`, `ensureCaptionPreset(id)`, `saveProject()`, `renderCaptionPreview()` from `panel-captions.js`.
- Produces: `window.CaptionPanel.renderBackground()` and `window.CaptionPanel.renderBorder()` — no arguments, no return value. Called by `panel-captions.js`'s `renderCaptionPanel()`.

- [ ] **Step 1: Create the CAPTIONS background file**

Create `static/caption-panel-background.js`:

```js
// CAPTIONS panel Box tab: Background row + drill-down subpanel (on/off toggle + color +
// opacity), same pattern as text-panel-background.js but against the caption track's preset.
// Exposes window.CaptionPanel.renderBackground().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let backgroundRowSetValue = null;

  function openBackgroundPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-background").hidden = false;
  }

  function closeBackgroundPanel() {
    document.getElementById("panel-captions-background").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-background-subpanel-header"), { title: "Background", onBack: closeBackgroundPanel });

  window.CaptionPanel.renderBackground = function renderBackground() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    const value = SettingsRowValue.orNone(preset.box_background, `${preset.box_background_opacity}%`);
    const swatch = preset.box_background ? preset.box_background_color : null;

    if (backgroundRowSetValue) {
      backgroundRowSetValue(value, null, swatch);
    } else {
      backgroundRowSetValue = UI.settingsRow(document.getElementById("caption-box-background-row"), {
        label: "Background", value, swatchColor: swatch,
        onClick: openBackgroundPanel,
      });
    }

    const fieldsHidden = !preset.box_background;
    document.getElementById("caption-box-background-color-field").hidden = fieldsHidden;
    document.getElementById("caption-box-background-opacity-field").hidden = fieldsHidden;

    UI.buttonGroup(document.getElementById("caption-box-background-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.box_background ? "on" : "off",
      (v) => {
        preset.box_background = v === "on";
        saveProject();
        renderCaptionPreview();
        renderBackground();
      });

    UI.colorSwatch(document.getElementById("caption-box-background-color-field"),
      { label: "Background", value: preset.box_background_color, span: 8,
        onChange: (v) => { preset.box_background_color = v; saveProject(); renderCaptionPreview(); renderBackground(); } });

    UI.numberField(document.getElementById("caption-box-background-opacity-field"),
      { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 8,
        onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); renderBackground(); } });
  };
})();
```

- [ ] **Step 2: Create the CAPTIONS border file**

Create `static/caption-panel-border.js`:

```js
// CAPTIONS panel Box tab: Border row + drill-down subpanel (on/off toggle + width/radius/color),
// same pattern as text-panel-border.js but against the caption track's preset. box_border_width
// === 0 IS "no border" — there is no box_border boolean. Exposes window.CaptionPanel.renderBorder().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const DEFAULT_BORDER_WIDTH = 2;
  let borderRowSetValue = null;

  function openBorderPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-border").hidden = false;
  }

  function closeBorderPanel() {
    document.getElementById("panel-captions-border").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-border-subpanel-header"), { title: "Border", onBack: closeBorderPanel });

  window.CaptionPanel.renderBorder = function renderBorder() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    const on = preset.box_border_width > 0;
    const value = SettingsRowValue.orNone(on, `${preset.box_border_width}px`);
    const swatch = on ? preset.box_border_color : null;

    if (borderRowSetValue) {
      borderRowSetValue(value, null, swatch);
    } else {
      borderRowSetValue = UI.settingsRow(document.getElementById("caption-box-border-row"), {
        label: "Border", value, swatchColor: swatch,
        onClick: openBorderPanel,
      });
    }

    document.getElementById("caption-box-border-width-field").hidden = !on;
    document.getElementById("caption-box-border-radius-field").hidden = !on;
    document.getElementById("caption-box-border-color-field").hidden = !on;

    UI.buttonGroup(document.getElementById("caption-box-border-toggle-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      on ? "on" : "off",
      (v) => {
        if (v === "on") {
          if (preset.box_border_width === 0) preset.box_border_width = DEFAULT_BORDER_WIDTH;
        } else {
          preset.box_border_width = 0;
        }
        saveProject();
        renderCaptionPreview();
        renderBorder();
      });

    UI.numberField(document.getElementById("caption-box-border-width-field"),
      { label: "WIDTH", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
        onChange: (v) => { preset.box_border_width = v; saveProject(); renderCaptionPreview(); renderBorder(); } });

    UI.numberField(document.getElementById("caption-box-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 4,
        onChange: (v) => { preset.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

    UI.colorSwatch(document.getElementById("caption-box-border-color-field"),
      { label: "Border", value: preset.box_border_color, span: 8,
        onChange: (v) => { preset.box_border_color = v; saveProject(); renderCaptionPreview(); renderBorder(); } });
  };
})();
```

- [ ] **Step 3: Replace the CAPTIONS Box-tab markup**

In `static/index.html`, find this block inside `#caption-box-body` (near line 283):

```html
            <div class="style-group">
              <div class="style-row">
                <div id="caption-box-background-color-field"></div>
                <label id="caption-box-background-opacity-field"></label>
              </div>
            </div>

            <div id="caption-box-background-border-divider"></div>

            <div class="style-group-label">BORDER</div>
            <div class="style-group">
              <div class="style-row">
                <label id="caption-box-border-width-field"></label>
                <label id="caption-box-border-radius-field"></label>
                <div id="caption-box-border-color-field"></div>
              </div>
            </div>
```

Replace it with:

```html
            <div class="style-group">
              <div id="caption-box-background-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <div id="caption-box-border-row" class="col-8"></div>
            </div>
```

- [ ] **Step 4: Add the two subpanel divs**

In `static/index.html`, immediately after the `#panel-captions-language` div (it ends near line 418, just before the `</div>` that closes `#panel-captions`), add:

```html
        <div id="panel-captions-background" hidden>
          <div id="caption-background-subpanel-header"></div>
          <div class="style-group">
            <div id="caption-box-background-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="caption-box-background-color-field"></label>
          </div>
          <div class="style-group">
            <label id="caption-box-background-opacity-field"></label>
          </div>
        </div>

        <div id="panel-captions-border" hidden>
          <div id="caption-border-subpanel-header"></div>
          <div class="style-group">
            <div id="caption-box-border-toggle-group"></div>
          </div>
          <div class="style-group">
            <div class="style-row">
              <label id="caption-box-border-width-field"></label>
              <label id="caption-box-border-radius-field"></label>
            </div>
          </div>
          <div class="style-group">
            <label id="caption-box-border-color-field"></label>
          </div>
        </div>
```

- [ ] **Step 5: Add the script tags**

In `static/index.html`, find this line (near line 877):

```html
<script src="/static/caption-panel-box.js"></script>
```

Add after it:

```html
<script src="/static/caption-panel-background.js"></script>
<script src="/static/caption-panel-border.js"></script>
```

- [ ] **Step 6: Rewire `caption-panel-box.js`**

In `static/caption-panel-box.js`, inside `renderBox()`, delete this block:

```js
  UI.colorSwatch(document.getElementById("caption-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color, span: 1,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderCaptionPreview(); } });

  UI.numberField(document.getElementById("caption-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderCaptionPreview(); } });

  UI.colorSwatch(document.getElementById("caption-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderCaptionPreview(); } });
```

Nothing replaces it inside this file — the two new renders are called from the orchestrator in the next step. Update the file's header comment, which currently claims it holds background/border: change its first sentence to

```js
// CAPTIONS panel Box tab: fixed WIDTH/HEIGHT, TEXT ALIGN and absolute POSITION fields — same
// shape as panel-text.js's renderBoxPanel() + text-panel-align.js + text-panel-position.js
// combined, pointed at the caption track's preset. Background and Border are their own
// row+subpage files (caption-panel-background.js / caption-panel-border.js). The box is always a
```

leaving the rest of the existing comment intact.

- [ ] **Step 7: Rewire `panel-captions.js`**

In `static/panel-captions.js`, inside `renderCaptionPanel()`, find:

```js
  CaptionPanel.renderBox();
```

and replace it with:

```js
  CaptionPanel.renderBox();
  CaptionPanel.renderBackground();
  CaptionPanel.renderBorder();
```

Then delete this line (near line 111):

```js
UI.divider(document.getElementById("caption-box-background-border-divider"));
```

`caption-box-width-height-divider` and `caption-box-border-position-divider` both stay.

- [ ] **Step 8: Verify in the browser**

Reload in the throwaway project. Open the CAPTIONS panel → Box tab.

1. The tab reads: WIDTH/HEIGHT → divider → Background row → Border row → divider → TEXT ALIGN → POSITION.
2. Background reads `None`; open it, toggle ON, set OPACITY `50` → Back shows `50%` + square; the caption block on the stage gains a background. Toggle OFF → `None`, background gone.
3. Border reads `None`; toggle ON → WIDTH `2`, the caption box gains a border; set WIDTH `6` → Back shows `6px` + square. Set WIDTH `0` → toggle flips OFF, Back shows `None`.
4. Confirm the TEXT panel's Box tab still works (Task 4/5 rows unaffected).
5. Reload → both states persisted. No console errors.

- [ ] **Step 9: Commit**

```bash
git add static/caption-panel-background.js static/caption-panel-border.js static/index.html static/caption-panel-box.js static/panel-captions.js
git commit -m "feat: CAPTIONS Background and Border move to settings rows + subpages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: CAPTIONS Highlight row + subpage

Converts the CAPTIONS Design tab's inline HIGHLIGHT group (MARKER toggle + MODE + colour + radius) into a `Highlight` row fronting a subpage, so the Design tab reads as one uniform list of rows. This row is never `None` — a karaoke mode is always set, so the row shows the mode label regardless of the MARKER toggle.

**Note:** the MARKER on/off group (`#caption-highlight-marker-group`, writing `preset.highlight` — a background behind *all* caption text, parity with TEXT's highlight) landed on main after this plan was first written. It moves into the subpage unchanged alongside MODE; it does **not** drive the row's value.

**Files:**
- Modify: `static/caption-panel-highlight.js` (whole file rewritten)
- Modify: `static/index.html` (remove `#caption-highlight-body`, add `#caption-highlight-row`, add `#panel-captions-highlight` subpanel)
- Modify: `static/panel-captions.js:95-101` (`captionTabPanes.design` drops the removed body)

**Interfaces:**
- Consumes: the globals `ensureCaptionTrack()`, `ensureCaptionPreset(id)`, `saveProject()`, `renderCaptionPreview()`. It does **not** use `SettingsRowValue.orNone` — this row has no off state.
- Produces: `window.CaptionPanel.renderHighlight()` — no arguments, no return value. Name and call site are unchanged from today.

- [ ] **Step 1: Rewrite `caption-panel-highlight.js`**

Replace the entire contents of `static/caption-panel-highlight.js` with:

```js
// CAPTIONS panel Design tab: Highlight row + drill-down subpanel (MARKER on/off, karaoke MODE,
// highlight color + border radius), same row+subpanel pattern as caption-panel-shadow.js.
// Captions-only — TEXT's highlight is its own text-panel-highlight.js. The row is never "None":
// a karaoke mode is always set, so the row shows the mode label and the MARKER toggle does not
// drive it. MARKER and MODE's "Background" option share highlight_color/highlight_border_radius.
// Exposes window.CaptionPanel.renderHighlight().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  const MODES = [
    { value: "current_word", label: "Current word", span: 4 },
    { value: "progressive_fill", label: "Progressive fill", span: 4 },
    { value: "background", label: "Background", span: 8 },
  ];

  let highlightRowSetValue = null;

  function modeLabel(mode) {
    const found = MODES.find((m) => m.value === mode);
    return found ? found.label : MODES[0].label;
  }

  function openHighlightPanel() {
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-highlight").hidden = false;
  }

  function closeHighlightPanel() {
    document.getElementById("panel-captions-highlight").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-highlight-subpanel-header"), { title: "Highlight", onBack: closeHighlightPanel });

  window.CaptionPanel.renderHighlight = function renderHighlight() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);

    const value = modeLabel(preset.highlight_mode);

    if (highlightRowSetValue) {
      highlightRowSetValue(value, null, preset.highlight_color);
    } else {
      highlightRowSetValue = UI.settingsRow(document.getElementById("caption-highlight-row"), {
        label: "Highlight", value, swatchColor: preset.highlight_color,
        onClick: openHighlightPanel,
      });
    }

    UI.buttonGroup(document.getElementById("caption-highlight-marker-group"),
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      preset.highlight ? "on" : "off",
      (v) => { preset.highlight = v === "on"; saveProject(); renderCaptionPreview(); renderHighlight(); });

    UI.buttonGroup(document.getElementById("caption-highlight-mode-group"), MODES,
      preset.highlight_mode,
      (v) => { preset.highlight_mode = v; saveProject(); renderCaptionPreview(); renderHighlight(); });

    UI.colorSwatch(document.getElementById("caption-highlight-color-field"),
      { label: "Highlight color", value: preset.highlight_color, span: 8,
        onChange: (v) => { preset.highlight_color = v; saveProject(); renderCaptionPreview(); renderHighlight(); } });

    document.getElementById("caption-highlight-border-radius-field").hidden =
      preset.highlight_mode !== "background" && !preset.highlight;

    UI.numberField(document.getElementById("caption-highlight-border-radius-field"),
      { label: "RADIUS", unit: "PX", value: preset.highlight_border_radius, min: 0, max: 40, span: 8,
        onChange: (v) => { preset.highlight_border_radius = v; saveProject(); renderCaptionPreview(); } });
  };
})();
```

- [ ] **Step 2: Add the row to the Design tab**

In `static/index.html`, find the end of the caption font body (near line 267):

```html
            <div class="style-group">
              <div id="caption-shadow-row" class="col-8"></div>
            </div>
          </div>
```

Insert a Highlight row group before the closing `</div>`:

```html
            <div class="style-group">
              <div id="caption-shadow-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <div id="caption-highlight-row" class="col-8"></div>
            </div>
          </div>
```

- [ ] **Step 3: Remove the inline highlight body**

In `static/index.html`, delete this entire block (near line 323):

```html
          <div id="caption-highlight-body">
            <div class="style-group-label">MARKER</div>
            <div class="style-group">
              <div id="caption-highlight-marker-group"></div>
            </div>
            <div class="style-group-label">MODE</div>
            <div class="style-group">
              <div id="caption-highlight-mode-group"></div>
            </div>
            <div class="style-group">
              <div id="caption-highlight-color-field"></div>
            </div>
            <div class="style-group">
              <label id="caption-highlight-border-radius-field"></label>
            </div>
          </div>
```

- [ ] **Step 4: Add the subpanel div**

In `static/index.html`, immediately after the `#panel-captions-border` div added in Task 6, add:

```html
        <div id="panel-captions-highlight" hidden>
          <div id="caption-highlight-subpanel-header"></div>
          <div class="style-group-label">MARKER</div>
          <div class="style-group">
            <div id="caption-highlight-marker-group"></div>
          </div>
          <div class="style-group-label">MODE</div>
          <div class="style-group">
            <div id="caption-highlight-mode-group"></div>
          </div>
          <div class="style-group">
            <label id="caption-highlight-color-field"></label>
          </div>
          <div class="style-group">
            <label id="caption-highlight-border-radius-field"></label>
          </div>
        </div>
```

- [ ] **Step 5: Update the tab pane map**

In `static/panel-captions.js`, replace:

```js
// Design groups two existing bodies (FONT + HIGHLIGHT) — both show/hide together.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body"), document.getElementById("caption-highlight-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  filler: [document.getElementById("caption-filler-body")],
};
```

with:

```js
// Each tab maps to one body; the array shape is kept because showCaptionTab iterates it.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  filler: [document.getElementById("caption-filler-body")],
};
```

Also update the file's header comment: change

```js
// tab-bar/divider wiring (UI.tabBar; Design tab groups the FONT + HIGHLIGHT bodies together)
```

to

```js
// tab-bar/divider wiring (UI.tabBar; Highlight is a row+subpage inside the Design tab's body)
```

- [ ] **Step 6: Verify in the browser**

Reload in the throwaway project. CAPTIONS panel → Design tab.

1. The Design tab is one list: Font Family, Weight, size/italic/underline, Case, Color, Outline, Shadow, Highlight. No separate MARKER/MODE groups at the bottom.
2. The Highlight row shows a colour square and the current mode label (`Current word` by default).
3. Click it → the subpage opens with MARKER, MODE, colour and (hidden) RADIUS.
4. Pick `Background` → RADIUS appears. Back → the row reads `Background`.
4b. Set MODE back to `Current word` and toggle MARKER ON → RADIUS stays visible (marker uses it too), the caption text gains a background block on the stage, and the row still reads `Current word`.
5. Run a transcription or add caption words, scrub the playhead, and confirm the stage caption highlights per the selected mode.
6. Change the highlight colour → the row's square follows.
7. Switch to the Box tab and back to Design → the Highlight row is still there and correct.
8. Reload → state persisted. No console errors.

- [ ] **Step 7: Commit**

```bash
git add static/caption-panel-highlight.js static/index.html static/panel-captions.js
git commit -m "feat: CAPTIONS Highlight moves to a settings row + subpage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Full-suite regression run, map update, end-to-end verification

The last task proves nothing was broken elsewhere and brings the codebase map current.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Run the full Python test suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all tests pass. This change touches no Python; a failure here means something unrelated broke and must be investigated before proceeding.

- [ ] **Step 2: End-to-end browser check**

In the throwaway project, with the server running:

1. TEXT panel Box tab: Background and Border rows both toggle correctly and the stage follows.
2. TEXT panel Design tab: Outline, Shadow and Highlight rows all read `None` when off.
3. CAPTIONS panel Box tab: Background and Border rows both work.
4. CAPTIONS panel Design tab: Outline, Shadow read `None` when off; Highlight shows its mode.
5. Style tab, both panels: save a style with a background + border + shadow set, apply it to a second block/track, confirm the rows reflect the applied values. (`styleFieldsOf()` already carries every field involved — this confirms it.)
6. Undo/redo (Ctrl+Z / Ctrl+Y) after a background toggle restores the previous state and the rows re-render correctly.
7. Export the project (EXPORT panel) and confirm the produced mp4 still burns in the box background/border as before.
8. Browser console is clean across all of the above.

- [ ] **Step 3: Update the codebase map**

In `CLAUDE.md`:

1. **File structure tree** — add under `static/`:
   - `settings-row-value.js` — `window.SettingsRowValue.orNone(isOn, text)` (added 2026-07-29, settings-row None state): single definition of the `"None"` label shown by rows whose effect is switched off.
   - `text-panel-background.js` — TEXT panel Box tab: Background settings row + drill-down subpanel (on/off toggle + color + opacity), same row+subpanel pattern as `text-panel-shadow.js`.
   - `text-panel-border.js` — TEXT panel Box tab: Border settings row + drill-down subpanel (on/off toggle + width/radius/color); `box_border_width === 0` is "no border", there is no `box_border` boolean.
   - `caption-panel-background.js` / `caption-panel-border.js` — CAPTIONS mirrors of the two above, against the caption track's preset.

2. **File structure tree** — update these existing entries:
   - `index.html` — note that the TEXT and CAPTIONS Box tabs now hold a Background row and a Border row instead of inline background/border fields, that the CAPTIONS Design tab gained a Highlight row (and `#caption-highlight-body` is gone), and list the five new subpanel divs.
   - `caption-panel-highlight.js` — it is now a row + `#panel-captions-highlight` subpanel, not an inline Design-tab group.
   - `caption-panel-box.js` — no longer owns background/border fields.
   - `panel-captions.js` — the Design tab is one body again, not FONT + HIGHLIGHT.

3. **Inventory, "Text blocks & rich-text formatting"** — add the four new panel files alongside the existing `text-panel-*.js` list, and note that Outline/Shadow/Highlight/Background/Border rows read `None` when off via `SettingsRowValue.orNone`.

4. **Inventory, "Captions & transcription"** — same for the caption-side files.

5. **Inventory, "Shared UI components"** — add `static/settings-row-value.js` with its one-line description.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: map settings-row None state + Background/Border/Highlight subpages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification Gap (stated, not silent)

No task in this plan adds an automated test, because:

- No Python code changes, so `pytest` cannot reach any of it.
- The repository has no JavaScript test runner, and introducing one is out of scope for this change.
- The only pure logic added is `SettingsRowValue.orNone` — a single ternary with no branching beyond it.

Every task therefore ends with an explicit browser verification step against a **throwaway** project, and Task 8 adds a full-panel end-to-end pass plus an export check. `pytest` runs in Task 8 as a regression guard only.
