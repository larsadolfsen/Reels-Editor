# Right Panel 8-Column Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `#style-panel`'s content layout onto a fixed 8-column grid (28px columns, 8px gaps) so every control in the FILES/VIDEO/TEXT/CAPTIONS/SETTINGS/EXPORT panels aligns to consistent column boundaries.

**Architecture:** `.style-row` and `.style-group` both become `display: grid; grid-template-columns: repeat(8, 28px); gap: 8px;`. Every direct child gets an explicit `grid-column: span N` via a new `.col-1`…`.col-8` utility class — applied either directly in HTML (static containers/buttons) or by the owning JS component (`UI.numberField`/`UI.colorSwatch`/`UI.buttonGroup`, each gaining a new `span` option). `#style-panel`'s padding changes from `18px 16px` to `18px 20px` so the grid's 280px content width fits the existing 320px panel exactly.

**Tech Stack:** Vanilla JS (`window.UI.*` components), plain CSS (no preprocessor, no build step). No backend/model changes.

## Global Constraints

- No inline `style="..."` attributes anywhere in `static/index.html` or JS-rendered markup (per `CLAUDE.md`) — use CSS classes instead, including for the two pre-existing inline styles this plan touches (`text-size-field`'s `style="flex: 1"` and the SIZE row's `style="align-items: center; gap: 6px;"`).
- No JS build step — this project has no automated JS test framework; every JS/CSS task in this plan is verified by manual browser inspection (DOM/computed-style checks + a visual screenshot), not `pytest`. Run `pytest -q` after each task anyway as a regression guard for the untouched Python backend — it must stay green throughout (currently 48 passed).
- Every `static/*.js` and `static/css/**/*.css` file must keep its opening one/two-line purpose comment current.
- Reusable JS logic stays one component per file — no new shared "components" catch-all files.

---

### Task 1: CSS grid foundation

**Files:**
- Modify: `static/css/components/style-panel.css`
- Modify: `static/css/components/color-swatch.css`
- Modify: `static/css/components/button-group.css`

**Interfaces:**
- Produces: `.col-1`…`.col-8` utility classes (`grid-column: span N`), usable by any later task. `.style-row`/`.style-group` become grid containers (`repeat(8, 28px)` columns, 8px gap) that every later task's HTML/JS must place children into via those `.col-N` classes.

- [ ] **Step 1: Update `#style-panel` padding and `.style-row`/`.style-group`/`.style-field` rules**

In `static/css/components/style-panel.css`, replace the `#style-panel` padding line:

```css
#style-panel {
  position: relative;
  width: 320px;
  flex-shrink: 0;
  background: var(--surface);
  border-left: 1px solid var(--border-soft);
  overflow-y: auto;
  padding: 18px 20px;
}
```

Replace `.style-group` and `.style-row` (currently `margin-bottom: var(--space-2);` and `display: flex; align-items: center; gap: var(--space-2);` respectively) with:

```css
.style-group {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.style-group:last-child { margin-bottom: 0; }

.style-row {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: var(--space-2);
  align-items: center;
}

.col-1 { grid-column: span 1; }
.col-2 { grid-column: span 2; }
.col-3 { grid-column: span 3; }
.col-4 { grid-column: span 4; }
.col-5 { grid-column: span 5; }
.col-6 { grid-column: span 6; }
.col-7 { grid-column: span 7; }
.col-8 { grid-column: span 8; }
```

Delete the now-unused `.style-row-tight` rule (`justify-content: space-between; align-items: flex-end;`) — it has no call sites (confirmed via `grep -rn "style-row-tight" static/`).

In `.style-field` (same file), remove the `flex: 1;` line — width is now set by an explicit `.col-N` class instead:

```css
.style-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}
```

At the bottom of the file, delete only the `#text-align-group { grid-auto-columns: min-content; justify-content: start; }` block — once TEXT ALIGN's buttons get explicit `.col-1` classes (Task 6), the base `repeat(8, 28px)` grid template already left-aligns them with the row's unused columns left blank, making this rule redundant. Keep the `#text-align-group button { width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }` rule immediately below it — grid's default `stretch` already gives the button 28px of *width* from its `.col-1` column, but the row's *height* is otherwise auto-sized to content, so this rule is still needed to keep the button square and center its SVG icon.

