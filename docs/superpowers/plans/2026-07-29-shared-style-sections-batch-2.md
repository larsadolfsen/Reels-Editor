# Batch 2 — Font family & weight

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints**, **Interface contract**, **Script load order** and **Verification procedure** first — they apply to every task here.

**Deliverable:** `style-section-font-family.js`, `style-section-font-weight.js` and `style-tab-design.js`, wired into both panels through a `StyleTarget` + `StylePanelHost` + `StyleTab.design` handle built once per panel. The four old `*-panel-font-{family,weight}.js` files and their hand-duplicated markup and drill-down subpanels are deleted.

**Why this batch:** it is the first one that actually moves UI, so it is where the mount-point pattern every later batch copies is established — a Design-tab body that starts with an empty mount `<div>` the shared sections build into, plus one sibling drill-down container the host appends subpages into. Font family and weight are the right pair to go first: they are the two rows at the top of the Design tab in both panels, and they are the pair whose relative order is the divergence the spec resolves (TEXT is Font Family → Weight → SIZE, CAPTIONS is Font Family → SIZE → Weight). Moving them lands that resolution as a side effect of the migration rather than as a separate edit.

---


## Amendments from the master-plan reconciliation (2026-07-29)

Batches 2-6 were drafted in parallel and disagreed on three points. The master plan is
now the single authority; where a snippet below contradicts it, **the master plan wins**.

- **`font` is written with `setPresetField`, not `setField`.** Routing it through
  `setField` would add per-range fonts inside one heading — a new capability that was
  raised and declined. `text-panel-font-family.js:29` writes `preset.font`
  unconditionally today, and that behaviour is preserved.
- **Picking a font uses `target.setFields({ font, weight })`, not two `setField` calls.**
  Two calls mean two saves and two undo entries for one click. `setFields` is new in the
  contract; Batch 1 must implement it.
- **This batch introduces the `.style-section` wrapper convention and its two CSS rules**
  (master plan, "Section wrapper convention"). `StyleTab.design` wraps each section in a
  `<div class="style-section">`. Without it the gap between sections collapses, because
  `.style-group:last-child { margin-bottom: 0 }` starts matching inside every section.
  Batches 3-6 rely on this and must not re-add the rules.
- **`StyleTab.design` options are `{ host, highlightModes, sampleText, compactSizeRow }`.**
  All four must survive every later rewrite of the composer.

---

## What both panels look like at the end of this batch

This batch does **not** move SIZE — that is Batch 3. So the intermediate state is: the first two rows of each Design tab are built by shared components into a mount div, and everything below the mount is still each panel's own markup wired by its own old files.

**TEXT Design tab** — unchanged from today, top to bottom:

1. Font Family *(shared component, in `#text-design-mount`)*
2. Weight *(shared component, in `#text-design-mount`)*
3. SIZE stepper row *(legacy markup + `text-panel-font-style.js`)*
4. Italic / Underline / case group, one row *(legacy)*
5. Color *(legacy)*
6. Outline *(legacy)*
7. Shadow *(legacy)*
8. Highlight *(legacy)*

**CAPTIONS Design tab** — the Weight row moves up above SIZE, which is the resolved order:

1. Font Family *(shared component, in `#caption-design-mount`)*
2. Weight *(shared component, in `#caption-design-mount`)* ← **was below SIZE**
3. SIZE stepper row *(legacy markup + `caption-panel-font-style.js`)*
4. Italic / Underline row *(legacy — the case group is still on its own separate row below, `btn-group-inline` lands in Batch 3)*
5. case group, its own row *(legacy)*
6. Color *(legacy)*
7. Outline *(legacy)*
8. Shadow *(legacy)*

This is a coherent, working intermediate state: every control still reads and writes the same caption preset it did before, the SIZE row and everything below it is untouched legacy code that does not know or care what is above it, and the only user-visible change on the CAPTIONS panel is that Weight now sits where TEXT has always had it. Nothing is half-wired — after Task 5 there is no code path left that reads `#caption-font-row` or `#caption-weight-row`, because those elements no longer exist.

## Two divergences this batch must resolve that the spec's table does not list

Sharing one component forces a single answer where the two old files differ. Neither of these is in the spec's "Resolved divergences" table, so they are decided here, both the same way the table decides everything else — **TEXT wins**, except where CAPTIONS is carrying information TEXT structurally cannot.

