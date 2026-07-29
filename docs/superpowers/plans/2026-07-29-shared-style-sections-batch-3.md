# Batch 3 — Size, emphasis, color

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints**, **Interface contract**, **Script load order** and **Verification procedure** first — they apply to every task here and are authoritative over anything below.

**Deliverable:** `static/style-section-size.js`, `static/style-section-emphasis.js` and `static/style-section-color.js`, composed into `StyleTab.design` after `fontFamily` and `fontWeight`; the corresponding markup deleted from both panels in `static/index.html`; and `text-panel-font-style.js`, `caption-panel-font-style.js`, `text-panel-case.js`, `caption-panel-case.js` deleted.

**Why this batch:** these three control groups are where the TEXT and CAPTIONS panels have visibly drifted the furthest. Sharing them lands three of the seven resolved divergences at once and fixes a real bug in TEXT's step-up button. They also sit exactly on the `setField` / `setPresetField` seam — SIZE, Italic, Underline and Color are `FormatRun`-capable, the case group is not — so this is the batch that proves the target adapter actually carries its weight.

---


## Amendments from the master-plan reconciliation (2026-07-29)

Batches 2-6 were drafted in parallel and disagreed on three points. The master plan is
now the single authority; where a snippet below contradicts it, **the master plan wins**.

- **The composer snippet keeps `sampleText` and `compactSizeRow`.** Batch 2 added
  `sampleText` after this file was drafted; the snippets here have been corrected. When
  editing `style-tab-design.js`, carry all four options forward.
- **`StyleSection.size` takes `{ compactRow }`.** CAPTIONS' size-row alignment was raised
  and **declined**, so the difference must be preserved, not converged. The section emits
  `.style-size-row` always and `.style-size-row--compact` when `compactRow` is true; TEXT
  passes it, CAPTIONS does not. The old `#text-size-row` rules move to those classes.
- **The `.style-section` wrapper and its CSS already exist** from Batch 2. Skip any step
  that adds them; do not re-add the `:last-child` fix.
- **`UI.numberField` gains a `setDisabled` property on its returned function** (master
  plan, "`UI.numberField` and the `disabled` state`"). Attach it to the returned function
  rather than changing the return type, so existing callers are unaffected. Do not reach
  into the built DOM from `render()`.

---

## Assumed state after Batch 2

**`docs/superpowers/plans/2026-07-29-shared-style-sections-batch-2.md` did not exist when this file was written.** The pattern below is derived from the master plan's Interface contract and Script load order sections. Before starting Task 1, open `static/style-tab-design.js` and `static/panel-text.js` and confirm the four assumptions; where Batch 2 chose different names, use *its* names and do not introduce new ones.

1. `static/style-section-font-family.js` and `static/style-section-font-weight.js` exist and expose `StyleSection.fontFamily(container, target, { host })` / `StyleSection.fontWeight(container, target, { host })`, each returning `{ render() }` and each building its own row into `container`.
2. `static/style-tab-design.js` exists and exposes `StyleTab.design(container, target, options) -> { render() }`, currently composing exactly `fontFamily` then `fontWeight`.
3. Each panel owns one mount element inside its Design-tab body and one `StylePanelHost`, built once at load:
   - TEXT: mount `<div id="text-design-sections" class="style-sections"></div>` as the **first child of `#text-font-body`**; host `StylePanelHost(document.getElementById("panel-text-main"), document.getElementById("panel-text"))`.
   - CAPTIONS: mount `<div id="caption-design-sections" class="style-sections"></div>` as the **first child of `#caption-font-body`**; host `StylePanelHost(document.getElementById("panel-captions-main"), document.getElementById("panel-captions"))`.
4. `renderTextPanel()` / `renderCaptionPanel()` call `designTab.render()` instead of `TextPanel.renderFontFamily()` / `await TextPanel.renderFontWeight()` (and the caption equivalents), and call `host.closeAll()` instead of hand-hiding `#panel-text-font` / `#panel-text-weight`.

Everything Batch 3 adds goes **into the same mount**, so the not-yet-migrated Outline / Shadow / Highlight markup keeps sitting below it and the on-screen order stays correct throughout this batch.

---

## What a user can see change in this batch

Three of the seven "Resolved divergences" from the spec land here. Each gets its own verification step in Task 4.

