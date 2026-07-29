# Batch 5 — Box tab

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints**, **Interface contract**, **Script load order** and **Verification procedure** first — they apply to every task here.

**Deliverable:** `static/style-section-box.js`, `static/style-section-align.js`, `static/style-section-position.js` and the `static/style-tab-box.js` composer, wired into both panels' Box tab. `renderBoxPanel()` leaves `static/panel-text.js`; `static/text-panel-align.js`, `static/text-panel-position.js` and `static/caption-panel-box.js` are deleted; both Box-tab bodies in `static/index.html` become empty mount points.

**Why this batch:** the Box tab is the largest single block of hand-duplicated markup left — `#text-box-body` (54 lines) and `#caption-box-body` (50 lines) are the same layout typed twice, and their JS is `renderBoxPanel()` + `text-panel-align.js` + `text-panel-position.js` on one side and `caption-panel-box.js` (all three concatenated, minus the size-mode group) on the other. It is also the last place a *panel orchestrator function* still owns control markup, so removing `renderBoxPanel()` finishes the job of making `panel-text.js` a pure orchestrator.

**Batches 2–4 had not been written when this file was authored.** The mount-point and panel-wiring pattern below is derived from the master plan's Interface contract and Script load order sections, not from a landed precedent. Two consequences for the implementer:

- If Batches 2–4 already introduced a module-level `textStyleTarget` / `captionStyleTarget` in `static/panel-text.js` / `static/panel-captions.js`, **reuse the existing variable** rather than declaring a second one. Task 5 Step 3 and Task 6 Step 2 call this out at the exact line.
- If Batches 2–4 already added the `.style-section` wrapper class and its CSS rule (Task 4 Step 2 below), skip that step rather than duplicating the rule.

---


## Amendments from the master-plan reconciliation (2026-07-29)

Batches 2-6 were drafted in parallel and disagreed on three points. The master plan is
now the single authority; where a snippet below contradicts it, **the master plan wins**.

- **Skip Task 4 Step 2 — the `.style-section` wrapper class and its CSS rules.** Batch 2
  now introduces both. This file specified them independently because Batches 2-4 had not
  been written yet; re-adding them would duplicate the rules. The reasoning in Task 4 is
  correct and is preserved in the master plan under "Section wrapper convention".
- The `#text-align-group` / `#caption-align-group` -> `.style-align-group` rename, and the
  transitional approach of keeping both id selectors live until each panel's markup is
  deleted, are **correct as written** and are now recorded in the master plan's "CSS
  divergence surface" section.
- This batch's "every write is `setPresetField`, there is not one `setField` call" rule
  was reviewed and is **correct as written**.

---

## Read this before Task 1

Three properties of this batch that are easy to get wrong.

**1. Neither panel's Box tab changes visually.** This is a pure relocation. TEXT keeps its SIZE label and FIT/FREE/FILL group; CAPTIONS keeps its always-visible WIDTH/HEIGHT and has no SIZE group at all. Row order, labels, dividers, spans and dividers are all identical before and after. The verification steps are therefore written to look for the **absence** of change: Task 1 Step 1 captures baseline screenshots of both Box tabs, and Tasks 5, 6 and 7 compare against them pixel-for-pixel.

**2. Nothing in the Box tab is `FormatRun`-capable.** A `FormatRun` can override `font`, `size_px`, `color`, `outline_color`, `outline_px`, `weight`, `italic`, `underline`, `highlight`, `highlight_color` — and nothing else (`FormatRun` in `app/models.py`). Every field this batch touches (`box_width_mode`, `box_height_mode`, `box_width`, `box_height`, `box_background`, `box_background_color`, `box_background_opacity`, `box_border_width`, `box_border_radius`, `box_border_color`, `align`, `x`, `y`) is whole-preset only. **Every write in every file in this batch is `target.setPresetField(...)`. There is not one `target.setField(...)` call in Batch 5.** If you find yourself typing `setField` here, you have made a mistake.

**3. Sections are built once and rendered many times.** `UI.numberField`, `UI.buttonGroup` and `UI.colorSwatch` each return a setter. Call the `UI.*` builder in the factory, capture the setter, and call the setter from `render()`. Never call a `UI.*` builder from inside `render()`.

---

## Task 1: The box section

**Files:**
- Create: `static/style-section-box.js`

**Interfaces:**
- Consumes: `target.getPreset()`, `target.setPresetField(field, value)`, `target.rerenderPreview()` (master plan Interface contract); `UI.buttonGroup`, `UI.numberField`, `UI.colorSwatch`, `UI.divider`.
- Produces: `window.StyleSection.box(container, target, { sizeModes }) -> { render() }`. Task 4's `style-tab-box.js` is the only caller.

- [ ] **Step 1: Capture the baseline screenshots**