Also delete the `#position-row-group, #position-col-group { margin-bottom: 4px; }` rule (and its `:last-child` reset) — `position-row-group` and `position-col-group` are two `col-8` siblings inside one shared `.style-group` (Task 6), each occupying a full grid row and auto-wrapping to the next; the grid's own `gap: var(--space-2)` (8px) already provides row spacing between them, so the old `margin-bottom` would double it up.

- [ ] **Step 2: Make `.color-swatch-row` grid-based for its internal swatch+label split**

In `static/css/components/color-swatch.css`, replace `.color-swatch-row`:

```css
.color-swatch-row {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: var(--space-2);
  align-items: center;
}
```

Delete the `.style-row .color-swatch-row { width: auto; flex-shrink: 0; }` rule immediately below it — no longer needed since the swatch-only case now gets its own explicit `.col-1` class from `UI.colorSwatch` (Task 3) instead of relying on `width: auto` to avoid stretching.

- [ ] **Step 3: Update `.btn-group` to the same 8-column grid**

In `static/css/components/button-group.css`, replace `.btn-group`'s `grid-auto-flow: column; grid-auto-columns: 1fr;` with the shared grid template:

```css
.btn-group {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: 4px;
}
```

(Keep the existing `gap: 4px;` — button groups use a tighter gap than the 8px row gap; this was already the value before this change.)

- [ ] **Step 4: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed` (this task touches no Python files; this just confirms nothing is broken).

- [ ] **Step 5: Commit**

```bash
git add static/css/components/style-panel.css static/css/components/color-swatch.css static/css/components/button-group.css
git commit -m "feat: lay 8-column grid foundation for right panel"
```

---

### Task 2: `UI.numberField` gains a `span` option

**Files:**
- Modify: `static/ui-number-field.js`

**Interfaces:**
- Consumes: nothing new (`.col-N` classes from Task 1).
- Produces: `UI.numberField(container, { label, unit, value, step, min, max, decimals, span, onChange })` — `span` (default `8`) becomes a `.col-{span}` class on `container`. Later tasks (5, 6, 7) call this with explicit `span` values for every existing call site.

- [ ] **Step 1: Add the `span` parameter and apply it**

In `static/ui-number-field.js`, change the function signature and the `classList.add` call:

```js
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, span = 8, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field", `col-${span}`);
  container.textContent = unit ? `${label} (${unit})` : label;
```

(The rest of the function is unchanged.)

- [ ] **Step 2: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 3: Commit**

```bash
git add static/ui-number-field.js
git commit -m "feat: add span option to UI.numberField"
```

---

### Task 3: `UI.colorSwatch` gains a `span` option

**Files:**
- Modify: `static/ui-color-swatch.js`

**Interfaces:**
- Consumes: `.color-swatch-row`'s new grid layout (Task 1 Step 2).
- Produces: `UI.colorSwatch(container, { label, value, onChange, showLabel, span })` — `span` (default `showLabel ? 8 : 1`) becomes a `.col-{span}` class on `container` (positioning it within its parent grid). When `showLabel` is true, the swatch input gets `.col-1` and the label span gets `.col-7` (positioning them within `container`'s own internal grid).

- [ ] **Step 1: Add the `span` parameter and apply column classes**

In `static/ui-color-swatch.js`:

```js
window.UI.colorSwatch = function colorSwatch(container, { label, value, onChange, showLabel = true, span }) {
  container.innerHTML = "";
  container.classList.add("color-swatch-row", `col-${span ?? (showLabel ? 8 : 1)}`);

  const input = document.createElement("input");
  input.type = "color";
  input.className = "color-swatch col-1";
  input.value = value;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onChange(input.value));

  container.append(input);
  if (showLabel) {
    const labelEl = document.createElement("span");
    labelEl.className = "color-swatch-label col-7";
    labelEl.textContent = label;
    container.append(labelEl);
  }
  return (v) => { input.value = v; };
};
```

- [ ] **Step 2: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 3: Commit**

```bash
git add static/ui-color-swatch.js
git commit -m "feat: add span option to UI.colorSwatch"
```

---

### Task 4: `UI.buttonGroup` gains per-button and container `span` options

**Files:**
- Modify: `static/ui-button-group.js`

**Interfaces:**
- Consumes: `.btn-group`'s new grid layout (Task 1 Step 3).
- Produces: `UI.buttonGroup(container, options, activeValue, onSelect, { containerSpan } = {})` — `options[i]` may include `span` (default `1`); each button gets `.col-{span}`. `containerSpan` (default `8`) becomes a `.col-{containerSpan}` class on `container`. Later tasks (5, 6) call this with explicit spans.

- [ ] **Step 1: Add the new parameters and apply column classes**

In `static/ui-button-group.js`:

```js
window.UI.buttonGroup = function buttonGroup(container, options, activeValue, onSelect, { containerSpan = 8 } = {}) {
  container.innerHTML = "";
  container.classList.add("btn-group", `col-${containerSpan}`);
  const buttons = options.map(({ value, label, icon, span = 1 }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `col-${span}`;
    if (icon) {
      btn.innerHTML = icon;
      btn.setAttribute("aria-label", label);
    } else {
      btn.textContent = label;
    }
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", String(value === activeValue));
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });
  return (value) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
};
```

Note: this preserves the existing `icon`/`aria-label` fallback behavior (added for TEXT ALIGN) unchanged — only the button's class list and the container's signature changed.

- [ ] **Step 2: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 3: Commit**

```bash
git add static/ui-button-group.js
git commit -m "feat: add per-button and container span options to UI.buttonGroup"
```

---

### Task 5: Wire spans across the FONT accordion

**Files:**
- Modify: `static/index.html:208-252` (FONT accordion markup)
- Modify: `static/text-panel-font-style.js`

**Interfaces:**
- Consumes: `UI.numberField`/`UI.colorSwatch`'s `span` option (Tasks 2, 3).

- [ ] **Step 1: Remove the two pre-existing inline styles in the FONT accordion**

In `static/index.html`, the Font Family row (around line 210-212) currently reads:

```html
<div class="style-group">
  <div id="text-font-row"></div>