| # | Divergence | Before | After |
|---|---|---|---|
| a | Row order | TEXT: Font Family → Weight → SIZE. CAPTIONS: Font Family → **SIZE → Weight** (`index.html:229` sits between `#caption-font-row` and `#caption-weight-row`). | Font Family → Weight → SIZE on both. |
| b | Case buttons | TEXT: inline on the Italic/Underline row (`#text-case-group class="btn-group-inline"`, `index.html:671`). CAPTIONS: its own `.style-group` (`index.html:255-257`), the class was never copied. | Inline on the Italic/Underline row on both. |
| c | Font-size scale | TEXT: `[12,14,16,18,21,24,36,45,56]` (`text-panel-font-style.js:53`). CAPTIONS: `[12,…,56,72,96]` (`caption-panel-font-style.js:20`). | One scale `[12,14,16,18,21,24,36,45,56,72,96]` from `FontSizeScale` for both. |

**(c) fixes a real bug.** `panel-text.js:41` defaults a new text block to `size_px: 96`, but TEXT's scale stopped at 56, so `stepFontSizePreset(96, +1)` found no larger entry and fell through to `FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1]` — 56. Clicking **step up** on a fresh text block therefore made the text *smaller*. Task 4 has a dedicated step that proves this is gone.

**A fourth, undocumented divergence is also closed here.** `static/css/components/style-panel.css:95-98` styles the size row by id:

```css
#text-size-row { gap: 6px; align-items: end; }
#text-size-row .number-field-label { margin-left: -34px; }
```

There is no `#caption-size-row` counterpart, so CAPTIONS' size row has always used the default 8px gap and centre alignment with the SIZE label indented under the field. A markup-owning section can only emit one class, so Task 1 turns these into `.style-size-row` and CAPTIONS gains TEXT's tighter layout. This is not in the spec's table; it is the same class of accident and TEXT is again the more finished side.

---

## Task 1: Size section

**Files:**
- Create: `static/style-section-size.js`
- Modify: `static/css/components/style-panel.css`
- Modify: `static/index.html` (one `<script>` tag)

**Interfaces:**
- Consumes: `FontSizeScale.stepFontSizePreset(currentSize, direction)` and `FontSizeScale.FONT_SIZE_PRESETS` (Batch 1, `static/font-size-scale.js`); `UI.numberField(container, opts) -> setValue(v)` (`static/ui-number-field.js`); `target.getFieldValue`, `target.setField`, `target.getPreset` (Batch 1).
- Produces: `window.StyleSection.size(container, target) -> { render() }`. Task 4's `style-tab-design.js` calls it.

**Not unit-tested** — it builds DOM. All of its decision logic already lives in `FontSizeScale` (tested in Batch 1) and in the style target (tested in Batch 1). Verified in the browser in Task 4.

- [ ] **Step 1: Write the section**

Create `static/style-section-size.js`:

```js
// Shared SIZE control for the TEXT and CAPTIONS Design tabs: the SIZE (PX) number field
// flanked by the two font-size stepper buttons. Builds its own markup and writes through the
// style target, so a TEXT selection lands on a per-range FormatRun instead of the base preset.
window.StyleSection = window.StyleSection || {};

(() => {
  // Copied verbatim from the two hand-written copies in index.html (Lucide a-arrow-down /
  // a-arrow-up), so the icons are byte-identical after the move into JS.
  const STEP_DOWN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>';
  const STEP_UP_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 11 4-4 4 4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>';

  function stepButton(icon, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn col-1";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = icon;
    return btn;
  }

  // options: none. Signature stays (container, target) per the master plan's
  // StyleSection.<name>(container, target, options) shape — callers pass {}, unused here.
  window.StyleSection.size = function size(container, target) {
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row style-size-row";
    group.appendChild(row);

    const stepDown = stepButton(STEP_DOWN_ICON, "Decrease font size");
    const fieldEl = document.createElement("label");
    const stepUp = stepButton(STEP_UP_ICON, "Increase font size");
    row.append(stepDown, fieldEl, stepUp);
    container.appendChild(group);

    // Built ONCE. UI.numberField wipes and rebuilds its container, so calling it again from
    // render() would drop the listener below — render() only pushes value + disabled state.
    const setFieldValue = UI.numberField(fieldEl, {
      label: "SIZE", unit: "PX", value: target.getFieldValue("size_px"),
      min: 24, max: 200, span: 6,
      onChange: (v) => target.setField("size_px", v),
    });

    // size_px is FormatRun-capable: setField, never setPresetField. getFieldValue is what
    // makes stepping relative to the SELECTION's size when one is active, not the block's.
    function step(direction) {
      const next = FontSizeScale.stepFontSizePreset(target.getFieldValue("size_px"), direction);
      target.setField("size_px", next);
      setFieldValue(next);
    }
    stepDown.addEventListener("click", () => step(-1));
    stepUp.addEventListener("click", () => step(1));

    return {
      render() {
        // BOX SIZE mode FILL computes size_px automatically (preview.js's maybeRefitFillText):
        // the field keeps showing the live value but must not be typeable or steppable.
        // box_width_mode is never a FormatRun field, so it is read off the preset directly.
        const disabled = target.getPreset().box_width_mode === "fill";
        stepDown.disabled = disabled;
        stepUp.disabled = disabled;
        fieldEl.querySelectorAll("input, .number-field-step")
          .forEach((el) => { el.disabled = disabled; });
        setFieldValue(target.getFieldValue("size_px"));
      },
    };
  };
})();
```