Before touching anything. Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, create a **throwaway** project (never a real one — the unload keepalive-save flushes in-memory state to disk), import any clip, add a text block, and add at least one caption word (Auto-caption, or type one in the CAPTIONS panel's Closed-captions tab).

Then screenshot, at the same window width, and keep both files for the rest of the batch:

1. TEXT panel → **Box** tab, with SIZE on **FIT** → save as `box-tab-text-fit-before.png`
2. Click **FREE** → save as `box-tab-text-free-before.png` (this is the state with WIDTH/HEIGHT visible)
3. CAPTIONS panel → **Box** tab → save as `box-tab-caption-before.png`

- [ ] **Step 2: Write `static/style-section-box.js`**

Create `static/style-section-box.js`:

```js
// Shared Box-tab section: SIZE mode (FIT/FREE/FILL), WIDTH/HEIGHT, box background colour and
// opacity, and border width/radius/colour — one file serving both the TEXT and CAPTIONS panels.
// Builds its own markup once in the factory; render() only pushes current values back through
// the setters the UI.* primitives returned. Every write here is whole-preset (setPresetField):
// no box field is FormatRun-capable.
window.StyleSection = window.StyleSection || {};

// options.sizeModes
//   true  -> TEXT: renders the SIZE label + FIT/FREE/FILL group, and hides WIDTH/HEIGHT in FIT.
//   false -> CAPTIONS: no SIZE label and no group at all; a caption box is always a fixed size,
//            so WIDTH/HEIGHT are unconditionally visible. This is an option, never a check on
//            target.kind — a section must not know which panel it is in.
window.StyleSection.box = function box(container, target, options) {
  const opts = options || {};
  const sizeModes = !!opts.sizeModes;

  container.innerHTML = "";

  function groupLabel(text) {
    const el = document.createElement("div");
    el.className = "style-group-label";
    el.textContent = text;
    container.appendChild(el);
  }
  function styleGroup(child) {
    const g = document.createElement("div");
    g.className = "style-group";
    g.appendChild(child);
    container.appendChild(g);
  }
  function styleRow(children) {
    const r = document.createElement("div");
    r.className = "style-row";
    children.forEach((c) => r.appendChild(c));
    return r;
  }
  function addDivider() {
    const d = document.createElement("div");
    container.appendChild(d);
    UI.divider(d);
  }

  const preset0 = target.getPreset();

  // ---- markup, built once -------------------------------------------------------------
  let sizeModeEl = null;
  if (sizeModes) {
    groupLabel("SIZE");
    sizeModeEl = document.createElement("div");
    styleGroup(sizeModeEl);
  }

  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  styleGroup(styleRow([widthEl, heightEl]));

  addDivider();

  const bgColorEl = document.createElement("div");
  const bgOpacityEl = document.createElement("label");
  styleGroup(styleRow([bgColorEl, bgOpacityEl]));

  addDivider();

  groupLabel("BORDER");
  const borderWidthEl = document.createElement("label");
  const borderRadiusEl = document.createElement("label");
  const borderColorEl = document.createElement("div");
  styleGroup(styleRow([borderWidthEl, borderRadiusEl, borderColorEl]));

  // ---- controls, built once; render() drives the setters they return --------------------
  let setSizeMode = null;
  if (sizeModes) {
    setSizeMode = UI.buttonGroup(sizeModeEl,
      [{ value: "fit", label: "FIT", span: 3 },
       { value: "fixed", label: "FREE", span: 2 },
       { value: "fill", label: "FILL", span: 3 }],
      preset0.box_width_mode,
      (value) => {
        // One click writes two paired fields, and FILL refits size_px during the preview render
        // — which has to happen BEFORE the save, or the fitted size is not what gets persisted
        // (the same ordering handleBoxResizeEnd() in panel-text.js documents). setPresetField
        // saves before it re-renders the preview and has no paired form, so: write the pair,
        // render the preview so FILL refits, then let one setPresetField call do the save. The
        // re-write of box_width_mode is idempotent. Calling setPresetField twice instead would
        // push two undo entries for one click.
        const preset = target.getPreset();
        preset.box_width_mode = value;
        preset.box_height_mode = value;
        target.rerenderPreview();
        target.setPresetField("box_width_mode", value);
        render();
      });
  }

  const setWidth = UI.numberField(widthEl,
    { label: "WIDTH", unit: "PX", value: preset0.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => target.setPresetField("box_width", v) });

  const setHeight = UI.numberField(heightEl,
    { label: "HEIGHT", unit: "PX", value: preset0.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => target.setPresetField("box_height", v) });

  const setBgColor = UI.colorSwatch(bgColorEl,
    { label: "Background", showLabel: false, value: preset0.box_background_color, span: 1,
      onChange: (v) => {
        // Picking a background colour also switches the background on — the same paired write
        // the old renderBoxPanel()/CaptionPanel.renderBox() did. box_background is never
        // rendered as its own control, so there is nothing for render() to refresh for it.
        target.getPreset().box_background = true;
        target.setPresetField("box_background_color", v);
      } });

  const setBgOpacity = UI.numberField(bgOpacityEl,
    { label: "OPACITY", unit: "%", value: preset0.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => target.setPresetField("box_background_opacity", v) });

  const setBorderWidth = UI.numberField(borderWidthEl,
    { label: "BORDER", unit: "PX", value: preset0.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => target.setPresetField("box_border_width", v) });

  const setBorderRadius = UI.numberField(borderRadiusEl,
    { label: "RADIUS", unit: "PX", value: preset0.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => target.setPresetField("box_border_radius", v) });

  const setBorderColor = UI.colorSwatch(borderColorEl,
    { label: "Border Color", showLabel: false, value: preset0.box_border_color, span: 1,
      onChange: (v) => target.setPresetField("box_border_color", v) });

  function render() {
    const preset = target.getPreset();
    if (setSizeMode) setSizeMode(preset.box_width_mode);
    // WIDTH/HEIGHT serve both FREE (manual fixed size) and FILL (fixed size that auto-fits the
    // text) — only FIT sizes the box to its content and has no use for them. With sizeModes off
    // there is no FIT to be in, so they always show.
    const sizeFieldsHidden = sizeModes && preset.box_width_mode === "fit";
    widthEl.hidden = sizeFieldsHidden;
    heightEl.hidden = sizeFieldsHidden;
    setWidth(preset.box_width);
    setHeight(preset.box_height);
    setBgColor(preset.box_background_color);
    setBgOpacity(preset.box_background_opacity);
    setBorderWidth(preset.box_border_width);
    setBorderRadius(preset.box_border_radius);
    setBorderColor(preset.box_border_color);
  }

  render();
  return { render };
};
```

- [ ] **Step 3: Confirm nothing changed yet**

The file is not loaded by `index.html` and nothing calls it. Reload `http://127.0.0.1:8000` and confirm the browser console is clean and both Box tabs still match the Step 1 screenshots exactly.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-box.js
git commit -m "feat: shared Box-tab box section (size mode, w/h, background, border)"
```

---

## Task 2: The align section

**Files:**
- Create: `static/style-section-align.js`
- Modify: `static/css/components/style-panel.css` (add a class selector alongside the two id selectors)

**Interfaces:**
- Consumes: `target.getPreset()`, `target.setPresetField(field, value)`; `UI.buttonGroup`.
- Produces: `window.StyleSection.align(container, target, {}) -> { render() }`. Task 4's composer is the only caller.

**Why the CSS change:** `static/css/components/style-panel.css:244-256` pins the align buttons to 28x28 icon squares via **id** selectors — `#text-align-group button, #caption-align-group button`. One shared section cannot carry either id (it renders twice, once per panel), so the rule has to become class-based or the align buttons silently lose their sizing. Both selectors stay live for now and are removed in Tasks 5 and 6, as each panel's markup goes away, so no intermediate commit leaves the buttons unstyled.

- [ ] **Step 1: Write `static/style-section-align.js`**

Create `static/style-section-align.js`:

```js
// Shared Box-tab section: the TEXT ALIGN button group (left/center/right), one file serving both
// the TEXT and CAPTIONS panels. Builds its markup once; render() only refreshes which button is
// active. align is not FormatRun-capable, so the write is setPresetField.
window.StyleSection = window.StyleSection || {};

(() => {
  // Lucide align-left / align-center / align-right, copied verbatim from the markup this
  // section replaces (text-panel-align.js and caption-panel-box.js carried identical copies).
  const ALIGN_OPTIONS = [
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
  ];

  window.StyleSection.align = function align(container, target, options) {
    container.innerHTML = "";

    const labelEl = document.createElement("div");
    labelEl.className = "style-group-label";
    labelEl.textContent = "TEXT ALIGN";
    container.appendChild(labelEl);

    const group = document.createElement("div");
    group.className = "style-group";
    // .style-align-group replaces the old #text-align-group / #caption-align-group ids that
    // style-panel.css used to pin these icon buttons to 28x28 squares — a shared section
    // renders twice and so cannot carry an id.
    const groupEl = document.createElement("div");
    groupEl.className = "style-align-group";
    group.appendChild(groupEl);
    container.appendChild(group);

    const setActive = UI.buttonGroup(groupEl, ALIGN_OPTIONS, target.getPreset().align,
      (value) => target.setPresetField("align", value));

    // Changing align moves the box on stage (stage.css keys its transform off it) but does NOT
    // re-render the panel — matching the old behaviour, where HORIZONTAL kept its stored value.
    function render() { setActive(target.getPreset().align); }

    render();
    return { render };
  };
})();
```

- [ ] **Step 2: Add the class selector to `static/css/components/style-panel.css`**

Replace lines 244-256:

```css
/* TEXT ALIGN's buttons are icons, not text — the group's 28px grid tracks would otherwise
   stretch/pad them like text-label buttons, so pin them to plain 28x28 .icon-btn squares with
   the SVG centered. Scoped to TEXT's and CAPTIONS' identical align groups; other button-group
   uses (POSITION row/col, BOX size mode, etc.) keep the default text-label sizing. */
#text-align-group button,
#caption-align-group button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

with:

```css
/* TEXT ALIGN's buttons are icons, not text — the group's 28px grid tracks would otherwise
   stretch/pad them like text-label buttons, so pin them to plain 28x28 .icon-btn squares with
   the SVG centered. Other button-group uses (POSITION row/col, BOX size mode, etc.) keep the
   default text-label sizing.
   .style-align-group is StyleSection.align's own group element; the two id selectors are the
   hand-written TEXT/CAPTIONS markup it replaces and are dropped as each panel is migrated. */
#text-align-group button,
#caption-align-group button,
.style-align-group button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 3: Confirm nothing changed yet**

Reload `http://127.0.0.1:8000`. Both align groups still render as 28x28 icon squares (nothing carries `.style-align-group` yet, so the two id selectors are still doing all the work). Console clean.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-align.js static/css/components/style-panel.css
git commit -m "feat: shared Box-tab align section"
```

---

## Task 3: The position section

**Files:**
- Create: `static/style-section-position.js`

**Interfaces:**
- Consumes: `target.getPreset()`, `target.setPresetField(field, value)`, `target.getBoxSize()`, `target.rerenderPanel()`; the `anchorPositionX(value, boxWidth, align)` / `anchorPositionY(value, boxHeight)` globals in `static/panel-text.js`; `UI.numberField`, `UI.buttonGroup`.
- Produces: `window.StyleSection.position(container, target, {}) -> { render() }`. Task 4's composer is the only caller.

**Two details that decide whether this is a faithful port:**

1. `anchorPositionX` takes **three** arguments — `anchorPositionX(value, boxWidth, align)` (`static/panel-text.js:16`). The third compensates for `stage.css`'s align-keyed CSS transform on the box, so the computed edge-flush `x` lands the box's *visible* edge on the canvas edge rather than its anchor point. `anchorPositionY(value, boxHeight)` takes two. Dropping the `align` argument silently mis-places left/right-aligned boxes.
2. The anchor grid is **stateless** — `activeValue` is `null` and no cell ever stays highlighted. But `UI.buttonGroup`'s own click handler sets `aria-pressed="true"` on the clicked button regardless of `activeValue` (`static/ui-button-group.js:25-28`). The old code cleared that by rebuilding the whole group on the next `renderTextPanel()`. Since the new section builds once, `render()` has to clear it explicitly by calling the returned setter with `null`. Omit that and a clicked anchor cell stays lit forever — a visible regression.

- [ ] **Step 1: Write `static/style-section-position.js`**

Create `static/style-section-position.js`:

```js
// Shared Box-tab section: the absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) plus
// the stateless 3x3 anchor-grid shortcut, one file serving both the TEXT and CAPTIONS panels.
// Uses target.getBoxSize() for the box's live rendered size and panel-text.js's
// anchorPositionX/anchorPositionY for the edge-flush maths. Every write is setPresetField.
window.StyleSection = window.StyleSection || {};

(() => {
  const ROW_OPTIONS = [
    { value: "top", label: "TOP", span: 3 },
    { value: "mid", label: "MID", span: 2 },
    { value: "btm", label: "BTM", span: 3 },
  ];
  const COL_OPTIONS = [
    { value: "left", label: "LEFT", span: 3 },
    { value: "mid", label: "MID", span: 2 },
    { value: "right", label: "RIGHT", span: 3 },
  ];

  window.StyleSection.position = function position(container, target, options) {
    container.innerHTML = "";

    const labelEl = document.createElement("div");
    labelEl.className = "style-group-label";
    labelEl.textContent = "POSITION";
    container.appendChild(labelEl);

    const gridGroup = document.createElement("div");
    gridGroup.className = "style-group";
    const rowGroupEl = document.createElement("div");
    const colGroupEl = document.createElement("div");
    gridGroup.append(rowGroupEl, colGroupEl);
    container.appendChild(gridGroup);

    const fieldsGroup = document.createElement("div");
    fieldsGroup.className = "style-group";
    const fieldsRow = document.createElement("div");
    fieldsRow.className = "style-row";
    const xEl = document.createElement("label");
    const yEl = document.createElement("label");
    fieldsRow.append(xEl, yEl);
    fieldsGroup.appendChild(fieldsRow);
    container.appendChild(fieldsGroup);

    const preset0 = target.getPreset();

    const setX = UI.numberField(xEl,
      { label: "HORIZONTAL", unit: "PX", value: preset0.x, step: 1, min: 1, max: 1080, span: 4,
        onChange: (v) => target.setPresetField("x", Math.round(v)) });

    const setY = UI.numberField(yEl,
      { label: "VERTICAL", unit: "PX", value: preset0.y, step: 1, min: 1, max: 1920, span: 4,
        onChange: (v) => target.setPresetField("y", Math.round(v)) });

    // Stateless shortcut: activeValue is null, so nothing is selected on entry, and a click just
    // computes an absolute pixel value edge-flush against the 1080x1920 canvas from the box's own
    // rendered size — which is exactly what target.getBoxSize() exists for — writes it to x/y,
    // and re-renders the whole panel so the fields above pick the new value up.
    const setRowActive = UI.buttonGroup(rowGroupEl, ROW_OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      target.setPresetField("y", Math.round(anchorPositionY(value, size && size.height)));
      target.rerenderPanel();
    });

    const setColActive = UI.buttonGroup(colGroupEl, COL_OPTIONS, null, (value) => {
      const size = target.getBoxSize();
      // anchorPositionX's third argument is the align mode: stage.css shifts the box by a
      // fraction of its own width depending on align, and the edge-flush x has to compensate.
      const x = anchorPositionX(value, size && size.width, target.getPreset().align);
      target.setPresetField("x", Math.round(x));
      target.rerenderPanel();
    });

    function render() {
      const preset = target.getPreset();
      setX(preset.x);
      setY(preset.y);
      // UI.buttonGroup marks the clicked button pressed even when the group has no active value.
      // The old code cleared that by rebuilding the group on every panel render; a build-once
      // section has to clear it here, or a clicked anchor cell stays lit.
      setRowActive(null);
      setColActive(null);
    }

    render();
    return { render };
  };
})();
```

- [ ] **Step 2: Confirm nothing changed yet**

Reload `http://127.0.0.1:8000`. Console clean, both Box tabs unchanged — nothing loads or calls this file yet.