| Divergence | TEXT today | CAPTIONS today | Resolution |
|---|---|---|---|
| Weight row's value label | `` `${label} ${weight}`.trim() `` → `Regular 400` (`text-panel-font-weight.js:113`) | `label \|\| String(weight)` → `Regular` (`caption-panel-font-weight.js:81`) | **TEXT's**, `Regular 400`. The numeric weight is real information and one component cannot carry two formats. CAPTIONS' Weight row gains the number. |
| Weight list row's preview text | the block's own heading, falling back to the weight's label for an empty block (`text-panel-font-weight.js:60,83`) | the fixed string `"kind of insane"` (`caption-panel-font-weight.js:51`) | **Both preserved**, via a `sampleText` option. A caption track has no single heading to preview — its text is a per-word transcript spread across pages — so there is nothing for CAPTIONS to pass but a fixed sample, and `"kind of insane"` is the sample it already uses. TEXT keeps passing the live heading. |

`sampleText` is a **function**, not a string, so TEXT's value follows the heading as the user edits it — exactly what reading `block.heading` fresh inside `renderWeightList()` does today.

---

## Task 1: Font Family section component

**Files:**
- Create: `static/style-section-font-family.js`
- Modify: `static/index.html` (one script tag)

**Interfaces:**
- Consumes: `StylePanelHost` (Batch 1) via `options.host`; the style target's `getFieldValue`, `setField`, `previewField`, `cancelPreview`, `rerenderPanel`; `UI.settingsRow`, `UI.divider`, `UI.listRow`; the existing globals `AVAILABLE_FONTS` (`static/editor.js:7`) and `Api.listFontWeights` (`static/api-list-font-weights.js`).
- Produces: `window.StyleSection.fontFamily(container, target, { host }) -> { render() }`. Task 3's `style-tab-design.js` calls it.

**Behaviour notes for this task:**

- `selectFont`'s weight-snap logic is carried over **verbatim** from `text-panel-font-family.js:32-36` — the same `reduce` picking the numerically nearest available weight. Only its read/write path changes: `preset.weight` becomes `target.getFieldValue("weight")` / `target.setField("weight", …)`.
- Font family writes through `setField`, not `setPresetField`, per the master plan's Interface contract (`font` is in the FormatRun-capable list, and `FormatRun.font` is a real field in `app/models.py` that `preview-text.js` already resolves). This makes font family selection-aware on TEXT, which the two old files were not. That is the contract's stated intent for every FormatRun-capable field, and it is why Task 4's verification includes the partial-selection check.
- The snap fires a second `setField`, so a font change that also snaps the weight performs two saves where the old code performed one. Both persist the same final state; the only user-visible consequence is one extra Ctrl+Z step in the snap case. The contract has no batched write, and `setField` is the only permitted write path.

- [ ] **Step 1: Create the file**

Create `static/style-section-font-family.js`:

```js
// Shared style section: the Font Family settings row plus its font-list drill-down subpage.
// Serves both the TEXT and CAPTIONS Design tabs — every read and write goes through the style
// target, so this file never knows which panel it is rendering into.
window.StyleSection = window.StyleSection || {};

window.StyleSection.fontFamily = function fontFamily(container, target, options) {
  const opts = options || {};
  const host = opts.host;

  function checkmark() {
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "font-list-checkmark");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "currentColor");
    check.setAttribute("stroke-width", "2");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    check.appendChild(path);
    return check;
  }

  // The host rebuilds this body on every open(), so the list always reflects the current font.
  function buildList(bodyEl) {
    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

    const currentFont = target.getFieldValue("font");
    const orderedFonts = [currentFont, ...AVAILABLE_FONTS.filter((f) => f !== currentFont)];
    orderedFonts.forEach((fontName, index) => {
      if (index > 0) {
        const dividerLi = document.createElement("li");
        dividerLi.className = "font-list-divider";
        UI.divider(dividerLi);
        listEl.appendChild(dividerLi);
      }

      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("mouseenter", () => target.previewField("font", fontName));
      li.addEventListener("mouseleave", () => target.cancelPreview());
      li.addEventListener("click", () => selectFont(fontName));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      // Live preview of the value being edited — the one sanctioned inline-style exception.
      nameEl.style.fontFamily = fontName;
      nameEl.textContent = fontName;
      li.appendChild(nameEl);

      if (fontName === currentFont) li.appendChild(checkmark());

      listEl.appendChild(li);
    });
  }

  // Verbatim from text-panel-font-family.js: a weight the newly chosen family does not ship
  // snaps to the numerically nearest weight it does ship, so nothing renders at a weight that
  // does not exist. Only the read/write path changed — the target decides whether the write
  // lands on the base preset or on a per-range FormatRun.
  async function selectFont(fontName) {
    target.setField("font", fontName);
    const weights = await Api.listFontWeights(fontName);
    const currentWeight = target.getFieldValue("weight");
    if (!weights.some((w) => w.value === currentWeight)) {
      target.setField("weight", weights.reduce((closest, w) =>
        Math.abs(w.value - currentWeight) < Math.abs(closest.value - currentWeight) ? w : closest
      ).value);
    }
    page.close();
    // Repaints the Font Family and Weight rows together; renderTextPanel/renderCaptionPanel
    // re-render every section, which is what the old file's two by-name calls did by hand.
    target.rerenderPanel();
  }

  const page = host.page("Font Family", buildList, { onClose: () => target.cancelPreview() });

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // Built once, here. render() only pushes new values through the setter this returns —
  // UI.settingsRow is never called again.
  const setValue = UI.settingsRow(rowEl, {
    label: "Font Family", value: "", onClick: () => page.open(),
  });

  return {
    render() {
      const font = target.getFieldValue("font");
      setValue(font, font);
    },
  };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-panel-host.js"></script>` line Batch 1 added, insert:

```html
<script src="/static/style-section-font-family.js"></script>
```

- [ ] **Step 3: Verify the app still loads clean**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, open a **throwaway** project. In the browser console:

```js
typeof StyleSection.fontFamily
```

Expected: `"function"`. No console errors. Both panels look and behave exactly as before — nothing calls this file yet.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-font-family.js static/index.html
git commit -m "feat: shared Font Family style section"
```

---

## Task 2: Font Weight section component

**Files:**
- Create: `static/style-section-font-weight.js`
- Modify: `static/index.html` (one script tag)

**Interfaces:**
- Consumes: `StylePanelHost` via `options.host`; `options.sampleText: () => string`; the target's `getFieldValue` and `setField`; `UI.settingsRow`, `UI.listRow`; `Api.listFontWeights`.
- Produces: `window.StyleSection.fontWeight(container, target, { host, sampleText }) -> { render() }`, where **`render()` is async** — it awaits `Api.listFontWeights`. Task 3's `style-tab-design.js` calls it and propagates the promise.

**Note on `options`:** the master plan's section-options table lists `fontWeight` as `{ host }`. It needs `{ host, sampleText }` — see "Two divergences this batch must resolve" above. `sampleText` is optional and defaults to `() => ""`, which reproduces TEXT's behaviour for an empty heading (each row falls back to showing the weight's own label).

- [ ] **Step 1: Create the file**

Create `static/style-section-font-weight.js`:

```js
// Shared style section: the Weight settings row plus its weight-list drill-down subpage.
// Serves both the TEXT and CAPTIONS Design tabs; render() is async because the weights a font
// actually ships come from Api.listFontWeights.
window.StyleSection = window.StyleSection || {};

window.StyleSection.fontWeight = function fontWeight(container, target, options) {
  const opts = options || {};
  const host = opts.host;
  // Each list row previews real text at that weight rather than just naming it. TEXT passes the
  // block's own heading (read fresh on every open, so it follows edits); a caption track has no
  // single heading to preview, so panel-captions.js passes the fixed sample string
  // caption-panel-font-weight.js already used.
  const sampleText = opts.sampleText || (() => "");

  // Refreshed by render() for the current font; the subpage reads whatever render() last fetched.
  let currentWeights = [];

  function checkmark() {
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "font-list-checkmark");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "currentColor");
    check.setAttribute("stroke-width", "2");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    check.appendChild(path);
    return check;
  }

  function buildList(bodyEl) {
    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

    const font = target.getFieldValue("font");
    const weight = target.getFieldValue("weight");
    const previewText = sampleText() || "";

    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectWeight(w.value));

      // Label + preview are grouped in one wrapper so the row still has exactly two direct
      // children (content, checkmark?) — .font-list-row's `justify-content: space-between`
      // expects the checkmark as the sole right-hand item.
      const content = document.createElement("span");
      content.className = "font-weight-row-content";

      const labelEl = document.createElement("span");
      labelEl.className = "font-list-row-name";
      labelEl.textContent = w.label;
      content.appendChild(labelEl);

      const previewEl = document.createElement("span");
      previewEl.className = "font-weight-row-preview";
      // Live preview of the value being edited — the one sanctioned inline-style exception.
      previewEl.style.fontFamily = font;
      previewEl.style.fontWeight = w.value;
      previewEl.textContent = previewText || w.label;
      content.appendChild(previewEl);

      li.appendChild(content);

      if (w.value === weight) li.appendChild(checkmark());

      listEl.appendChild(li);
    });
  }

  function selectWeight(weightValue) {
    // setField, not setPresetField: a FormatRun can override weight, so on TEXT with a partial
    // selection active this writes that range only. On CAPTIONS the two are identical.
    target.setField("weight", weightValue);
    page.close();
    handle.render();
  }

  const page = host.page("Weight", buildList);

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const setValue = UI.settingsRow(rowEl, {
    label: "Weight", value: "", onClick: () => page.open(),
  });

  const handle = {
    async render() {
      currentWeights = await Api.listFontWeights(target.getFieldValue("font"));
      const weight = target.getFieldValue("weight");
      const current = currentWeights.find((w) => w.value === weight);
      // TEXT's label format ("Regular 400") over CAPTIONS' bare "Regular": the numeric weight is
      // real information, and one shared component cannot carry two formats.
      setValue(`${current ? current.label : ""} ${weight}`.trim());
    },
  };

  return handle;
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-font-family.js"></script>` line, insert:

```html
<script src="/static/style-section-font-weight.js"></script>
```

- [ ] **Step 3: Verify the app still loads clean**

With the server running, reload `http://127.0.0.1:8000` and, in the console:

```js
typeof StyleSection.fontWeight
```

Expected: `"function"`. No console errors, both panels unchanged.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-font-weight.js static/index.html
git commit -m "feat: shared Weight style section"
```

---

## Task 3: Design tab composer

**Files:**
- Create: `static/style-tab-design.js`
- Modify: `static/index.html` (one script tag)

**Interfaces:**
- Consumes: `StyleSection.fontFamily` (Task 1), `StyleSection.fontWeight` (Task 2).
- Produces: `window.StyleTab.design(container, target, { host, sampleText }) -> { render(): Promise }`. Tasks 4 and 5 call it, once per panel.

**Why `render()` returns a promise:** `fontWeight.render()` is async, and `renderTextPanel()` awaits the weight row today (`panel-text.js:168`). Returning `Promise.all(...)` keeps that await meaningful instead of silently dropping it. The master plan permits this: "`render()` may be async … Callers must tolerate a promise being returned."

**Note on `options`:** the master plan lists `StyleTab.design` options as `{ host, highlightModes }`. `highlightModes` is Batch 4's; this batch adds `sampleText`, which it forwards to `fontWeight`.

- [ ] **Step 1: Create the file**

Create `static/style-tab-design.js`:

```js
// Design-tab composer: builds the shared style sections into one mount container in the fixed
// order both the TEXT and CAPTIONS panels use, so the layout is structural rather than a
// convention each panel re-states. The order lives here and nowhere else.
window.StyleTab = window.StyleTab || {};