- [ ] **Step 2: Turn the size-row styling from an id rule into a class**

In `static/css/components/style-panel.css`, replace lines 93-98 — leave them in the same position in the file, after `.style-row`, so the class-vs-class cascade still lets these win:

```css
/* end-aligned so the flanking quick-size buttons (28px) sit flush with the field's bottom
   edge instead of centering against the row's full height (label + input). */
.style-size-row { gap: 6px; align-items: end; }
/* Pulls the SIZE (PX) label flush with the decrease-button's left edge (col-1 width + row gap),
   instead of starting under the field itself (col-2). */
.style-size-row .number-field-label { margin-left: -34px; }
```

This was `#text-size-row` — an id rule TEXT had and CAPTIONS silently lacked. `static/style-section-size.js` puts `.style-size-row` on the row it builds, so both panels now get it.

- [ ] **Step 3: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-font-weight.js"></script>` line Batch 2 added, insert:

```html
<script src="/static/style-section-size.js"></script>
```

- [ ] **Step 4: Verify the app still loads clean**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, open a **throwaway** project, open the browser console.

Expected: no errors. Both panels look and behave exactly as before — nothing calls `StyleSection.size` yet, and the old `#text-size-row` markup is still there but now unstyled by the deleted id rule, so **the TEXT SIZE row's label shifts right and its gap widens by 2px**. That regression is expected and disappears in Task 4 when the section replaces the markup. Typing `StyleSection.size` in the console prints a function.

- [ ] **Step 5: Run the JS suite**

```bash
node --test tests/js
```

Expected: PASS, unchanged from Batch 2 (this task adds no tests).

- [ ] **Step 6: Commit**

```bash
git add static/style-section-size.js static/css/components/style-panel.css static/index.html
git commit -m "feat: shared SIZE style section on the one font-size scale"
```

---

## Task 2: Emphasis section

**Files:**
- Create: `static/style-section-emphasis.js`
- Modify: `static/index.html` (one `<script>` tag)

**Interfaces:**
- Consumes: `UI.buttonGroup(container, options, activeValue, onSelect) -> setActive(value)` (`static/ui-button-group.js`); `target.getFieldValue`, `target.setField`, `target.setPresetField` (Batch 1); `.icon-btn` and `.btn-group-inline` from `static/css/components/button-group.css`.
- Produces: `window.StyleSection.emphasis(container, target) -> { render() }`. Task 4's `style-tab-design.js` calls it.

**Not unit-tested** — DOM only, no decision logic beyond the field/preset split. Verified in the browser in Task 4.

**The one thing to get right:** Italic and Underline are `FormatRun`-capable and use `target.setField`. The case group is **not** — `text_case` has no `FormatRun` override anywhere in `app/models.py`, so it uses `target.setPresetField`. On the CAPTIONS panel both do the same thing, so this only shows up in Task 4's TEXT-with-a-selection check.

- [ ] **Step 1: Write the section**

Create `static/style-section-emphasis.js`:

```js
// Shared emphasis row for the TEXT and CAPTIONS Design tabs: Italic and Underline toggles plus
// the lowercase / UPPERCASE / As-typed case group, all on ONE .style-row via .btn-group-inline.
// Builds its own markup. italic/underline write through target.setField (FormatRun-capable);
// text_case writes through target.setPresetField (whole-preset only, no per-range override).
window.StyleSection = window.StyleSection || {};

(() => {
  const ITALIC_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>';
  const UNDERLINE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>';

  // Copied verbatim — SVG paths included — from text-panel-case.js, which caption-panel-case.js
  // held a byte-identical second copy of. This is now the only copy.
  const CASE_OPTIONS = [
    {
      value: "lower", label: "LOWERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3" /><path d="M10 9v6" /><circle cx="17" cy="12" r="3" /><path d="M14 7v8" /></svg>',
    },
    {
      value: "upper", label: "UPPERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><path d="M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4" /></svg>',
    },
    {
      value: "none", label: "AS TYPED", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><circle cx="18" cy="12" r="3" /><path d="M21 9v6" /></svg>',
    },
  ];

  function toggleButton(icon, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn col-1";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = icon;
    return btn;
  }

  // options: none.
  window.StyleSection.emphasis = function emphasis(container, target) {
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row";
    group.appendChild(row);

    const italicBtn = toggleButton(ITALIC_ICON, "Italic");
    const underlineBtn = toggleButton(UNDERLINE_ICON, "Underline");

    // .btn-group-inline is display:contents, so UI.buttonGroup's three buttons become direct
    // grid items of THIS .style-row and sit beside the two toggles instead of opening their
    // own grid one row below. This is the resolved layout; CAPTIONS gains it here.
    const caseGroupEl = document.createElement("div");
    caseGroupEl.className = "btn-group-inline";

    row.append(italicBtn, underlineBtn, caseGroupEl);
    container.appendChild(group);

    // Built ONCE, same rule as the SIZE field: UI.buttonGroup wipes its container.
    function wireToggle(btn, field) {
      btn.addEventListener("click", () => {
        const next = !target.getFieldValue(field);
        target.setField(field, next);   // FormatRun-capable
        btn.setAttribute("aria-pressed", String(next));
      });
    }
    wireToggle(italicBtn, "italic");
    wireToggle(underlineBtn, "underline");

    const setActiveCase = UI.buttonGroup(caseGroupEl, CASE_OPTIONS,
      target.getFieldValue("text_case") || "none",
      // text_case has no FormatRun equivalent — always a whole-preset write.
      (value) => target.setPresetField("text_case", value));

    return {
      render() {
        italicBtn.setAttribute("aria-pressed", String(!!target.getFieldValue("italic")));
        underlineBtn.setAttribute("aria-pressed", String(!!target.getFieldValue("underline")));
        setActiveCase(target.getFieldValue("text_case") || "none");
      },
    };
  };
})();
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-size.js"></script>` line, insert:

```html
<script src="/static/style-section-emphasis.js"></script>
```

- [ ] **Step 3: Verify the app still loads clean**

Reload `http://127.0.0.1:8000` on the throwaway project.

Expected: no console errors; both panels unchanged (nothing calls `StyleSection.emphasis` yet). `StyleSection.emphasis` prints a function in the console.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-emphasis.js static/index.html
git commit -m "feat: shared emphasis style section with the case group inline"
```

---

## Task 3: Color section

**Files:**
- Create: `static/style-section-color.js`
- Modify: `static/index.html` (one `<script>` tag)

**Interfaces:**
- Consumes: `UI.settingsRow(container, opts) -> setValue(value, valueFontFamily, swatchColor)` (`static/ui-settings-row.js`); `UI.colorSwatch(container, opts) -> setValue(hex)` (`static/ui-color-swatch.js`); `options.host.page(title, buildBody) -> { open(), close(), bodyEl }` (Batch 1, `static/style-panel-host.js`); `target.getFieldValue`, `target.setField`.
- Produces: `window.StyleSection.color(container, target, { host }) -> { render() }`. Task 4's `style-tab-design.js` calls it with the panel's host.

**Not unit-tested** — DOM only. Verified in the browser in Task 4.

- [ ] **Step 1: Write the section**

Create `static/style-section-color.js`:

```js
// Shared Color control for the TEXT and CAPTIONS Design tabs: a settings row showing the current
// colour as a swatch + hex, opening a drill-down subpage that holds the colour picker itself.
// Builds its own markup; colour is FormatRun-capable, so it writes through target.setField.
window.StyleSection = window.StyleSection || {};