- [ ] **Step 3: Commit**

```bash
git add static/style-section-position.js
git commit -m "feat: shared Box-tab position section with stateless anchor grid"
```

---

## Task 4: The Box tab composer

**Files:**
- Create: `static/style-tab-box.js`
- Modify: `static/css/components/style-panel.css` (add the `.style-section` wrapper rules)
- Modify: `static/index.html` (add the four new script tags)

**Interfaces:**
- Consumes: `StyleSection.box`, `StyleSection.align`, `StyleSection.position` (Tasks 1-3); `UI.divider`.
- Produces: `window.StyleTab.box(container, target, { sizeModes }) -> { render() }`. Tasks 5 and 6 are the callers.

**Why the composer owns one divider:** the old markup had three dividers in the Box body — width/height→background, background→border, and border→TEXT ALIGN. The first two are internal to the box section and it owns them (Task 1). The third is a boundary *between* two sections, so it belongs to whoever puts them next to each other: the composer.

**Why `.style-section` needs CSS:** `style-panel.css:62` is `.style-group:last-child { margin-bottom: 0; }`. In the old flat markup the only `.style-group` that matched was the very last one in the Box body. Wrapping each section in its own div creates three new `:last-child` boundaries, so the box section's BORDER group and the align section's group would both silently lose their bottom margin. The rule below restores it for every wrapper that is not the last, and `display: contents` keeps the wrappers layout-transparent so the sections lay out exactly as the flat markup did.