// The final order (master plan) is: fontFamily, fontWeight, size, emphasis, color, outline,
// shadow, highlight. Only the first two are shared components so far — the rest are still each
// panel's own markup sitting below this mount point, and move up into this list in Batches 3-4.
window.StyleTab.design = function design(container, target, options) {
  const opts = options || {};

  const sections = [
    StyleSection.fontFamily(container, target, { host: opts.host }),
    StyleSection.fontWeight(container, target, { host: opts.host, sampleText: opts.sampleText }),
  ];

  return {
    // Returns a promise because fontWeight.render() awaits Api.listFontWeights; the panels await
    // it so the Weight row's label is filled in before the panel render is considered done.
    render() { return Promise.all(sections.map((s) => s.render())); },
  };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-font-weight.js"></script>` line, insert:

```html
<script src="/static/style-tab-design.js"></script>
```

The three tags added so far now sit in the master plan's order:

```html
<script src="/static/style-panel-host.js"></script>
<script src="/static/style-section-font-family.js"></script>
<script src="/static/style-section-font-weight.js"></script>
<script src="/static/style-tab-design.js"></script>
```

- [ ] **Step 3: Verify the app still loads clean**

Reload `http://127.0.0.1:8000` and, in the console:

```js
typeof StyleTab.design
```

Expected: `"function"`. No console errors, both panels unchanged — nothing calls the composer yet.

- [ ] **Step 4: Commit**

```bash
git add static/style-tab-design.js static/index.html
git commit -m "feat: Design tab composer for the shared style sections"
```

---

## Task 4: Migrate the TEXT panel

**Files:**
- Modify: `static/index.html` (mount point, drill-down container, delete two subpanels, delete two script tags)
- Modify: `static/panel-text.js` (build the target/host/tab once, render on every panel render)
- Delete: `static/text-panel-font-family.js`, `static/text-panel-font-weight.js`

**Interfaces:**
- Consumes: `StyleTarget.forTextBlock()` (Batch 1), `StylePanelHost(mainEl, drillEl)` (Batch 1), `StyleTab.design` (Task 3).
- Produces: nothing new. `window.TextPanel.renderFontFamily` and `window.TextPanel.renderFontWeight` cease to exist; `panel-text.js:167-168` were their only callers (verified by grep — `renderFontFamily|renderFontWeight` matches only the two deleted files and the two orchestrators).

**Mount-point pattern established here — every later batch copies it:**

- The Design-tab body (`#text-font-body`) starts with a single empty `<div id="text-design-mount"></div>`. Shared sections append their own `.style-group` markup into it, in composer order. Legacy markup for controls not yet migrated stays *below* the mount, so the visual order is always [migrated rows][not-yet-migrated rows] — which for TEXT is already the final resolved order.
- One `<div id="text-drilldowns"></div>` sits as a sibling of `#panel-text-main`, exactly where the deleted per-control subpanels were. `StylePanelHost` appends every `.style-sub-panel` into it. Later batches delete more subpanels and add nothing here.
- No new CSS. `.style-group`, `.col-8`, `.font-list`, `.font-list-row`, `.font-list-divider`, `.font-list-checkmark`, `.font-weight-row-content` and `.font-weight-row-preview` all already exist (`static/css/components/sub-panel.css`, `style-panel.css`), and Batch 1 added `.style-sub-panel`. `#text-drilldowns` is an unstyled wrapper.

- [ ] **Step 1: Replace the Font Family and Weight markup with the mount point**

In `static/index.html`, find this block (starts at `#text-font-body`, around line 642):

```html
        <div id="text-font-body">
          <div class="style-group">
            <div id="text-font-row" class="col-8"></div>
          </div>

          <div class="style-group">
            <div id="text-weight-row" class="col-8"></div>
          </div>

          <div class="style-group">
            <div class="style-row" id="text-size-row">
```

Replace it with:

```html
        <div id="text-font-body">
          <div id="text-design-mount"></div>

          <div class="style-group">
            <div class="style-row" id="text-size-row">
```

Everything from `<div class="style-group">` / `<div class="style-row" id="text-size-row">` down to the end of `#text-font-body` is untouched.

- [ ] **Step 2: Replace the font and weight subpanels with the drill-down container**

In `static/index.html`, find this block (immediately after `#panel-text-main`'s closing `</div>`, around line 770):

```html
        <div id="panel-text-font" hidden>
          <div id="text-font-subpanel-header"></div>
          <ul id="text-font-list" class="font-list"></ul>
        </div>

        <div id="panel-text-weight" hidden>
          <div id="text-weight-subpanel-header"></div>
          <ul id="text-weight-list" class="font-list"></ul>
        </div>

        <div id="panel-text-color" hidden>
```

Replace it with:

```html
        <div id="text-drilldowns"></div>

        <div id="panel-text-color" hidden>
```

`#panel-text-color`, `#panel-text-outline`, `#panel-text-shadow` and `#panel-text-highlight` stay exactly as they are — Batches 3 and 4 delete them.

- [ ] **Step 3: Delete the two TEXT script tags**

In `static/index.html`, delete these two lines:

```html
<script src="/static/text-panel-font-family.js"></script>
<script src="/static/text-panel-font-weight.js"></script>
```

(`text-panel-font-style.js` and the other `text-panel-*.js` tags stay.)

- [ ] **Step 4: Build the target, host and Design tab once in `panel-text.js`**

In `static/panel-text.js`, immediately after the line `showTextTab(activeTextTab);`, insert:

```js
// The shared style sections are built ONCE, here, and only re-rendered afterwards — never
// rebuilt. The host owns the drill-down subpages they register into #text-drilldowns.
const textStyleTarget = StyleTarget.forTextBlock();
const textStyleHost = StylePanelHost(
  document.getElementById("panel-text-main"),
  document.getElementById("text-drilldowns"),
);
const textDesignTab = StyleTab.design(
  document.getElementById("text-design-mount"),
  textStyleTarget,
  {
    host: textStyleHost,
    // The Weight list previews the block's own heading, read fresh so it follows edits.
    sampleText: () => (currentTextBlock() || {}).heading || "",
  },
);
```

Nothing here touches `project` or a preset, so it is safe at load time — `editor.js` has not run yet.

- [ ] **Step 5: Close drill-downs through the host in `renderTextPanel()`**

In `static/panel-text.js`, replace the first three lines of `renderTextPanel()`:

```js
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-weight").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
```

with:

```js
  // closeAll() hides every host subpage and un-hides #panel-text-main — the same reset the two
  // per-control lines did, minus the ids.
  textStyleHost.closeAll();
```

- [ ] **Step 6: Render the Design tab instead of the two old functions**

In `static/panel-text.js`, replace:

```js
  TextPanel.renderFontFamily();
  await TextPanel.renderFontWeight();
```

with:

```js
  await textDesignTab.render();
```

The remaining `TextPanel.renderFontStyle()` … `TextPanel.renderTime()` calls below it are untouched.

- [ ] **Step 7: Delete the two old files**

```bash
git rm static/text-panel-font-family.js static/text-panel-font-weight.js
```

- [ ] **Step 8: Verify the TEXT panel in the browser**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, open the **throwaway** project, import a clip if it has none, and add a text block (left rail → TEXT). Type `Hello world` on the stage and click off. Open the TEXT panel's **Design** tab.

1. The tab shows **Font Family** then **Weight** then the SIZE stepper row — same order as before.
2. Font Family reads `Public Sans`, rendered in Public Sans. Weight reads `Regular 400`.
3. Click **Font Family** → the drill-down opens with `Public Sans` (checkmarked, first) and `JetBrains Mono`, separated by a divider, each name drawn in its own face.
4. Hover `JetBrains Mono` → the stage text switches to it live. Move the pointer off the row → the stage reverts to Public Sans. Nothing has been saved.
5. Click the back arrow → the main view returns, stage still Public Sans.
6. Re-open, click `JetBrains Mono` → the subpage closes, the stage text is JetBrains Mono, the Font Family row reads `JetBrains Mono` in that face, and the **Weight row's value has snapped** to a weight JetBrains Mono ships.
7. Click **Weight** → each row shows the weight's name plus `Hello world` rendered at that weight in the current font, with a checkmark on the current one. Pick a different weight → the subpage closes, the stage updates, the Weight row's label updates.
8. **FormatRun check (TEXT only — the CAPTIONS panel cannot exercise this path).** On the stage, select just the word `Hello` with the mouse. With that selection live, open **Weight** and pick a different weight. Expected: **only `Hello` changes weight**; `world` keeps the block's weight. Then open **Font Family** and pick the other font. Expected: **only `Hello` changes font**. This is the `setField` path; if the whole block changes, the section is calling `setPresetField` or writing the preset directly.
9. Click elsewhere to drop the selection, then reload the page. Every change above persisted.
10. Console: no errors.

- [ ] **Step 9: Commit**

```bash
git add static/index.html static/panel-text.js
git commit -m "refactor: TEXT panel font family and weight use the shared style sections"
```

---

## Task 5: Migrate the CAPTIONS panel

**Files:**
- Modify: `static/index.html` (mount point, drill-down container, delete two subpanels, delete two script tags)
- Modify: `static/panel-captions.js` (build the target/host/tab once, render on every panel render)
- Delete: `static/caption-panel-font-family.js`, `static/caption-panel-font-weight.js`

**Interfaces:**
- Consumes: `StyleTarget.forCaptionTrack()` (Batch 1), `StylePanelHost` (Batch 1), `StyleTab.design` (Task 3).
- Produces: nothing new. `window.CaptionPanel.renderFontFamily` and `window.CaptionPanel.renderFontWeight` cease to exist; `panel-captions.js:67-68` were their only callers.

This is where the row-order divergence is resolved: deleting `#caption-font-row` and `#caption-weight-row` and mounting the shared sections at the top of `#caption-font-body` puts Weight above SIZE, matching TEXT.

- [ ] **Step 1: Replace the Font Family and Weight markup with the mount point**

In `static/index.html`, find this block (starts at `#caption-font-body`, around line 223):

```html
          <div id="caption-font-body">
            <div class="style-group">
              <div id="caption-font-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <div class="style-row" id="caption-size-row">
```

Replace it with:

```html
          <div id="caption-font-body">
            <div id="caption-design-mount"></div>

            <div class="style-group">
              <div class="style-row" id="caption-size-row">
```

Then find the Weight group, which sits between the SIZE row's `</div>` and the Italic/Underline group (around line 240):

```html
            <div class="style-group">
              <div id="caption-weight-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <div class="style-row">
                <button class="icon-btn col-1" id="caption-italic" type="button" aria-pressed="false" title="Italic">
```

Replace it with:

```html
            <div class="style-group">
              <div class="style-row">
                <button class="icon-btn col-1" id="caption-italic" type="button" aria-pressed="false" title="Italic">
```

- [ ] **Step 2: Replace the font and weight subpanels with the drill-down container**

In `static/index.html`, find this block (immediately after `#panel-captions-main`'s closing `</div>`, around line 373):

```html
        <div id="panel-captions-font" hidden>
          <div id="caption-font-subpanel-header"></div>
          <ul id="caption-font-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-weight" hidden>
          <div id="caption-weight-subpanel-header"></div>
          <ul id="caption-weight-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-color" hidden>
```

Replace it with:

```html
        <div id="caption-drilldowns"></div>

        <div id="panel-captions-color" hidden>
```

`#panel-captions-color`, `#panel-captions-outline`, `#panel-captions-shadow` and `#panel-captions-language` stay — Batches 3 and 4 delete the first three, and the language subpanel is single-panel and stays for good.

- [ ] **Step 3: Delete the two CAPTIONS script tags**

In `static/index.html`, delete these two lines:

```html
<script src="/static/caption-panel-font-family.js"></script>
<script src="/static/caption-panel-font-weight.js"></script>
```

- [ ] **Step 4: Build the target, host and Design tab once in `panel-captions.js`**

In `static/panel-captions.js`, immediately after the line `showCaptionTab(activeCaptionTab);`, insert:

```js
// Built ONCE, mirroring panel-text.js — the sections are re-rendered afterwards, never rebuilt.
const captionStyleTarget = StyleTarget.forCaptionTrack();
const captionStyleHost = StylePanelHost(
  document.getElementById("panel-captions-main"),
  document.getElementById("caption-drilldowns"),
);
const captionDesignTab = StyleTab.design(
  document.getElementById("caption-design-mount"),
  captionStyleTarget,
  {
    host: captionStyleHost,
    // A caption track has no single heading to preview — its text is a per-word transcript spread
    // across pages — so the Weight list shows the fixed sample caption-panel-font-weight.js used.
    sampleText: () => "kind of insane",
  },
);
```

- [ ] **Step 5: Close drill-downs through the host in `renderCaptionPanel()`**

In `static/panel-captions.js`, replace the first four lines of `renderCaptionPanel()`:

```js
  document.getElementById("panel-captions-font").hidden = true;
  document.getElementById("panel-captions-weight").hidden = true;
  document.getElementById("panel-captions-language").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;
```

with:

```js
  // closeAll() hides every host subpage and un-hides #panel-captions-main; the language
  // subpanel is not a host page yet (it stays hand-wired — it is single-panel and never moves).
  captionStyleHost.closeAll();
  document.getElementById("panel-captions-language").hidden = true;
```

- [ ] **Step 6: Render the Design tab instead of the two old functions**

In `static/panel-captions.js`, replace:

```js
  CaptionPanel.renderFontFamily();
  await CaptionPanel.renderFontWeight();
```

with:

```js
  await captionDesignTab.render();
```

`CaptionPanel.renderLanguage()` and `CaptionPanel.renderStyle()` above it, and `CaptionPanel.renderFontStyle()` onward below it, are untouched.

- [ ] **Step 7: Delete the two old files**

```bash
git rm static/caption-panel-font-family.js static/caption-panel-font-weight.js
```

- [ ] **Step 8: Verify the CAPTIONS panel in the browser**

With the server running, reload `http://127.0.0.1:8000` and open the **throwaway** project. Open the CAPTIONS panel (left rail → CAPTIONS). If the track has no words, run **Auto-caption** from the Closed captions tab, or add words there manually, so there is caption text on the stage. Open the **Design** tab.

1. The tab now reads **Font Family**, **Weight**, **SIZE**, Italic/Underline, case, Color, Outline, Shadow — Weight has moved above SIZE. This is the intended change.
2. Font Family reads `Public Sans` in that face; Weight reads `Regular 400` (it read a bare `Regular` before — intended, see the divergence table).
3. Click **Font Family** → the drill-down opens with both fonts, current one checkmarked and first, divider between them.
4. Hover the other font → the caption text on the stage switches live; move off → it reverts.
5. Back arrow → main view returns, captions unchanged.
6. Re-open and click the other font → subpage closes, captions render in it, the Font Family row updates, and the Weight row snaps to an available weight.
7. Click **Weight** → each row shows the weight's name plus `kind of insane` rendered at that weight, checkmark on the current one. Pick a different one → subpage closes, the caption text on the stage changes weight, the row's label updates.
8. Switch to the **Box** and **Closed captions** tabs and back to Design — the rows are still populated and the drill-downs still open.
9. Reload the page. Every change persisted.
10. Console: no errors, and no reference to `caption-font-row` / `caption-weight-row` / `panel-captions-font` / `panel-captions-weight` anywhere. Confirm with:

```bash
grep -rn "caption-font-row\|caption-weight-row\|panel-captions-font\|panel-captions-weight\|text-font-row\|text-weight-row\|panel-text-font\|panel-text-weight" static/
```

Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add static/index.html static/panel-captions.js
git commit -m "refactor: CAPTIONS panel font family and weight use the shared style sections"
```

---

## Task 6: Update the codebase map and verify the whole batch

**Files:**
- Modify: `CLAUDE.md` (File structure tree + Inventory)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. Documentation only.

The spec defers the full `CLAUDE.md` rewrite to Batch 6, but this batch adds three files and deletes four, and the project rule is that any commit adding or deleting files updates the map in the same commit. This is the minimal reconciling edit; Batch 6 still does the comprehensive pass.

- [ ] **Step 1: Remove the four deleted files from the File structure tree**

In `CLAUDE.md`, under `static/`, delete these four lines:

- the `text-panel-font-family.js` line
- the `text-panel-font-weight.js` line
- the `caption-panel-font-family.js` line
- the `caption-panel-font-weight.js` line

- [ ] **Step 2: Add the three new files to the File structure tree**

In `CLAUDE.md`, under `static/`, immediately after the `style-panel-host.js` line Batch 1 added, insert:

```
  style-section-font-family.js # shared style section (added 2026-07-29, shared-style-sections batch 2): Font Family settings row + font-list drill-down subpage, serving both the TEXT and CAPTIONS Design tabs via a StyleTarget; replaces text-panel-font-family.js + caption-panel-font-family.js
  style-section-font-weight.js # shared style section (added 2026-07-29, batch 2): Weight settings row + weight-list drill-down subpage; render() is async (awaits Api.listFontWeights). Its `sampleText` option supplies the per-row preview text — TEXT passes the block's live heading, CAPTIONS a fixed sample, since a caption track has no single heading. Replaces text-panel-font-weight.js + caption-panel-font-weight.js
  style-tab-design.js          # Design-tab composer (added 2026-07-29, batch 2): StyleTab.design(container, target, {host, sampleText}) -> {render()} builds the shared sections in the one fixed order both panels use (final order: fontFamily, fontWeight, size, emphasis, color, outline, shadow, highlight; only the first two exist so far). render() returns a promise because fontWeight's does
```

- [ ] **Step 3: Note the mount points on the two orchestrators**

In `CLAUDE.md`'s `static/` tree, append to the `panel-text.js` entry:

```
As of 2026-07-29 (shared-style-sections batch 2) it builds a StyleTarget.forTextBlock(), a StylePanelHost(#panel-text-main, #text-drilldowns) and a StyleTab.design(#text-design-mount, …) once at load, and calls `await textDesignTab.render()` from renderTextPanel() in place of the deleted TextPanel.renderFontFamily/renderFontWeight calls; renderTextPanel()'s per-subpanel `hidden` resets became `textStyleHost.closeAll()`.
```

and to the `panel-captions.js` entry:

```
As of 2026-07-29 (shared-style-sections batch 2) it does the same as panel-text.js with StyleTarget.forCaptionTrack(), StylePanelHost(#panel-captions-main, #caption-drilldowns) and StyleTab.design(#caption-design-mount, …) — which also moved the Weight row above SIZE, matching TEXT's order.
```

- [ ] **Step 4: Run the JS test suite**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, 39 tests across 5 files — unchanged. This batch adds no pure modules; the sections build DOM and are verified in the browser instead (the stated gap in the spec).

- [ ] **Step 5: Run the Python suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: PASS, unchanged. No backend file was touched.

- [ ] **Step 6: Run the master plan's full verification procedure**

With the server running and the **throwaway** project open:

1. TEXT panel, Design tab — Font Family and Weight both work, drill-downs open and close, hover preview appears and reverts.
2. CAPTIONS panel, Design tab — same, and the order is Font Family → Weight → SIZE.
3. TEXT with a partial stage-text selection active — changing Weight or Font Family affects only the selection.
4. Reload — everything persisted.
5. Screenshot both Design tabs and compare against Batch 1's screenshots. The only expected difference is the CAPTIONS Weight row moving above SIZE and its label gaining the numeric weight.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: map the shared font family/weight sections and Design tab composer"
```

---

## Batch 2 done when

- `static/style-section-font-family.js`, `static/style-section-font-weight.js` and `static/style-tab-design.js` exist, each opening with a purpose comment, and are loaded by `static/index.html` in the master plan's order.
- `static/text-panel-font-family.js`, `static/text-panel-font-weight.js`, `static/caption-panel-font-family.js` and `static/caption-panel-font-weight.js` are deleted, along with their four `<script>` tags.
- `grep -rn "text-font-row\|text-weight-row\|caption-font-row\|caption-weight-row\|panel-text-font\|panel-text-weight\|panel-captions-font\|panel-captions-weight" static/` returns no matches.
- `#text-font-body` starts with `<div id="text-design-mount"></div>` and `#caption-font-body` with `<div id="caption-design-mount"></div>`; `#text-drilldowns` and `#caption-drilldowns` are siblings of their panels' `-main` wrappers.
- Both panels build their target, host and Design tab **once** at load and call `render()` on every panel render — `UI.settingsRow` is never called from inside a `render()`.
- TEXT's Design tab is visually unchanged. CAPTIONS' Design tab shows Font Family → Weight → SIZE, and its Weight row reads e.g. `Regular 400`.
- On TEXT with a partial heading selection active, changing Weight or Font Family changes only the selection.
- `node --test "tests/js/**/*.test.js"` passes with 39 tests; `.venv/Scripts/python -m pytest -q` passes.
- No console errors on load or while exercising either panel; every change survives a reload.
- Six commits, one per task.