// options: { host } — the panel's StylePanelHost, which owns the drill-down subpage.
window.StyleSection.color = function color(container, target, options) {
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // The host rebuilds a subpage's body on every open(), by design, so the swatch is created
  // here rather than in the factory. That is the host's contract — not a per-render rebuild.
  const page = options.host.page("Color", (body) => {
    const bodyGroup = document.createElement("div");
    bodyGroup.className = "style-group";
    const swatchEl = document.createElement("label");
    bodyGroup.appendChild(swatchEl);
    body.appendChild(bodyGroup);

    UI.colorSwatch(swatchEl, {
      label: "Color", value: target.getFieldValue("color"), span: 8,
      onChange: (v) => {
        target.setField("color", v);   // FormatRun-capable
        // Keep the row behind the subpage in sync; the old code re-ran the whole
        // renderFontStyle() for this one swatch.
        setRowValue(v, null, v);
      },
    });
  });

  // Built ONCE — UI.settingsRow wipes its container, and render() uses the returned setter.
  const setRowValue = UI.settingsRow(rowEl, {
    label: "Color",
    value: target.getFieldValue("color"),
    swatchColor: target.getFieldValue("color"),
    onClick: () => page.open(),
  });

  return {
    render() {
      const v = target.getFieldValue("color");
      setRowValue(v, null, v);
    },
  };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-emphasis.js"></script>` line, insert:

```html
<script src="/static/style-section-color.js"></script>
```

The three new tags now sit between `style-section-font-weight.js` and `style-tab-design.js`, matching the master plan's Script load order.

- [ ] **Step 3: Verify the app still loads clean**

Reload `http://127.0.0.1:8000` on the throwaway project.

Expected: no console errors; both panels unchanged. `StyleSection.color` prints a function in the console.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-color.js static/index.html
git commit -m "feat: shared Color style section with its drill-down subpage"
```

---

## Task 4: Switch both panels over

**Files:**
- Modify: `static/style-tab-design.js`
- Modify: `static/index.html` (delete markup from `#text-font-body` and `#caption-font-body`, delete `#panel-text-color` and `#panel-captions-color`, delete four `<script>` tags)
- Modify: `static/panel-text.js` (delete two render calls)
- Modify: `static/panel-captions.js` (delete two render calls)
- Delete: `static/text-panel-font-style.js`, `static/caption-panel-font-style.js`, `static/text-panel-case.js`, `static/caption-panel-case.js`

**Interfaces:**
- Consumes: `StyleSection.size`, `StyleSection.emphasis` (Tasks 1-2, called as `(container, target, {})`), `StyleSection.color` (Task 3, called as `(container, target, { host })`).
- Produces: `StyleTab.design(container, target, { host }) -> { render() }`, now composing five sections in the fixed order `fontFamily, fontWeight, size, emphasis, color`.

**This task is atomic.** Both panels call the same `StyleTab.design`, so the composer cannot grow for one panel only; and `text-panel-font-style.js` calls `document.getElementById("text-italic").addEventListener(...)` at IIFE load time, so deleting its markup without deleting the file throws on page load. Composer, markup and files move together or the app is broken at rest.

- [ ] **Step 1: Extend the design-tab composer**

Replace the whole of `static/style-tab-design.js` with:

```js
// Design-tab composer: renders the shared style sections in ONE fixed order for both the TEXT
// and CAPTIONS panels. This file is the single place that order is defined — which is what
// stops the two panels from being laid out differently ever again.
window.StyleTab = window.StyleTab || {};

// options: { host } — the panel's StylePanelHost, handed to every section that owns a
// drill-down subpage. (highlightModes arrives in Batch 4.)
window.StyleTab.design = function design(container, target, options) {
  const opts = options || {};

  // The resolved TEXT layout (see the spec's "Resolved divergences"):
  // Font Family -> Weight -> SIZE -> Italic/Underline/case -> Color.
  const sections = [
    StyleSection.fontFamily(container, target, { host: opts.host }),
    StyleSection.fontWeight(container, target, { host: opts.host, sampleText: opts.sampleText }),
    StyleSection.size(container, target, { compactRow: opts.compactSizeRow }),
    StyleSection.emphasis(container, target, {}),
    StyleSection.color(container, target, { host: opts.host }),
  ];

  return {
    render() {
      // fontWeight.render() is async (it awaits Api.listFontWeights); callers may ignore the
      // returned promise, exactly as panel-text.js does today.
      return Promise.all(sections.map((s) => s.render()));
    },
  };
};
```

If Batch 2 wrote its `fontFamily` / `fontWeight` lines differently (different option keys, a different `render()` shape), **keep Batch 2's lines verbatim** and insert only the three new entries in the order shown.

- [ ] **Step 2: Delete the TEXT panel's size row**

In `static/index.html`, delete this whole block from `#text-font-body` (currently around line 650):

```html
          <div class="style-group">
            <div class="style-row" id="text-size-row">
              <button class="icon-btn col-1" id="text-size-step-down" type="button" aria-label="Decrease font size" title="Decrease font size">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
              </button>
              <label id="text-size-field"></label>
              <button class="icon-btn col-1" id="text-size-step-up" type="button" aria-label="Increase font size" title="Increase font size">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 11 4-4 4 4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
              </button>
            </div>
          </div>
```

- [ ] **Step 3: Delete the TEXT panel's emphasis row and Color row**

In `static/index.html`, delete these two consecutive blocks from `#text-font-body` (currently around line 663):

```html
          <div class="style-group">
            <div class="style-row">
              <button class="icon-btn col-1" id="text-italic" type="button" aria-pressed="false" title="Italic">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
              </button>
              <button class="icon-btn col-1" id="text-underline" type="button" aria-pressed="false" title="Underline">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
              </button>
              <div id="text-case-group" class="btn-group-inline"></div>
            </div>
          </div>

          <div class="style-group">
            <div id="text-color-row" class="col-8"></div>
          </div>
```

After this step `#text-font-body` holds only the Batch 2 mount `<div id="text-design-sections" class="style-sections"></div>` followed by the `#text-outline-row`, `#text-shadow-row` and `#text-highlight-row` groups.

- [ ] **Step 4: Delete the TEXT colour subpanel**

In `static/index.html`, delete this block (currently around line 780, a sibling of `#panel-text-main`):

```html
        <div id="panel-text-color" hidden>
          <div id="text-color-subpanel-header"></div>
          <div class="style-group">
            <label id="text-color-color-field"></label>
          </div>
        </div>
```

- [ ] **Step 5: Delete the CAPTIONS panel's size row**

In `static/index.html`, delete this whole block from `#caption-font-body` (currently around line 227). It sits **between** `#caption-font-row` and `#caption-weight-row` — deleting it here is what lands divergence (a):

```html
            <div class="style-group">
              <div class="style-row" id="caption-size-row">
                <button class="icon-btn col-1" id="caption-size-step-down" type="button" aria-label="Decrease font size" title="Decrease font size">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 12 4 4 4-4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
                </button>
                <label id="caption-size-field"></label>
                <button class="icon-btn col-1" id="caption-size-step-up" type="button" aria-label="Increase font size" title="Increase font size">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 11 4-4 4 4"/><path d="M18 16V7"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/></svg>
                </button>
              </div>
            </div>
```

- [ ] **Step 6: Delete the CAPTIONS panel's emphasis, case and Color rows**

In `static/index.html`, delete these three consecutive blocks from `#caption-font-body` (currently around line 243). Note the case group is in its **own** `.style-group` here and lacks `btn-group-inline` — that is divergence (b), and deleting it is what lands the fix:

```html
            <div class="style-group">
              <div class="style-row">
                <button class="icon-btn col-1" id="caption-italic" type="button" aria-pressed="false" title="Italic">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
                </button>
                <button class="icon-btn col-1" id="caption-underline" type="button" aria-pressed="false" title="Underline">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
                </button>
              </div>
            </div>

            <div class="style-group">
              <div id="caption-case-group"></div>
            </div>

            <div class="style-group">
              <div id="caption-color-row" class="col-8"></div>
            </div>
```

After this step `#caption-font-body` holds only the Batch 2 mount `<div id="caption-design-sections" class="style-sections"></div>` followed by the `#caption-outline-row` and `#caption-shadow-row` groups.

- [ ] **Step 7: Delete the CAPTIONS colour subpanel**

In `static/index.html`, delete this block (currently around line 383, a sibling of `#panel-captions-main`):

```html
        <div id="panel-captions-color" hidden>
          <div id="caption-color-subpanel-header"></div>
          <div class="style-group">
            <label id="caption-color-color-field"></label>
          </div>
        </div>
```

- [ ] **Step 8: Swap the script tags**

In `static/index.html`, delete these four lines (currently 875, 880, 892, 899):

```html
<script src="/static/caption-panel-font-style.js"></script>
<script src="/static/caption-panel-case.js"></script>
<script src="/static/text-panel-font-style.js"></script>
<script src="/static/text-panel-case.js"></script>
```

The three replacement tags were already added in Tasks 1-3. Confirm no tag remains for a deleted file:

```bash
grep -n "panel-font-style\|panel-case" static/index.html
```

Expected: no output.

- [ ] **Step 9: Drop the old render calls from the TEXT panel**

In `static/panel-text.js`, inside `renderTextPanel()`, delete these two lines (currently 169 and 173):

```js
  TextPanel.renderFontStyle();
```

```js
  TextPanel.renderCase();
```

Both are now covered by the `designTab.render()` call Batch 2 introduced. Leave every other call in that block untouched.

- [ ] **Step 10: Drop the old render calls from the CAPTIONS panel**

In `static/panel-captions.js`, inside `renderCaptionPanel()`, delete these two lines (currently 69 and 72):

```js
  CaptionPanel.renderFontStyle();
```

```js
  CaptionPanel.renderCase();
```

- [ ] **Step 11: Delete the four superseded files**

```bash
git rm static/text-panel-font-style.js static/caption-panel-font-style.js static/text-panel-case.js static/caption-panel-case.js
```

- [ ] **Step 12: Confirm nothing still references the deleted ids or functions**

```bash
grep -rn "text-size-row\|caption-size-row\|text-case-group\|caption-case-group\|text-color-row\|caption-color-row\|text-size-field\|caption-size-field\|text-italic\|caption-italic\|text-underline\|caption-underline\|panel-text-color\|panel-captions-color\|renderFontStyle\|renderCase" static/
```

Expected: no output. Any hit is a dangling reference that will throw at load.

- [ ] **Step 13: Check the section-wrapper spacing rule exists**

```bash
grep -n "style-sections" static/css/components/style-panel.css
```

`.style-group { margin-bottom: var(--space-2) }` is zeroed by `.style-group:last-child`, and the composer's mount wrapper makes the Color row the last child *of the wrapper* rather than of the panel body — which would swallow 8px of gap before the Outline row. If Batch 2 did not already add a rule, append to `static/css/components/style-panel.css`:

```css
/* The tab composers mount their sections into their own wrapper, so a section's last
   .style-group is :last-child of that wrapper, not of the panel body. Keep its trailing
   margin unless the wrapper itself is the last thing in the body. */
.style-sections > .style-group:last-child { margin-bottom: var(--space-2); }
.style-sections:last-child > .style-group:last-child { margin-bottom: 0; }
```

- [ ] **Step 14: Run the JS suite**

```bash
node --test tests/js
```

Expected: PASS, unchanged from Batch 2. This batch adds no tests — its logic lives in Batch 1's tested `FontSizeScale` and style targets.

- [ ] **Step 15: Browser smoke — both panels open and every control works**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, create a **throwaway** project (never real project data — the unload keepalive-save flushes in-memory state to disk), import any clip.

TEXT: add a text block, open the TEXT panel, Design tab. Type a size into SIZE → the stage text resizes. Click Italic → the stage text goes italic; click again → back. Click Underline → same. Click each of the three case buttons → the stage text switches lowercase / UPPERCASE / as-typed. Click the **Color** row → a subpage with a back arrow, titled "Color", opens; pick red → the stage text turns red; click back → the Color row's swatch is red.

CAPTIONS: add caption words (Auto-caption, or type a word in the Closed-captions tab). Open the CAPTIONS panel, Design tab. Repeat every check above against the caption text on the stage.

Expected: no console errors, every control drives the stage.

- [ ] **Step 16: Verify divergence (a) — row order is Font Family → Weight → SIZE on both**

TEXT panel, Design tab, read top to bottom. CAPTIONS panel, Design tab, read top to bottom.

Expected, identical on both: Font Family row, Weight row, SIZE stepper row, Italic/Underline/case row, Color row, Outline row, Shadow row (TEXT also has Highlight, which moves in Batch 4). Before this batch CAPTIONS had SIZE **above** Weight.

- [ ] **Step 17: Verify divergence (b) — the case buttons are inline on CAPTIONS**

CAPTIONS panel, Design tab. Look at the Italic/Underline row.

Expected: five buttons on **one** line — Italic, Underline, lowercase, UPPERCASE, As-typed — with no separate case row below and no extra vertical gap. Before this batch the three case buttons were on their own row. Compare against the TEXT panel: the two rows must now look identical.

- [ ] **Step 18: Verify divergence (c) and the step-up bug — the unified size scale**

TEXT, on a **fresh** text block (its default is `size_px: 96`, `panel-text.js:41`):

1. Read the SIZE field. Expected: `96`.
2. Click the **step-up** (A↑) button once. Expected: SIZE stays **96** and the stage text does not change size. Before this batch it dropped to **56** — the bug.
3. Click **step-down** (A↓) three times. Expected: 72, then 56, then 45.
4. Click **step-up** twice. Expected: 56, then **72** — a value TEXT's old scale could not reach.

CAPTIONS: type `56` into SIZE, then click step-up twice. Expected: 72, then 96. Click step-up again. Expected: stays 96.

- [ ] **Step 19: Verify the FormatRun path — SIZE, Italic, Underline and Color use `setField`**

This is the check the CAPTIONS panel cannot do, per the master plan's Verification procedure step 6. On the TEXT panel:

1. Give the block a heading of at least two words (e.g. `Hello world`).
2. On the stage, drag-select only the first word.
3. Click **step-up**. Expected: only the selected word gets bigger; the rest of the heading keeps its size.
4. Click **Italic**. Expected: only the selected word goes italic, and the Italic button reads pressed.
5. Click **Underline**. Expected: only the selected word is underlined.
6. Open **Color**, pick red. Expected: only the selected word turns red; the Color row's swatch reads red.
7. Click the stage background to clear the selection, then click **step-up**. Expected: the **whole** heading gets bigger.

A control that changes the whole heading in steps 3-6 was wired to `setPresetField` instead of `setField`.

- [ ] **Step 20: Verify the case group uses `setPresetField`**

Still on the TEXT panel, with the same block:

1. Drag-select only the first word on the stage.
2. Click **UPPERCASE**.

Expected: the **entire** heading goes uppercase, not just the selection. `text_case` has no `FormatRun` override in `app/models.py`, so a whole-preset write is the correct behaviour. If only the selected word changes, the case group was wired to `setField`.

- [ ] **Step 21: Verify persistence**

Reload the page with the throwaway project open. Open both panels' Design tabs.

Expected: every size, italic, underline, case and colour change from steps 15-20 survived, on both the stage and in the panel controls, including the per-word `FormatRun` overrides.

- [ ] **Step 22: Screenshot both Design tabs**

Capture the TEXT Design tab and the CAPTIONS Design tab and compare against Batch 2's screenshots. The only differences must be the three rows this batch moved. Any other shift is a bug in this batch.

- [ ] **Step 23: Commit**

```bash
git add static/style-tab-design.js static/index.html static/panel-text.js static/panel-captions.js static/css/components/style-panel.css
git commit -m "refactor: share the SIZE, emphasis and Color controls between TEXT and CAPTIONS

Lands three resolved divergences: row order becomes Font Family -> Weight -> SIZE
on both panels, the case buttons move onto the Italic/Underline row on CAPTIONS,
and both panels adopt the single [12..96] font-size scale. That last one fixes
TEXT's step-up button shrinking a default 96px block to 56px."
```

---

## Batch 3 done when

- [ ] `static/style-section-size.js`, `static/style-section-emphasis.js` and `static/style-section-color.js` exist, each opening with its purpose comment, each registering into `window.StyleSection`, each building its own markup with no inline `style="..."`.
- [ ] `StyleTab.design` composes exactly `fontFamily, fontWeight, size, emphasis, color`, in that order, and is the only place that order is written down.
- [ ] `static/text-panel-font-style.js`, `static/caption-panel-font-style.js`, `static/text-panel-case.js` and `static/caption-panel-case.js` are deleted, along with their four `<script>` tags.
- [ ] The size / italic / underline / case / color markup is gone from both `#text-font-body` and `#caption-font-body`, and `#panel-text-color` / `#panel-captions-color` are gone.
- [ ] `grep -rn "renderFontStyle\|renderCase\|text-case-group\|caption-case-group\|panel-text-color\|panel-captions-color" static/` returns nothing.
- [ ] `#text-size-row`'s two id rules are now the `.style-size-row` class rules, and CAPTIONS' size row picks them up.
- [ ] Divergence (a): both Design tabs read Font Family → Weight → SIZE → Italic/Underline/case → Color.
- [ ] Divergence (b): the three case buttons sit on the Italic/Underline row on **both** panels.
- [ ] Divergence (c): both panels step through `[12,14,16,18,21,24,36,45,56,72,96]`, and step-up on a fresh 96px text block leaves it at 96 instead of dropping it to 56.
- [ ] With a partial stage-text selection active on TEXT: SIZE, Italic, Underline and Color change only the selection; the case group changes the whole block.
- [ ] Every change survives a page reload.
- [ ] `node --test tests/js` passes, unchanged from Batch 2.
- [ ] The app loads with no console errors and both panels open.
- [ ] Four commits, one per task.