- [ ] **Step 1: Write `static/style-tab-box.js`**

Create `static/style-tab-box.js`:

```js
// Box-tab composer: renders the box, align and position sections into one tab body, in that
// fixed order, for both the TEXT and CAPTIONS panels. The order is defined here and nowhere
// else, which is what stops the two panels drifting apart again.
window.StyleTab = window.StyleTab || {};

// options.sizeModes is forwarded to StyleSection.box: true for TEXT (FIT/FREE/FILL), false for
// CAPTIONS (a caption box is always a fixed size).
window.StyleTab.box = function box(container, target, options) {
  const opts = options || {};

  container.innerHTML = "";

  // Each section builds into its own wrapper. .style-section makes the wrapper layout-transparent
  // and restores the bottom margin that .style-group:last-child would otherwise drop — see
  // style-panel.css.
  function mount() {
    const el = document.createElement("div");
    el.className = "style-section";
    container.appendChild(el);
    return el;
  }

  const boxEl = mount();
  // The border -> TEXT ALIGN separator is a boundary between two sections, not part of either,
  // so the composer owns it (it was #text-box-border-position-divider /
  // #caption-box-border-position-divider in the markup this replaces).
  const dividerEl = document.createElement("div");
  container.appendChild(dividerEl);
  const alignEl = mount();
  const positionEl = mount();

  const boxSection = StyleSection.box(boxEl, target, { sizeModes: !!opts.sizeModes });
  UI.divider(dividerEl);
  const alignSection = StyleSection.align(alignEl, target, {});
  const positionSection = StyleSection.position(positionEl, target, {});

  function render() {
    boxSection.render();
    alignSection.render();
    positionSection.render();
  }

  return { render };
};
```

- [ ] **Step 2: Add the `.style-section` rules to `static/css/components/style-panel.css`**

Immediately after the `.style-group[hidden] { display: none; }` line (line 63), insert:

```css
/* Wrapper a StyleTab.* composer creates around each StyleSection.* it renders. display:contents
   keeps it layout-transparent, so a composed tab body lays out exactly like the flat hand-written
   markup it replaced. The second rule undoes a side effect of wrapping: .style-group:last-child
   above zeroes the bottom margin of the last group in a container, which used to mean "the last
   group in the whole tab body" and now would also match the last group of every section. Only
   the final section should lose that margin. */
.style-section { display: contents; }
.style-section:not(:last-child) > .style-group:last-child { margin-bottom: var(--space-2); }
```

If Batches 2-4 already added these two rules, skip this step.

- [ ] **Step 3: Add the four script tags to `static/index.html`**

The master plan's Script load order puts these after `style-section-highlight.js` and before `style-section-preset-library.js`. Insert them after the last `<script src="/static/style-section-*.js">` tag that already exists (if Batches 2-4 have not landed, that is after `<script src="/static/style-panel-host.js"></script>`):

```html
<script src="/static/style-section-box.js"></script>
<script src="/static/style-section-align.js"></script>
<script src="/static/style-section-position.js"></script>
<script src="/static/style-tab-box.js"></script>
```