</div>
```

Give `#text-font-row` an explicit `col-8` class (it's a solo full-width row, populated by `UI.settingsRow` elsewhere, which always renders full-width content):

```html
<div class="style-group">
  <div id="text-font-row" class="col-8"></div>
</div>
```

The SIZE row (around line 215) currently reads:

```html
<div class="style-row" style="align-items: center; gap: 6px;">
  <button class="icon-btn" id="text-size-step-down" type="button" aria-label="Decrease font size" title="Decrease font size">
```

Remove the inline `style="..."` attribute entirely — `.style-row` already sets `align-items: center` and a `var(--space-2)` (8px) gap from Task 1, which is close enough to the old 6px that no dedicated override is needed:

```html
<div class="style-row">
  <button class="icon-btn col-1" id="text-size-step-down" type="button" aria-label="Decrease font size" title="Decrease font size">
```

Give the step-up button and the SIZE field their column classes (same row, lines ~216-222):

```html
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
  </button>
  <label id="text-size-field"></label>
  <button class="icon-btn col-1" id="text-size-step-up" type="button" aria-label="Increase font size" title="Increase font size">
```

`#text-size-field` currently carries its own inline style too (`<label id="text-size-field" style="flex: 1;"></label>`) — remove that `style="flex: 1;"` attribute as shown above. Its column span comes from `UI.numberField`'s new `span` option in Step 3 below (`UI.numberField` overwrites `container.innerHTML` and adds classes, but does not touch or remove a pre-existing `style` attribute on its container — that has to be removed here, in the HTML).

- [ ] **Step 2: Add `col-1` to the Bold/Italic/Underline buttons**

In `static/index.html` (around line 226-238), add `col-1` to each of the three icon buttons:

```html
<div class="style-group">
  <div class="style-row">
    <button class="icon-btn col-1" id="text-bold" type="button" aria-pressed="false" title="Bold">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>
    </button>
    <button class="icon-btn col-1" id="text-italic" type="button" aria-pressed="false" title="Italic">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
    </button>
    <button class="icon-btn col-1" id="text-underline" type="button" aria-pressed="false" title="Underline">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
    </button>
  </div>
</div>
```

- [ ] **Step 3: Pass explicit `span` values in `text-panel-font-style.js`**

In `static/text-panel-font-style.js`, update the four control calls:

```js
    currentSizeFieldSetValue = UI.numberField(document.getElementById("text-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200, span: 6,
        onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-color-field"),
      { label: "Color", value: preset.color, span: 8,
        onChange: (v) => { preset.color = v; saveProject(); renderTextPreview(); } });

    UI.colorSwatch(document.getElementById("text-outline-color-field"),
      { label: "Outline", value: preset.outline_color, span: 8,
        onChange: (v) => { preset.outline_color = v; saveProject(); renderTextPreview(); } });

    UI.numberField(document.getElementById("text-outline-px-field"),
      { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20, span: 8,
        onChange: (v) => { preset.outline_px = v; saveProject(); renderTextPreview(); } });
```

- [ ] **Step 4: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 5: Manual browser verification**

Start the server: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`, open a text block's FONT accordion. Confirm: the step-down/SIZE/step-up row shows two 28×28px icon buttons flanking the size field with no visible gap irregularity; Bold/Italic/Underline render as three left-aligned 28×28px squares; Color/Outline rows show a 28px swatch with its label filling the rest of the row; no console errors; no inline `style="..."` attributes remain in this accordion's markup (`document.querySelectorAll('#text-font-body [style]').length === 0` in devtools).

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/text-panel-font-style.js
git commit -m "feat: apply 8-column grid to FONT accordion"
```

---

### Task 6: Wire spans across the BOX accordion (SIZE/Background/Border/TEXT ALIGN/POSITION)

**Files:**
- Modify: `static/index.html:254-309` (BOX accordion markup)
- Modify: `static/editor.js` (`renderBoxPanel`)
- Modify: `static/text-panel-align.js`
- Modify: `static/text-panel-position.js`

**Interfaces:**
- Consumes: `UI.numberField`/`UI.colorSwatch`/`UI.buttonGroup`'s `span` options (Tasks 2, 3, 4).

- [ ] **Step 1: Add container-level `col-8` classes to BOX's group containers in `static/index.html`**

Around lines 257-306, add `col-8` to the three `buttonGroup`/group container divs that don't otherwise receive a class from JS (`text-box-size-mode-group` already gets one from `UI.buttonGroup`'s new `containerSpan` default of 8, so no HTML change needed there — same for `text-align-group`, `position-row-group`, `position-col-group`). No markup changes are needed in this step; `UI.buttonGroup`'s Task 4 default (`containerSpan = 8`) already produces the right class on all four group containers.

- [ ] **Step 2: Pass explicit `span` values in `editor.js`'s `renderBoxPanel`**

In `static/editor.js`, update `renderBoxPanel` (lines 95-138):

```js
function renderBoxPanel() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-box-size-mode-group"),
    [{ value: "fit", label: "FIT", span: 4 }, { value: "fixed", label: "FREE", span: 4 }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      saveProject(); renderTextPreview(); renderBoxPanel();
    });

  const boxSizeFieldsHidden = preset.box_width_mode !== "fixed";
  document.getElementById("text-box-width-field").hidden = boxSizeFieldsHidden;
  document.getElementById("text-box-height-field").hidden = boxSizeFieldsHidden;

  UI.numberField(document.getElementById("text-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.box_width = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.box_height = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color, span: 1,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); } });
}
```

- [ ] **Step 3: Pass explicit per-button spans in `text-panel-align.js`**

In `static/text-panel-align.js`, add `span: 1` to each of the three TEXT ALIGN options:

```js
window.TextPanel.renderAlign = function renderAlign() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-align-group"),
    [
      {
        value: "left", label: "LEFT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" /></svg>',
      },
      {
        value: "center", label: "CENTER", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" /></svg>',
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" /></svg>',
      },
    ],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });
};
```

- [ ] **Step 4: Pass explicit spans in `text-panel-position.js`**

In `static/text-panel-position.js`:

```js
window.TextPanel.renderPosition = function renderPosition() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.offset_x, step: 1, span: 4,
      onChange: (v) => { preset.offset_x = Math.round(v); computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.offset_y, step: 1, span: 4,
      onChange: (v) => { preset.offset_y = Math.round(v); computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "btm", label: "BTM", span: 3 }],
    preset.pos_row, (value) => { preset.pos_row = value; computeXY(preset); saveProject(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT", span: 3 }, { value: "mid", label: "MID", span: 2 }, { value: "right", label: "RIGHT", span: 3 }],
    preset.pos_col, (value) => { preset.pos_col = value; computeXY(preset); saveProject(); renderTextPreview(); });
};
```