- [ ] **Step 4: Confirm the app still loads clean and nothing changed**

Reload `http://127.0.0.1:8000`. Console clean. In the console:

```js
typeof StyleTab.box            // "function"
typeof StyleSection.box        // "function"
typeof StyleSection.align      // "function"
typeof StyleSection.position   // "function"
```

Both Box tabs still match the Task 1 Step 1 screenshots — nothing calls the composer yet.

- [ ] **Step 5: Commit**

```bash
git add static/style-tab-box.js static/css/components/style-panel.css static/index.html
git commit -m "feat: Box-tab composer and shared style-section wrapper styling"
```

---

## Task 5: Rewire the TEXT panel's Box tab

**Files:**
- Modify: `static/panel-text.js` (remove `renderBoxPanel()`, repoint its call sites, remove the three divider wirings and the two `TextPanel.render*` calls, add `renderBoxTab()`)
- Modify: `static/index.html` (`#text-box-body` becomes a mount point; drop two script tags)
- Modify: `static/css/components/style-panel.css` (drop the now-dead `#text-align-group` selector)
- Delete: `static/text-panel-align.js`, `static/text-panel-position.js`

**Interfaces:**
- Consumes: `StyleTab.box` (Task 4), `StyleTarget.forTextBlock()` (Batch 1).
- Produces: `renderBoxTab()` — a file-local global in `panel-text.js`, replacing `renderBoxPanel()`. Removes the globals `renderBoxPanel`, `TextPanel.renderAlign`, `TextPanel.renderPosition`.

**`renderBoxPanel()` call sites.** Grep first and confirm you see exactly these three, all in `static/panel-text.js` — nothing outside this file calls it:

```bash
grep -rn "renderBoxPanel" static/
```

| Line | Context | Replacement |
|---|---|---|
| 175 | inside `renderTextPanel()` | `renderBoxTab();` |
| 205 | inside `renderBoxPanel()` itself, the SIZE-mode group's `onSelect` | gone — the box section's own `render()` (Task 1) does this |
| 268 | inside `handleBoxResizeEnd()` | `renderBoxTab();` |

`handleBoxResize()`, `handleBoxMove()` and `handleBoxMoveEnd()` do **not** call `renderBoxPanel()` — the first two only re-render the preview, and `handleBoxMoveEnd()` calls `renderTextPanel()`, which reaches the Box tab through call site 175.

- [ ] **Step 1: Replace the `renderBoxPanel()` call in `renderTextPanel()`**

In `static/panel-text.js`, in `renderTextPanel()`, replace:

```js
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();
```

with:

```js
  TextPanel.renderStyle();
  renderBoxTab();
  TextPanel.renderTime();
```

- [ ] **Step 2: Delete `renderBoxPanel()`**

In `static/panel-text.js`, delete the whole function — everything from `function renderBoxPanel() {` down to and including its closing `}` (lines 196-241 before Step 1's edit), i.e. from:

```js
function renderBoxPanel() {
  const preset = ensureTextPreset(currentTextBlock().preset_id);
```

through:

```js
  UI.colorSwatch(document.getElementById("text-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); } });
}
```

- [ ] **Step 3: Add `renderBoxTab()` in its place**

In `static/panel-text.js`, where `renderBoxPanel()` used to be — between `renderTextPanel()` and `stageScale()` — insert:

```js
// The Box tab's shared sections (StyleTab.box owns all the markup inside #text-box-body) are
// built once and re-rendered on every panel render. Built lazily rather than at load time:
// #text-box-body only has anything to show once a text block exists, and Preview/project are
// not defined yet when this file loads (index.html loads preview.js and editor.js after it).
// The cached target survives project switches and undo/redo — its deps resolve `project` and
// currentTextBlock() at call time, not at construction.
let textStyleTarget = null;
let textBoxTab = null;

function renderBoxTab() {
  if (!textStyleTarget) textStyleTarget = StyleTarget.forTextBlock();
  if (!textBoxTab) {
    textBoxTab = StyleTab.box(document.getElementById("text-box-body"), textStyleTarget, { sizeModes: true });
  }
  textBoxTab.render();
}
```

**If Batches 2-4 already declared `textStyleTarget` in this file**, drop the `let textStyleTarget = null;` line and the `if (!textStyleTarget) ...` line and reuse theirs — two `let` declarations of the same name in one classic script is a `SyntaxError` that blanks the whole app.

- [ ] **Step 4: Repoint the `handleBoxResizeEnd()` call site**

In `static/panel-text.js`, in `handleBoxResizeEnd()`, replace the final line:

```js
  renderTextPreview(); // re-triggers FILL's refit against the new box dimensions, must run before save so the fitted size_px persists
  await saveProject();
  renderBoxPanel();
}
```

with:

```js
  renderTextPreview(); // re-triggers FILL's refit against the new box dimensions, must run before save so the fitted size_px persists
  await saveProject();
  renderBoxTab();
}
```

- [ ] **Step 5: Remove the three divider wirings**

In `static/panel-text.js`, delete these three lines (the box section and the composer now create and wire their own dividers):

```js
UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));
UI.divider(document.getElementById("text-box-border-position-divider"));
```

- [ ] **Step 6: Turn `#text-box-body` into a mount point**

In `static/index.html`, replace the whole block (lines 692-745):

```html
        <div id="text-box-body">

          <div class="style-group-label">SIZE</div>
          <div class="style-group">
            <div id="text-box-size-mode-group"></div>
          </div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-box-width-field"></label>
              <label id="text-box-height-field"></label>
            </div>
          </div>

          <div id="text-box-width-height-divider"></div>

          <div class="style-group">
            <div class="style-row">
              <div id="text-box-background-color-field"></div>
              <label id="text-box-background-opacity-field"></label>
            </div>
          </div>

          <div id="text-box-background-border-divider"></div>

          <div class="style-group-label">BORDER</div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-box-border-width-field"></label>
              <label id="text-box-border-radius-field"></label>
              <div id="text-box-border-color-field"></div>
            </div>
          </div>

          <div id="text-box-border-position-divider"></div>

          <div class="style-group-label">TEXT ALIGN</div>
          <div class="style-group">
            <div id="text-align-group"></div>
          </div>

          <div class="style-group-label">POSITION</div>
          <div class="style-group">
            <div id="position-row-group"></div>
            <div id="position-col-group"></div>
          </div>

          <div class="style-group">
            <div class="style-row">
              <label id="text-offset-x-field"></label>
              <label id="text-offset-y-field"></label>
            </div>
          </div>

        </div>
```

with a single line — `StyleTab.box` builds everything inside it:

```html
        <div id="text-box-body"></div>
```

- [ ] **Step 7: Drop the two dead script tags**

In `static/index.html`, delete:

```html
<script src="/static/text-panel-align.js"></script>
```

and

```html
<script src="/static/text-panel-position.js"></script>
```

- [ ] **Step 8: Drop the dead `#text-align-group` CSS selector**

In `static/css/components/style-panel.css`, in the rule edited in Task 2, delete the line:

```css
#text-align-group button,
```

leaving:

```css
#caption-align-group button,
.style-align-group button {
```

- [ ] **Step 9: Delete the two files**

```bash
git rm static/text-panel-align.js static/text-panel-position.js
```

- [ ] **Step 10: Verify the TEXT Box tab is unchanged**

Server still running (`.venv/Scripts/python -m uvicorn app.main:app --reload`). Hard-reload `http://127.0.0.1:8000`, open the throwaway project, select the text block, open the **TEXT** panel → **Box** tab.

1. Console is clean — no `ReferenceError: renderBoxPanel is not defined`, no `TextPanel.renderAlign is not a function`.
2. With SIZE on **FIT**: screenshot and compare against `box-tab-text-fit-before.png`. Expected: identical — SIZE label, FIT/FREE/FILL row, no WIDTH/HEIGHT, divider, background swatch + OPACITY, divider, BORDER label + BORDER/RADIUS/colour row, divider, TEXT ALIGN label + three 28x28 icon buttons, POSITION label + TOP/MID/BTM and LEFT/MID/RIGHT rows, HORIZONTAL/VERTICAL fields.
3. Click **FREE**: WIDTH and HEIGHT appear. Screenshot and compare against `box-tab-text-free-before.png`. Expected: identical.
4. Click **FIT**: WIDTH and HEIGHT disappear again.
5. Click **FILL**, then look at the stage: the heading resizes to fit the box. Reload the page and re-open the Box tab — SIZE is still FILL and the stage text is the same size (this is the "preview before save" ordering in Task 1's SIZE-mode handler; if the size jumps after reload, that ordering was lost).
6. Type `600` in WIDTH and `400` in HEIGHT — the box on the stage resizes live.
7. Click the background swatch, pick red — the box gets a red background. Drag OPACITY to 50 — it goes translucent.
8. Set BORDER to 6 and RADIUS to 24, pick a border colour — the stage box updates.
9. Click **TEXT ALIGN → right** — the text right-aligns on the stage and the right button is the pressed one.
10. **Anchor grid:** click **POSITION → BTM**. VERTICAL jumps to a value that puts the box's bottom edge on the canvas bottom, the stage box moves, **and no anchor cell stays highlighted**. Click **LEFT** — HORIZONTAL updates, box moves to the left margin, still no cell highlighted. Repeat with align set to `center` and confirm the box's visible left edge (not its centre) lands on the margin.
11. **Drag-resize on the stage** (this is the `handleBoxResizeEnd` call site you repointed): with SIZE on FIT, drag a corner handle of the text block on the stage. Expected: on mouse-up SIZE flips to **FREE**, and WIDTH/HEIGHT appear showing the dragged size. Now set SIZE to **FILL** and drag a handle again — SIZE stays on **FILL** and WIDTH/HEIGHT update.
12. **Drag-move on the stage** (`handleBoxMoveEnd` → `renderTextPanel()` → `renderBoxTab()`): drag the text block by its body. On mouse-up HORIZONTAL and VERTICAL show the new position.
13. Reload the page and confirm every value above persisted.

- [ ] **Step 11: Commit**

```bash
git add static/panel-text.js static/index.html static/css/components/style-panel.css
git commit -m "refactor: TEXT Box tab renders the shared style sections, renderBoxPanel removed"
```

---

## Task 6: Rewire the CAPTIONS panel's Box tab

**Files:**
- Modify: `static/panel-captions.js` (replace the `CaptionPanel.renderBox()` call, remove the three divider wirings, add `renderCaptionBoxTab()`)
- Modify: `static/index.html` (`#caption-box-body` becomes a mount point; drop one script tag)
- Modify: `static/css/components/style-panel.css` (drop the now-dead `#caption-align-group` selector)
- Delete: `static/caption-panel-box.js`

**Interfaces:**
- Consumes: `StyleTab.box` (Task 4), `StyleTarget.forCaptionTrack()` (Batch 1).
- Produces: `renderCaptionBoxTab()` — a file-local global in `panel-captions.js`. Removes the global `CaptionPanel.renderBox`.

`CaptionPanel.renderBox()` has exactly one call site: `static/panel-captions.js:73`.

- [ ] **Step 1: Replace the `CaptionPanel.renderBox()` call**

In `static/panel-captions.js`, in `renderCaptionPanel()`, replace:

```js
  CaptionPanel.renderCase();
  CaptionPanel.renderBox();
  CaptionPanel.renderHighlight();
```

with:

```js
  CaptionPanel.renderCase();
  renderCaptionBoxTab();
  CaptionPanel.renderHighlight();
```

- [ ] **Step 2: Add `renderCaptionBoxTab()`**

In `static/panel-captions.js`, between `renderCaptionPreview()` and `renderCaptionPanel()`, insert:

```js
// The Box tab's shared sections (StyleTab.box owns all the markup inside #caption-box-body) are
// built once and re-rendered on every panel render. sizeModes is false: a caption box is always
// a fixed size (word-wrap/pagination adapts to it — see preview-captions.js / app/ass_render.py),
// so there is no FIT/FREE/FILL group and WIDTH/HEIGHT are always visible. Built lazily for the
// same reason as panel-text.js's — Preview/project are not defined yet when this file loads.
let captionStyleTarget = null;
let captionBoxTab = null;

function renderCaptionBoxTab() {
  if (!captionStyleTarget) captionStyleTarget = StyleTarget.forCaptionTrack();
  if (!captionBoxTab) {
    captionBoxTab = StyleTab.box(document.getElementById("caption-box-body"), captionStyleTarget, { sizeModes: false });
  }
  captionBoxTab.render();
}
```

**If Batches 2-4 already declared `captionStyleTarget` in this file**, drop the `let captionStyleTarget = null;` line and the `if (!captionStyleTarget) ...` line and reuse theirs.

- [ ] **Step 3: Remove the three divider wirings**

In `static/panel-captions.js`, delete these three lines:

```js
UI.divider(document.getElementById("caption-box-width-height-divider"));
UI.divider(document.getElementById("caption-box-background-border-divider"));
UI.divider(document.getElementById("caption-box-border-position-divider"));
```

- [ ] **Step 4: Turn `#caption-box-body` into a mount point**

In `static/index.html`, replace the whole block (lines 272-321):

```html
          <div id="caption-box-body">

            <div class="style-group">
              <div class="style-row">
                <label id="caption-box-width-field"></label>
                <label id="caption-box-height-field"></label>
              </div>
            </div>

            <div id="caption-box-width-height-divider"></div>

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

            <div id="caption-box-border-position-divider"></div>

            <div class="style-group-label">TEXT ALIGN</div>
            <div class="style-group">
              <div id="caption-align-group"></div>
            </div>

            <div class="style-group-label">POSITION</div>
            <div class="style-group">
              <div id="caption-position-row-group"></div>
              <div id="caption-position-col-group"></div>
            </div>

            <div class="style-group">
              <div class="style-row">
                <label id="caption-offset-x-field"></label>
                <label id="caption-offset-y-field"></label>
              </div>
            </div>

          </div>
```

with:

```html
          <div id="caption-box-body"></div>
```

`panel-captions.js:98`'s `captionTabPanes.box` still resolves `#caption-box-body` and still toggles its `hidden` attribute — that wiring is untouched.

- [ ] **Step 5: Drop the dead script tag**

In `static/index.html`, delete:

```html
<script src="/static/caption-panel-box.js"></script>
```

- [ ] **Step 6: Drop the dead `#caption-align-group` CSS selector**

In `static/css/components/style-panel.css`, delete the line:

```css
#caption-align-group button,
```

leaving the rule's selector as just:

```css
.style-align-group button {
```

- [ ] **Step 7: Delete the file**

```bash
git rm static/caption-panel-box.js
```

- [ ] **Step 8: Verify the CAPTIONS Box tab is unchanged**

Hard-reload `http://127.0.0.1:8000`, open the throwaway project, open the **CAPTIONS** panel → **Box** tab.

1. Console clean — no `CaptionPanel.renderBox is not a function`.
2. Screenshot and compare against `box-tab-caption-before.png`. Expected: identical — **no SIZE label and no FIT/FREE/FILL group**, WIDTH/HEIGHT visible at the top, divider, background swatch + OPACITY, divider, BORDER label + row, divider, TEXT ALIGN (three 28x28 icon buttons), POSITION grid, HORIZONTAL/VERTICAL.
3. Change WIDTH to 700 and HEIGHT to 300 — the caption box on the stage resizes and the caption text re-paginates to fit it.
4. Background colour + OPACITY, BORDER width/radius/colour — each updates the stage caption box.
5. TEXT ALIGN → left — caption text left-aligns.
6. POSITION → **TOP** then **RIGHT**: VERTICAL/HORIZONTAL update, the box moves, and no anchor cell stays highlighted.
7. Reload and confirm everything persisted.
8. Re-open the **TEXT** panel → Box tab and confirm it is still correct — both panels now share one code path, so a caption-side change that broke TEXT would show here.

- [ ] **Step 9: Commit**

```bash
git add static/panel-captions.js static/index.html static/css/components/style-panel.css
git commit -m "refactor: CAPTIONS Box tab renders the shared style sections"
```

---

## Task 7: Batch verification and codebase map

**Files:**
- Modify: `CLAUDE.md` (file structure tree + inventory entries for the three new files, the three deleted ones, and `renderBoxPanel()`'s removal)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Documentation only.

Batch 6 does the final sweep of `CLAUDE.md`; this task records only the files this batch added, moved or deleted, so the map is never stale at rest.

- [ ] **Step 1: Confirm nothing references the deleted globals**

```bash
grep -rn "renderBoxPanel\|TextPanel.renderAlign\|TextPanel.renderPosition\|CaptionPanel.renderBox" static/
```

Expected: no output.

```bash
grep -rn "text-box-size-mode-group\|text-box-width-field\|text-align-group\|position-row-group\|text-offset-x-field\|caption-box-width-field\|caption-align-group\|caption-position-row-group\|caption-offset-x-field\|box-width-height-divider\|box-background-border-divider\|box-border-position-divider" static/
```

Expected: no output — every one of those ids is gone from both the markup and the JS.

- [ ] **Step 2: Run both test suites**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, 39 tests across 5 files — unchanged by this batch, which adds no pure module.

```bash
.venv/Scripts/python -m pytest -q
```

Expected: PASS, unchanged — this batch touches no backend file.

- [ ] **Step 3: Final absence-of-change check**

Hard-reload `http://127.0.0.1:8000` on the throwaway project one last time and put the three "after" screenshots next to the three from Task 1 Step 1:

| Before | After | Expected |
|---|---|---|
| `box-tab-text-fit-before.png` | TEXT Box tab, SIZE = FIT | identical |
| `box-tab-text-free-before.png` | TEXT Box tab, SIZE = FREE | identical |
| `box-tab-caption-before.png` | CAPTIONS Box tab | identical |

Any difference in spacing, label position, divider position, button size or field width is a bug in this batch, not an improvement. The two most likely culprits, if a difference shows up:

- **Tighter spacing above a divider or above the TEXT ALIGN / POSITION label** → the `.style-section:not(:last-child) > .style-group:last-child` rule from Task 4 Step 2 is missing or was not applied.
- **TEXT ALIGN buttons wider than 28px or with the icon off-centre** → `.style-align-group` is missing from the group element in `style-section-align.js`, or the CSS selector was not added in Task 2 Step 2.

Then run one cross-panel regression pass: undo (Ctrl+Z) a Box-tab change on each panel and confirm one press undoes one click (not two), and switch projects and back to confirm the cached target and tab handle survive a `project` swap.

- [ ] **Step 4: Update `CLAUDE.md`'s file structure tree**

Under `static/`, delete these three lines:

```
  text-panel-align.js        # TEXT panel Box tab: TEXT ALIGN button group
  text-panel-position.js     # TEXT panel Box tab: absolute x/y pixel fields + stateless anchor-grid shortcut, edge-flush against the block's actual rendered size (panel-text.js's anchorPositionX/Y + Preview.getTextBoxSize, added 2026-07-22, positioning-rules)
```

and

```
  caption-panel-box.js          # CAPTIONS panel Box tab: fixed WIDTH/HEIGHT (no FIT/FREE/FILL toggle — captions are always a fixed size, unlike TEXT blocks; word-wrap/pagination adapts to the box instead, see preview-captions.js/app/ass_render.py, removed 2026-07-24 caption box sizing) + background/border + TEXT ALIGN/POSITION (combines editor.js's renderBoxPanel() with text-panel-align.js/text-panel-position.js), against the caption track's preset; POSITION anchor grid shares panel-text.js's anchorPositionX/Y + Preview.getCaptionBoxSize (2026-07-22, positioning-rules)
```

and add, alongside the other `style-section-*.js` entries:

```
  style-section-box.js       # Shared Box-tab section (added 2026-07-29, shared style sections batch 5): SIZE mode FIT/FREE/FILL + WIDTH/HEIGHT + background colour/opacity + border width/radius/colour, built once and refreshed via render(); `{ sizeModes }` is true for TEXT and false for CAPTIONS (always-fixed box, no SIZE group, WIDTH/HEIGHT always visible). Every write is target.setPresetField — no box field is FormatRun-capable
  style-section-align.js     # Shared Box-tab section (added 2026-07-29, batch 5): the TEXT ALIGN icon button group, styled via `.style-align-group` in style-panel.css (replacing the old #text-align-group/#caption-align-group id selectors)
  style-section-position.js  # Shared Box-tab section (added 2026-07-29, batch 5): HORIZONTAL/VERTICAL pixel fields + the stateless 3x3 anchor grid, computing edge-flush values via panel-text.js's anchorPositionX(value, boxWidth, align)/anchorPositionY(value, boxHeight) against target.getBoxSize(), then target.rerenderPanel(); render() clears the grid's aria-pressed so no cell stays lit
  style-tab-box.js           # Box-tab composer (added 2026-07-29, batch 5): StyleTab.box(container, target, { sizeModes }) renders the box, align and position sections in that fixed order into one tab body, owning the border -> TEXT ALIGN divider between the box and align sections
```

- [ ] **Step 5: Update `CLAUDE.md`'s `panel-text.js` and `panel-captions.js` entries**

In the `static/` tree's `panel-text.js` entry, replace the mention of `renderBoxPanel()`:

> `renderTextPanel`/`renderBoxPanel`

with:

> `renderTextPanel`/`renderBoxTab`

and add to the end of that entry:

> As of 2026-07-29 (shared style sections batch 5) `renderBoxPanel()` is gone: the Box tab's markup and controls live in `static/style-tab-box.js` + `static/style-section-{box,align,position}.js`, mounted into the now-empty `#text-box-body` by the file-local `renderBoxTab()`, which builds `StyleTarget.forTextBlock()` and `StyleTab.box(..., { sizeModes: true })` lazily on first render and calls `.render()` thereafter. `handleBoxResizeEnd()` calls `renderBoxTab()` where it used to call `renderBoxPanel()`.

In the `panel-captions.js` entry, add:

> As of 2026-07-29 (shared style sections batch 5) `CaptionPanel.renderBox` is gone: the file-local `renderCaptionBoxTab()` mounts `StyleTab.box(..., { sizeModes: false })` into the now-empty `#caption-box-body`.

- [ ] **Step 6: Update the Inventory's "Text blocks & rich-text formatting" and "Captions & transcription" entries**

In the **Text blocks & rich-text formatting** section, replace the `static/text-panel-align.js` / `static/text-panel-position.js` mentions in the combined `text-panel-*.js` bullet with a pointer to the shared sections, e.g. append to that bullet:

> TEXT ALIGN and POSITION moved to the shared `static/style-section-align.js` / `static/style-section-position.js` (2026-07-29, batch 5) and are no longer TEXT-only files.

In the **Captions & transcription** section, replace the `caption-panel-box.js` bullet with:

> - CAPTIONS' Box tab is `static/style-tab-box.js` with `{ sizeModes: false }` (2026-07-29, batch 5, replacing `caption-panel-box.js`) — no FIT/FREE/FILL toggle, WIDTH/HEIGHT unconditionally visible, since the caption box is always a fixed size and word-wrap/pagination adapts to it (see `preview-captions.js` / `app/caption_layout.py`).

- [ ] **Step 7: Add `.style-section` and `.style-align-group` to the Shared UI components inventory**

In the `static/css/components/style-panel.css` bullet under **Shared UI components**, append:

> Also holds `.style-section` (added 2026-07-29, batch 5: `display: contents` wrapper a `StyleTab.*` composer puts around each `StyleSection.*`, plus the `:not(:last-child) > .style-group:last-child` rule that restores the bottom margin wrapping would otherwise drop) and `.style-align-group` (the class form of the old `#text-align-group`/`#caption-align-group` 28x28 icon-button rule, now that one shared align section renders in both panels).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the shared Box-tab sections in the codebase map"
```

---

## Batch 5 done when

- `static/style-section-box.js`, `static/style-section-align.js`, `static/style-section-position.js` and `static/style-tab-box.js` exist, each opening with a purpose comment, and are loaded by `static/index.html` in the master plan's order.
- `renderBoxPanel()` no longer exists in `static/panel-text.js`, and all three of its call sites (lines 175, 205, 268) are accounted for — 175 and 268 now call `renderBoxTab()`, 205 is the box section's own internal `render()`.
- `static/text-panel-align.js`, `static/text-panel-position.js` and `static/caption-panel-box.js` are deleted, along with their three `<script>` tags.
- `#text-box-body` and `#caption-box-body` are single empty `<div>`s in `static/index.html`; every `#text-box-*`, `#caption-box-*`, `#*-align-group`, `#position-*-group` and `#*-offset-*-field` id is gone from both the markup and the JS.
- Every write in every new file is `target.setPresetField(...)`; there is no `target.setField(...)` call anywhere in this batch.
- The TEXT Box tab still shows SIZE FIT/FREE/FILL, hides WIDTH/HEIGHT in FIT, and flips to FREE (or stays on FILL) after a stage drag-resize.
- The CAPTIONS Box tab still has no SIZE group and always shows WIDTH/HEIGHT.
- The anchor grid leaves no cell highlighted after a click, on either panel.
- All three after-screenshots are pixel-identical to the Task 1 Step 1 before-screenshots.
- `node --test "tests/js/**/*.test.js"` passes with 39 tests; `.venv/Scripts/python -m pytest -q` passes.
- Seven commits, one per task.