- [ ] **Step 5: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 6: Manual browser verification**

In the browser, open a text block's BOX accordion. Confirm: FIT/FREE fill the row evenly (2×140px); switching to FREE shows WIDTH (PX)/HEIGHT (PX) as two even fields; the Background swatch sits at 28px beside a wider Opacity field; the BORDER row shows BORDER (PX) wider than RADIUS (PX) with a 28px swatch at the end; TEXT ALIGN renders as three left-aligned 28×28px icon squares (same as before this plan, now grid-driven instead of the old scoped CSS override); POSITION's TOP/MID/BTM and LEFT/MID/RIGHT rows each fill the full row width with the middle button narrower than the two ends. No console errors.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/editor.js static/text-panel-align.js static/text-panel-position.js
git commit -m "feat: apply 8-column grid to BOX accordion"
```

---

### Task 7: Wire spans across TIME, STYLES, VIDEO, CAPTIONS, SETTINGS, EXPORT

**Files:**
- Modify: `static/text-panel-time.js`
- Modify: `static/editor.js` (`renderVideoPanel`)
- Modify: `static/index.html` (VIDEO/CAPTIONS/SETTINGS/EXPORT/STYLES static markup)

**Interfaces:**
- Consumes: `UI.numberField`'s `span` option (Task 2).

- [ ] **Step 1: Pass explicit spans in `text-panel-time.js`**

In `static/text-panel-time.js`:

```js
window.TextPanel.renderTime = function renderTime() {
  const block = ensureTextBlock();

  UI.numberField(document.getElementById("text-start-field"),
    { label: "START", unit: "SEC", value: block.start, step: 0.1, decimals: 1, span: 4,
      onChange: (v) => { block.start = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-end-field"),
    { label: "END", unit: "SEC", value: block.end, step: 0.1, decimals: 1, span: 4,
      onChange: (v) => { block.end = v; saveProject(); renderTextPreview(); } });
};
```

- [ ] **Step 2: Pass explicit spans for VIDEO's TRIM fields in `editor.js`**

In `static/editor.js`, update the two `numberField` calls inside `renderVideoPanel` (around lines 261-267):

```js
  UI.numberField(document.getElementById("video-in-field"),
    { label: "IN", unit: "SEC", value: c.in_point, step: 0.1, span: 4,
      onChange: (v) => applyTrim(v, c.out_point) });

  UI.numberField(document.getElementById("video-out-field"),
    { label: "OUT", unit: "SEC", value: c.out_point, step: 0.1, span: 4,
      onChange: (v) => applyTrim(c.in_point, v) });
```

- [ ] **Step 3: Add `col-N` classes to static (non-component) buttons in `static/index.html`**

VIDEO panel's Set in/out and Move up/down buttons (around lines 138-153) are plain `<button>` elements, not `UI.buttonGroup` — give each pair `col-4`:

```html
<div class="style-group">
  <div class="style-row">
    <button class="col-4" id="video-set-in">Set in</button>
    <button class="col-4" id="video-set-out">Set out</button>
  </div>
</div>

<div id="video-order-divider"></div>

<div class="style-group-label">ORDER</div>
<div class="style-group">
  <div class="style-row">
    <button class="col-4" id="video-move-up">&#9650; Move up</button>
    <button class="col-4" id="video-move-down">&#9660; Move down</button>
  </div>
</div>
```

CAPTIONS placeholder toolbar (around lines 158-164) — five disabled icon buttons, `col-1` each:

```html
<div class="style-row caption-toolbar">
  <button class="icon-btn col-1" disabled title="Bold (not yet wired)"><b>B</b></button>
  <button class="icon-btn col-1" disabled title="Italic (not yet wired)"><i>I</i></button>
  <button class="icon-btn col-1" disabled title="Underline (not yet wired)"><u>U</u></button>
  <button class="icon-btn col-1" disabled title="Align left (not yet wired)">&#9664;</button>
  <button class="icon-btn col-1" disabled title="Align right (not yet wired)">&#9654;</button>
</div>
```

SETTINGS theme row (around lines 172-180) — a label + a button sharing a row; give the label the remaining space and the button a single column:

```html
<div class="style-group">
  <div class="style-row">
    <span class="context-panel-name col-6">Theme</span>
    <button id="theme-toggle" class="col-2" type="button" aria-pressed="false" title="Toggle light/dark theme">
```

(Only the opening `<div class="style-row">`/`<span>`/`<button>` tags change; the rest of the theme-toggle markup — its two inner `<svg>` icons — is unchanged.)

EXPORT button (around line 185-187) — solo full-width button already inside `.style-group` (which is now a grid per Task 1); give it `col-8`:

```html
<div class="style-group">
  <button id="export" class="col-8">EXPORT &middot; 1080&times;1920</button>
</div>
```

STYLES accordion's "+ Save current style" button and the browse-row container (around lines 197-204) — both solo full-width children of a `.style-group`; give each `col-8`:

```html
<div class="style-group">
  <button id="text-style-save" class="col-8" type="button">+ Save current style</button>
</div>
<div class="style-group">
  <ul id="text-style-most-used" class="font-list col-8"></ul>
</div>
<div class="style-group">
  <div id="text-style-browse-row" class="col-8"></div>
</div>
```

- [ ] **Step 4: Verify no Python regressions**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 5: Manual browser verification**

In the browser: open VIDEO panel for a clip, confirm IN/OUT and Set in/Set out and Move up/Move down each render as two even 136px-wide fields/buttons. Open CAPTIONS, confirm the five placeholder icons render as left-aligned 28×28px squares. Open SETTINGS, confirm the Theme row shows the label and toggle button side by side without overflow. Open EXPORT, confirm the button still spans the full row width. Open TEXT → STYLES, confirm the Save button and browse row still span full width. No console errors; `document.querySelectorAll('#style-panel [style]').length === 0` confirms no inline styles remain anywhere in the panel.

- [ ] **Step 6: Commit**

```bash
git add static/text-panel-time.js static/editor.js static/index.html
git commit -m "feat: apply 8-column grid to TIME, STYLES, VIDEO, CAPTIONS, SETTINGS, EXPORT panels"
```

---

### Task 8: Full visual verification pass and branch finishing

**Files:** none (verification + branch-completion only)

- [ ] **Step 1: Run the full test suite one final time**

Run: `.venv/Scripts/python -m pytest -q`
Expected: `48 passed`.

- [ ] **Step 2: Full visual walkthrough**

Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`) and, in the browser pane, visit every panel/accordion touched by this plan in one pass: FILES, VIDEO, TEXT (FONT, STYLES, BOX, TIME accordions), CAPTIONS, SETTINGS, EXPORT. For each, take a screenshot and confirm: no clipped or overlapping controls, no unexpected horizontal scrollbar on `#style-panel`, and every row's total content width is 280px (`getComputedStyle` on a `.style-row`/`.style-group` element should report `280px` — compare against `#style-panel`'s `320px` outer width minus its `40px` total horizontal padding). Confirm `document.querySelectorAll('#style-panel [style]').length === 0` in the browser console (no inline styles left anywhere in the panel).

- [ ] **Step 3: Compare against pre-change behavior**

Re-verify the specific interactions noted in the design doc's risk section still work end-to-end: dragging a text block on the stage, editing BOX width/height in FREE mode, picking a Background/Border color, saving a style via "+ Save current style," and switching between VIDEO/TEXT/CAPTIONS panel selections. All should behave identically to before this plan — only visual alignment changed, not functionality.

- [ ] **Step 4: Update the backlog**

In `docs/superpowers/backlog.md`, move the "Right panel 8-column grid" line from `## To do` to `## Done`, replacing it with a summary of what was verified (mirroring the style of other `[x]` entries in that file).

- [ ] **Step 5: Finish the development branch**

Run the **superpowers:finishing-a-development-branch** skill to decide how to integrate this work (merge back to main locally and push to origin / open a PR / leave as-is).

---

## Next session

This plan is fully self-contained and ready to execute — no further brainstorming needed. Recommended handoff prompt for a fresh session/subagent:

> "Execute `docs/superpowers/plans/2026-07-19-right-panel-grid.md` task by task using the superpowers:subagent-driven-development skill. Recommended model: Sonnet 5, medium reasoning effort — this is mechanical CSS/DOM restructuring across many small, well-specified edits, not novel design work."
