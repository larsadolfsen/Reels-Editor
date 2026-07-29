# Batch 4 — Outline, shadow, highlight

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints**, **Interface contract**, **Script load order** and **Verification procedure** first — they apply to every task here.

**Deliverable:** `static/style-section-outline.js`, `static/style-section-shadow.js` and `static/style-section-highlight.js`; `static/style-tab-design.js` extended to the full eight-section order (`fontFamily`, `fontWeight`, `size`, `emphasis`, `color`, `outline`, `shadow`, `highlight`); the six old `*-panel-{outline,shadow,highlight}.js` files, their script tags and all of their `index.html` markup deleted. At the end of this batch both panels' Design tabs are built entirely by `StyleTab.design`.

**Why this batch:** these three are the last Design-tab controls still hand-copied, and Highlight is the worst of the four accidental divergences — TEXT has a drill-down row, CAPTIONS has an inline MARKER/MODE/color/radius group inside its own `#caption-highlight-body` tab pane. Sharing the JS alone would not have fixed that, because the divergence lives in the markup. A markup-owning `StyleSection.highlight` with a `modes` option makes the two panels structurally the same control with one declared difference.

> **Batch 2 and Batch 3 plan files did not exist when this file was written.** The mount-point and panel-wiring pattern below is derived from the master plan's Interface contract and Script load order, and from the spec's statement that `#text-font-body` / `#caption-font-body` become empty mount points. Task 0 below checks each assumption against the real tree before any code is written; if Batch 2/3 landed something different, fix Task 0's findings first and adjust the `style-tab-design.js` file bodies accordingly — the *section* files in Tasks 1–3 depend only on the Batch 1 contract and are unaffected.

---


## Amendments from the master-plan reconciliation (2026-07-29)

Batches 2-6 were drafted in parallel and disagreed on three points. The master plan is
now the single authority; where a snippet below contradicts it, **the master plan wins**.

- **The composer snippets keep `sampleText` and `compactSizeRow`.** Batches 2 and 3 added
  them after this file was drafted; all three copies of the `StyleTab.design` rewrite here
  have been corrected. Carry all four options forward.
- **The `.style-section` wrapper and its CSS already exist** from Batch 2. Each section
  still builds its own `.style-group`s; the composer owns the wrapper.
- This batch's `setField` / `setPresetField` split was reviewed and is **correct as
  written** — `outline_color`, `outline_px`, `highlight`, `highlight_color` use `setField`;
  the five shadow fields, `highlight_mode` and `highlight_border_radius` use
  `setPresetField`.

---

## Divergence landed by this batch

This batch lands **one of the seven resolved divergences** from the spec:

| Item | Resolution |
|---|---|
| Highlight | drill-down row for both; CAPTIONS' MARKER/MODE/color/radius move inside the drill-down |

**Before (CAPTIONS today).** `#caption-highlight-body` is its own tab pane, shown by `panel-captions.js`'s `captionTabPanes.design = [caption-font-body, caption-highlight-body]` — so opening the Design tab shows the font rows *and*, below them, a permanently-expanded block:

```
MARKER
[ OFF ][ ON ]
MODE
[ Current word ][ Progressive fill ]
[ Background               ]
[■] Highlight color
RADIUS (PX)  [ 4 ]        <- hidden unless highlight_mode === "background" OR preset.highlight
```

The CAPTIONS Design tab has **no** Highlight settings row at all.

**After.** `#caption-highlight-body` is deleted. The CAPTIONS Design tab ends with a Highlight settings row identical in shape to TEXT's — `Highlight   [■] ON  ›` — and clicking it drills down to a subpage titled "Highlight" containing MARKER, MODE, the colour field and the radius field. TEXT's Design tab is visually unchanged: same row in the same place, same subpage minus the MODE group (`modes: false`).

**Before (TEXT today).** Row present, subpage holds ON/OFF + colour + radius, both detail fields hidden while `preset.highlight` is false. Unchanged after this batch.

---

## FormatRun capability — verified against `app/models.py`

`app/models.py:113-129` defines every field a `FormatRun` may override:

```python
class FormatRun(BaseModel):
    start: int
    end: int
    font: str | None = None
    size_px: int | None = None
    color: str | None = None
    outline_color: str | None = None
    outline_px: int | None = None
    weight: int | None = None
    italic: bool | None = None
    underline: bool | None = None
    highlight: bool | None = None
    highlight_color: str | None = None
```

Read off that list, for this batch's three sections:

| Control | Field | FormatRun-capable? | Write via | Display via |
|---|---|---|---|---|
| Outline colour | `outline_color` | **yes** | `target.setField` | `target.getFieldValue` |
| Outline width | `outline_px` | **yes** | `target.setField` | `target.getFieldValue` |
| Shadow on/off | `shadow` | no | `target.setPresetField` | `target.getPreset()` |
| Shadow colour | `shadow_color` | no | `target.setPresetField` | `target.getPreset()` |
| Shadow offset X | `shadow_offset_x` | no | `target.setPresetField` | `target.getPreset()` |
| Shadow offset Y | `shadow_offset_y` | no | `target.setPresetField` | `target.getPreset()` |
| Shadow blur | `shadow_blur` | no | `target.setPresetField` | `target.getPreset()` |
| Highlight on/off | `highlight` | **yes** | `target.setField` | `target.getFieldValue` |
| Highlight colour | `highlight_color` | **yes** | `target.setField` | `target.getFieldValue` |
| Highlight mode | `highlight_mode` | no — **not on `FormatRun`** | `target.setPresetField` | `target.getPreset()` |
| Highlight radius | `highlight_border_radius` | no — **not on `FormatRun`** | `target.setPresetField` | `target.getPreset()` |

No shadow field appears on `FormatRun` — the whole shadow section is `setPresetField`. `highlight_mode` and `highlight_border_radius` are absent too, so within one section three controls use `setField` and two use `setPresetField`. That mixed section is the highest-risk file in this batch.

**Behaviour note — highlight becomes selection-aware on TEXT.** `static/text-panel-highlight.js:2-3` documents itself as "Whole-preset setting only — no per-range FormatRun override", and writes `preset.highlight` / `preset.highlight_color` directly. The master plan's Interface contract nonetheless lists both under `setField`:

> use `setField` for anything a `FormatRun` can override — `font`, `size_px`, `color`, `outline_color`, `outline_px`, `weight`, `italic`, `underline`, `highlight`, `highlight_color`.

This plan follows the contract, so on TEXT with a stage selection active, toggling Highlight or picking a highlight colour now writes a `FormatRun` for that range instead of the whole block. The renderer already supports this — `static/preview-text.js:140-141` reads `run.highlight` and `run.highlight_color`:

```js
const highlighted = run && run.highlight != null ? run.highlight : preset.highlight;
span.style.backgroundColor = highlighted ? ((run && run.highlight_color) || preset.highlight_color) : "transparent";
```

so nothing downstream needs changing. It is still a user-visible behaviour change that is **not** in the spec's seven resolved divergences, and Step 7 of Task 3 verifies it explicitly.

---

## Field-visibility rules — the two panels reconciled

Shadow's rule is already identical in both files (`text-panel-shadow.js:34-38`, `caption-panel-shadow.js:33-37`): colour, offset X, offset Y and blur are hidden when `preset.shadow` is false. It carries over unchanged.

Highlight's rule is not identical:

- TEXT (`text-panel-highlight.js:34-36`): both the colour field and the radius field are hidden when `preset.highlight` is false.
- CAPTIONS (`caption-panel-highlight.js:30-31`): the colour field is **always** visible; the radius field is hidden when `preset.highlight_mode !== "background" && !preset.highlight`.

**Chosen shared rule: a detail field is visible exactly when the value it edits can affect what renders.**

```js
colorVisible  = highlightOn || options.modes;
radiusVisible = highlightOn || preset.highlight_mode === "background";
```

Justification, field by field:

- **Colour.** `highlight_color` paints the marker rect whenever `highlight` is on — on both panels. On CAPTIONS it *additionally* paints the karaoke word in every one of the three modes (`preview-captions.js` colours the active word with `highlight_color` in `current_word`, sweeps it in `progressive_fill`, and fills a rect with it in `background`), so it is always live there. `options.modes` is precisely the flag for "this target has karaoke modes", so `highlightOn || modes` reduces to `preset.highlight` on TEXT (identical to today) and to `true` on CAPTIONS (identical to today). Lossless on both.
- **Radius.** A rounded rect is drawn either by the marker (`preset.highlight`) or by `background` mode's per-word rect. `highlightOn || preset.highlight_mode === "background"` is byte-identical to CAPTIONS' current expression, and reduces to `preset.highlight` on TEXT because a TEXT preset's `highlight_mode` is never `"background"` — `panel-text.js:48` defaults it to `"current_word"` and TEXT has no UI to change it. Lossless on both.

**Rules rejected and why:**

- `visible = highlightOn` for both fields (TEXT's rule, applied everywhere) — regression: it would hide CAPTIONS' colour field whenever MARKER is off, removing the only control for the karaoke highlight colour in `current_word` / `progressive_fill` mode.
- `visible = true` for both fields (CAPTIONS' colour rule, applied everywhere) — regression in the other direction: TEXT would show two controls that do nothing while Highlight is off, and CAPTIONS would show a radius field in `current_word` mode where no rect is drawn.
- One single expression for both fields — impossible without one of the two regressions above, because the colour and the radius are genuinely used by different sets of conditions.

**Accepted edge case:** applying a saved style whose `highlight_mode` is `"background"` to a *text block* would now reveal the radius field on TEXT with Highlight off. The field is inert there, and no UI can reach that state today (only a caption style could carry `highlight_mode: "background"`, and the Style tab does copy `highlight_mode` — see `StyleFields.STYLE_FIELD_NAMES`). Showing one inert number field in that corner is preferable to special-casing the rule per panel, which is exactly what this whole refactor exists to eliminate.

---

## Build-once / render-many, and where `UI.*` may be called

Per the master plan's self-review note, `UI.settingsRow` / `UI.colorSwatch` / `UI.numberField` / `UI.buttonGroup` are **never** called from a section's `render()`. In this batch that splits three ways:

1. **Factory** — builds the section's `.style-group` + row container, calls `UI.settingsRow` **once**, captures its `setValue` updater, and registers the subpage with `host.page(...)`.
2. **`buildBody(bodyEl)`** — the callback `StylePanelHost` invokes on **every** `page.open()`. Batch 1's host deliberately wipes and rebuilds the body each open ("The body is rebuilt on every open so a subpage always reflects the current preset"), so calling `UI.colorSwatch` / `UI.numberField` / `UI.buttonGroup` here is correct and is *not* the anti-pattern the self-review note warns about. Setters captured here live in the `buildBody` closure and drive an in-subpage `syncFields()`.
3. **`render()`** — refreshes the settings row only, via the captured `setValue`. It builds nothing.

`UI.settingsRow`'s updater signature is `(value, valueFontFamily, swatchColor)` (`static/ui-settings-row.js:45-50`) — the middle argument is passed as `null` everywhere in this batch, since none of these three rows style their value text in a preview font.

---

## Task 0: Confirm the Batch 2/3 preconditions

**Files:**
- Modify: nothing. Read-only check.

**Interfaces:**
- Consumes: `window.StyleTab.design`, `window.StylePanelHost`, `window.StyleTarget` (Batches 1–3).
- Produces: nothing.

- [ ] **Step 1: Confirm the six Batch-1 files and the three Batch-2/3 sections exist**

```bash
ls static/style-panel-host.js static/style-target-text.js static/style-target-caption.js \
   static/style-tab-design.js static/style-section-font-family.js static/style-section-font-weight.js \
   static/style-section-size.js static/style-section-emphasis.js static/style-section-color.js
```

Expected: all nine listed, no "No such file". If `style-section-size.js` / `emphasis` / `color` are missing, Batch 3 has not landed — stop and run it first.

- [ ] **Step 2: Confirm the mount points and hosts**

```bash
grep -n "StyleTab.design\|StylePanelHost\|closeAll" static/panel-text.js static/panel-captions.js
```

Expected, in `panel-text.js`: a `StylePanelHost(document.getElementById("panel-text-main"), document.getElementById("panel-text"))` host built once, a `StyleTab.design(document.getElementById("text-font-body"), target, { host, highlightModes: false })` built once, and a `host.closeAll()` call at the top of `renderTextPanel()`. The same in `panel-captions.js` with `panel-captions-main` / `panel-captions` / `caption-font-body` / `highlightModes: true`.

If `host.closeAll()` is missing from either render function, add it now — without it a drill-down subpage stays visible alongside the main view when the panel is re-rendered. (Today's `renderTextPanel()` only hides `panel-text-font` and `panel-text-weight`, so an open Outline subpanel already survives a re-render as a latent bug; `closeAll()` is the fix.)

- [ ] **Step 3: Confirm `node --test` is green before touching anything**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS. If it already fails, fix that before starting — a failure introduced here must be attributable to this batch.

- [ ] **Step 4: No commit**

Task 0 changes nothing (unless Step 2 required adding `host.closeAll()`, in which case commit that alone):

```bash
git add static/panel-text.js static/panel-captions.js
git commit -m "fix: close style drill-downs when the TEXT/CAPTIONS panel re-renders"
```

---

## Task 1: Outline section

**Files:**
- Create: `static/style-section-outline.js`
- Modify: `static/style-tab-design.js`, `static/index.html`, `static/panel-text.js`, `static/panel-captions.js`
- Delete: `static/text-panel-outline.js`, `static/caption-panel-outline.js`

**Interfaces:**
- Consumes: `target.getFieldValue(field)`, `target.setField(field, value)` (Batch 1's `StyleTarget`); `host.page(title, buildBody, { onClose })` (Batch 1's `StylePanelHost`); `UI.settingsRow(container, {label, value, swatchColor, onClick}) -> setValue(value, valueFontFamily, swatchColor)`; `UI.colorSwatch(container, {label, value, span, onChange}) -> setValue(hex)`; `UI.numberField(container, {label, unit, value, min, max, span, onChange}) -> setValue(n)`.
- Produces: `window.StyleSection.outline(container, target, { host }) -> { render() }`. `StyleTab.design` calls it sixth.

- [ ] **Step 1: Create the section file**

Create `static/style-section-outline.js`:

```js
// Shared Outline style section for the TEXT and CAPTIONS Design tabs: a settings row
// (colour swatch + "Npx") in the panel's main view plus a drill-down subpage holding the
// outline colour and width fields. Both fields are FormatRun-capable, so they write via
// target.setField and display via target.getFieldValue.
window.StyleSection = window.StyleSection || {};

window.StyleSection.outline = function outlineSection(container, target, options) {
  const host = options.host;

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset()[...]: with a stage text selection active these must show
  // that selection's FormatRun override, not the block's base preset.
  function widthText() { return `${target.getFieldValue("outline_px")}px`; }
  function colorValue() { return target.getFieldValue("outline_color"); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Outline",
    value: widthText(),
    swatchColor: colorValue(),
    onClick: () => page.open(),
  });

  function refreshRow() { setRowValue(widthText(), null, colorValue()); }

  // StylePanelHost rebuilds the body on every open(), so building the fields here — rather
  // than in render() — is what keeps the subpage in step with the current preset.
  const page = host.page("Outline", (bodyEl) => {
    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const widthGroup = document.createElement("div");
    widthGroup.className = "style-group";
    const widthField = document.createElement("label");
    widthGroup.appendChild(widthField);

    bodyEl.append(colorGroup, widthGroup);

    UI.colorSwatch(colorField, {
      label: "Outline", value: colorValue(), span: 8,
      onChange: (v) => target.setField("outline_color", v),
    });

    UI.numberField(widthField, {
      label: "WIDTH", unit: "PX", value: target.getFieldValue("outline_px"),
      min: 0, max: 20, span: 8,
      onChange: (v) => target.setField("outline_px", v),
    });
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-color.js"></script>` line (added by Batch 3), insert:

```html
<script src="/static/style-section-outline.js"></script>
```

- [ ] **Step 3: Add `outline` to the Design tab composer**

Replace the whole of `static/style-tab-design.js` with:

```js
// Design tab composer: builds every shared style section into one container, in the one
// fixed order used by both the TEXT and CAPTIONS panels. Defining the order here — and only
// here — is what makes the shared layout structural rather than conventional.
window.StyleTab = window.StyleTab || {};

window.StyleTab.design = function design(container, target, options) {
  const host = options.host;

  // Built once. Each entry returns a { render() } handle; the composer never re-runs a factory.
  const sections = [
    StyleSection.fontFamily(container, target, { host }),
    StyleSection.fontWeight(container, target, { host, sampleText: options.sampleText }),
    StyleSection.size(container, target, { compactRow: options.compactSizeRow }),
    StyleSection.emphasis(container, target, {}),
    StyleSection.color(container, target, { host }),
    StyleSection.outline(container, target, { host }),
  ];

  return {
    // Async because fontWeight's render() awaits Api.listFontWeights(); awaiting each in turn
    // keeps the panel's rows updating in the same order they are laid out.
    async render() {
      for (const section of sections) await section.render();
    },
  };
};
```

- [ ] **Step 4: Delete the two old outline files and their script tags**

```bash
git rm static/text-panel-outline.js static/caption-panel-outline.js
```

In `static/index.html`, delete these two lines:

```html
<script src="/static/caption-panel-outline.js"></script>
<script src="/static/text-panel-outline.js"></script>
```

- [ ] **Step 5: Delete the outline markup from `index.html`**

Delete the TEXT Design-tab row (currently `index.html:679-681`):

```html
          <div class="style-group">
            <div id="text-outline-row" class="col-8"></div>
          </div>
```

Delete the CAPTIONS Design-tab row (currently `index.html:263-265`):

```html
            <div class="style-group">
              <div id="caption-outline-row" class="col-8"></div>
            </div>
```

Delete the TEXT outline subpanel (currently `index.html:787-795`):

```html
        <div id="panel-text-outline" hidden>
          <div id="text-outline-subpanel-header"></div>
          <div class="style-group">
            <label id="text-outline-color-field"></label>
          </div>
          <div class="style-group">
            <label id="text-outline-px-field"></label>
          </div>
        </div>
```

Delete the CAPTIONS outline subpanel (currently `index.html:390-398`):

```html
        <div id="panel-captions-outline" hidden>
          <div id="caption-outline-subpanel-header"></div>
          <div class="style-group">
            <label id="caption-outline-color-field"></label>
          </div>
          <div class="style-group">
            <label id="caption-outline-px-field"></label>
          </div>
        </div>
```

- [ ] **Step 6: Drop the old render calls from the two orchestrators**

In `static/panel-text.js`'s `renderTextPanel()`, delete this line:

```js
  TextPanel.renderOutline();
```

In `static/panel-captions.js`'s `renderCaptionPanel()`, delete this line:

```js
  CaptionPanel.renderOutline();
```

- [ ] **Step 7: Verify nothing still references the deleted ids**

```bash
grep -rn "renderOutline\|outline-row\|outline-subpanel\|outline-color-field\|outline-px-field\|panel-text-outline\|panel-captions-outline" static/
```

Expected: no output.

- [ ] **Step 8: Verify in the browser**

Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, create a **throwaway** project (never a real one — the unload keepalive-save writes in-memory state to disk), import any clip, then:

1. Add a text block. Open the TEXT panel → Design tab. Expected: an `Outline` row sits between `Color` and `Shadow`, showing a black swatch and `4px`.
2. Click it. Expected: a subpage titled "Outline" with a back arrow, an "Outline" colour swatch and a `WIDTH (PX)` field showing `4`.
3. Set WIDTH to `12`. Expected: the stage text's outline visibly thickens as you type.
4. Change the colour to red. Expected: the stage outline turns red.
5. Click the back arrow. Expected: the main view returns and the Outline row now reads `12px` with a red swatch.
6. Run auto-caption (or add caption words), open the CAPTIONS panel → Design tab, and repeat steps 1–5 against the caption text on the stage.
7. Browser console: no errors.

- [ ] **Step 9: Verify the FormatRun path on TEXT**

Still in the throwaway project:

1. TEXT panel, Design tab. Type `Hello world` into the stage text block, then select only the word `Hello` on the stage.
2. Open Outline and set WIDTH to `20`, then pick a bright colour.
3. Expected: **only** `Hello` gets the thick coloured outline; `world` keeps the block's outline. This is the `setField` path the CAPTIONS panel cannot exercise.
4. Click back. Expected: the Outline row shows `20px` and the bright swatch — the selection's values, read via `getFieldValue`, not the base preset's.
5. Click elsewhere on the stage to clear the selection, then re-open the TEXT panel. Expected: the Outline row is back to the block's base `12px` / red.

- [ ] **Step 10: Run the JS suite**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, unchanged from Task 0's run (this batch adds no pure modules).

- [ ] **Step 11: Commit**

```bash
git add static/style-section-outline.js static/style-tab-design.js static/index.html static/panel-text.js static/panel-captions.js
git commit -m "refactor: one shared Outline style section for the TEXT and CAPTIONS panels"
```

---

## Task 2: Shadow section

**Files:**
- Create: `static/style-section-shadow.js`
- Modify: `static/style-tab-design.js`, `static/index.html`, `static/panel-text.js`, `static/panel-captions.js`
- Delete: `static/text-panel-shadow.js`, `static/caption-panel-shadow.js`

**Interfaces:**
- Consumes: `target.getPreset()`, `target.setPresetField(field, value)`; `host.page(title, buildBody, { onClose })`; `UI.settingsRow`, `UI.buttonGroup(container, options, activeValue, onSelect)`, `UI.colorSwatch`, `UI.numberField`.
- Produces: `window.StyleSection.shadow(container, target, { host }) -> { render() }`. `StyleTab.design` calls it seventh.

**No `setField` anywhere in this file.** `FormatRun` has no `shadow*` field (`app/models.py:113-129`), so every write is whole-preset. Using `setField` here would look correct on CAPTIONS and silently write an unreadable `run.shadow_blur` on TEXT.

- [ ] **Step 1: Create the section file**

Create `static/style-section-shadow.js`:

```js
// Shared Shadow style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the on/off toggle and the colour,
// offset-x, offset-y and blur fields. FormatRun has no shadow fields, so every control here
// writes the whole preset via target.setPresetField — never target.setField.
window.StyleSection = window.StyleSection || {};

window.StyleSection.shadow = function shadowSection(container, target, options) {
  const host = options.host;

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  function isOn() { return !!target.getPreset().shadow; }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Shadow",
    value: isOn() ? "ON" : "OFF",
    // No swatch while the shadow is off: an inert colour square reads as "this is active".
    swatchColor: isOn() ? target.getPreset().shadow_color : null,
    onClick: () => page.open(),
  });

  function refreshRow() {
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? target.getPreset().shadow_color : null);
  }

  const page = host.page("Shadow", (bodyEl) => {
    const preset = target.getPreset();

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const offsetGroup = document.createElement("div");
    offsetGroup.className = "style-group";
    const offsetRow = document.createElement("div");
    offsetRow.className = "style-row";
    const offsetXField = document.createElement("label");
    const offsetYField = document.createElement("label");
    offsetRow.append(offsetXField, offsetYField);
    offsetGroup.appendChild(offsetRow);

    const blurGroup = document.createElement("div");
    blurGroup.className = "style-group";
    const blurField = document.createElement("label");
    blurGroup.appendChild(blurField);

    bodyEl.append(toggleGroup, colorGroup, offsetGroup, blurGroup);

    // The four detail fields are hidden individually, not their .style-group wrappers, so the
    // group's own margin still occupies the same space it did before this refactor.
    function syncFields() {
      const hidden = !isOn();
      colorField.hidden = hidden;
      offsetXField.hidden = hidden;
      offsetYField.hidden = hidden;
      blurField.hidden = hidden;
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setPresetField("shadow", value === "on");
        syncFields();
        refreshRow();
      });

    UI.colorSwatch(colorField, {
      label: "Shadow", value: preset.shadow_color, span: 8,
      onChange: (v) => { target.setPresetField("shadow_color", v); refreshRow(); },
    });

    UI.numberField(offsetXField, {
      label: "OFFSET X", unit: "PX", value: preset.shadow_offset_x, min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField("shadow_offset_x", v),
    });

    UI.numberField(offsetYField, {
      label: "OFFSET Y", unit: "PX", value: preset.shadow_offset_y, min: -40, max: 40, span: 4,
      onChange: (v) => target.setPresetField("shadow_offset_y", v),
    });

    UI.numberField(blurField, {
      label: "BLUR", unit: "PX", value: preset.shadow_blur, min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField("shadow_blur", v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-outline.js"></script>` line, insert:

```html
<script src="/static/style-section-shadow.js"></script>
```

- [ ] **Step 3: Add `shadow` to the Design tab composer**

Replace the whole of `static/style-tab-design.js` with:

```js
// Design tab composer: builds every shared style section into one container, in the one
// fixed order used by both the TEXT and CAPTIONS panels. Defining the order here — and only
// here — is what makes the shared layout structural rather than conventional.
window.StyleTab = window.StyleTab || {};

window.StyleTab.design = function design(container, target, options) {
  const host = options.host;

  // Built once. Each entry returns a { render() } handle; the composer never re-runs a factory.
  const sections = [
    StyleSection.fontFamily(container, target, { host }),
    StyleSection.fontWeight(container, target, { host, sampleText: options.sampleText }),
    StyleSection.size(container, target, { compactRow: options.compactSizeRow }),
    StyleSection.emphasis(container, target, {}),
    StyleSection.color(container, target, { host }),
    StyleSection.outline(container, target, { host }),
    StyleSection.shadow(container, target, { host }),
  ];

  return {
    // Async because fontWeight's render() awaits Api.listFontWeights(); awaiting each in turn
    // keeps the panel's rows updating in the same order they are laid out.
    async render() {
      for (const section of sections) await section.render();
    },
  };
};
```

- [ ] **Step 4: Delete the two old shadow files and their script tags**

```bash
git rm static/text-panel-shadow.js static/caption-panel-shadow.js
```

In `static/index.html`, delete these two lines:

```html
<script src="/static/caption-panel-shadow.js"></script>
<script src="/static/text-panel-shadow.js"></script>
```

- [ ] **Step 5: Delete the shadow markup from `index.html`**

Delete the TEXT Design-tab row (currently `index.html:683-685`):

```html
          <div class="style-group">
            <div id="text-shadow-row" class="col-8"></div>
          </div>
```

Delete the CAPTIONS Design-tab row (currently `index.html:267-269`):

```html
            <div class="style-group">
              <div id="caption-shadow-row" class="col-8"></div>
            </div>
```

Delete the TEXT shadow subpanel (currently `index.html:797-814`):

```html
        <div id="panel-text-shadow" hidden>
          <div id="text-shadow-subpanel-header"></div>
          <div class="style-group">
            <div id="text-shadow-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="text-shadow-color-field"></label>
          </div>
          <div class="style-group">
            <div class="style-row">
              <label id="text-shadow-offset-x-field"></label>
              <label id="text-shadow-offset-y-field"></label>
            </div>
          </div>
          <div class="style-group">
            <label id="text-shadow-blur-field"></label>
          </div>
        </div>
```

Delete the CAPTIONS shadow subpanel (currently `index.html:400-417`):

```html
        <div id="panel-captions-shadow" hidden>
          <div id="caption-shadow-subpanel-header"></div>
          <div class="style-group">
            <div id="caption-shadow-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="caption-shadow-color-field"></label>
          </div>
          <div class="style-group">
            <div class="style-row">
              <label id="caption-shadow-offset-x-field"></label>
              <label id="caption-shadow-offset-y-field"></label>
            </div>
          </div>
          <div class="style-group">
            <label id="caption-shadow-blur-field"></label>
          </div>
        </div>
```

- [ ] **Step 6: Drop the old render calls from the two orchestrators**

In `static/panel-text.js`'s `renderTextPanel()`, delete this line:

```js
  TextPanel.renderShadow();
```

In `static/panel-captions.js`'s `renderCaptionPanel()`, delete this line:

```js
  CaptionPanel.renderShadow();
```

- [ ] **Step 7: Verify nothing still references the deleted ids**

```bash
grep -rn "renderShadow\|shadow-row\|shadow-subpanel\|shadow-toggle-group\|shadow-color-field\|shadow-offset-\|shadow-blur-field\|panel-text-shadow\|panel-captions-shadow" static/
```

Expected: no output.

- [ ] **Step 8: Verify in the browser**

With the server running, in the **throwaway** project:

1. TEXT panel → Design tab. Expected: a `Shadow` row directly below `Outline`, reading `OFF` with **no** colour swatch.
2. Click it. Expected: a subpage titled "Shadow" showing only an `OFF / ON` toggle — the colour, OFFSET X, OFFSET Y and BLUR fields are hidden.
3. Click `ON`. Expected: the four fields appear immediately, without the subpage flickering or losing scroll position, and the stage text gains a drop shadow.
4. Set OFFSET X to `20`, OFFSET Y to `-10`, BLUR to `12`, and pick a red shadow colour. Expected: the stage shadow follows every change live.
5. Click `OFF`. Expected: the four fields hide again and the stage shadow disappears.
6. Click `ON` again, then the back arrow. Expected: the main view returns and the Shadow row reads `ON` with a red swatch.
7. Repeat 1–6 on the CAPTIONS panel → Design tab against the caption text.
8. Browser console: no errors.

- [ ] **Step 9: Verify shadow is NOT selection-aware**

1. TEXT panel. Select only the word `Hello` on the stage.
2. Open Shadow and set BLUR to `30`.
3. Expected: the **whole** text block's shadow changes, not just `Hello`. This confirms `setPresetField` was used — a `FormatRun` write would either affect only `Hello` (if the renderer honoured it) or, more likely, appear to do nothing at all while quietly adding an unreadable `shadow_blur` key to the run.
4. In the browser console, run `currentTextBlock().formatting_runs`. Expected: no run contains a `shadow`, `shadow_color`, `shadow_offset_x`, `shadow_offset_y` or `shadow_blur` key.

- [ ] **Step 10: Run the JS suite**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, unchanged.

- [ ] **Step 11: Commit**

```bash
git add static/style-section-shadow.js static/style-tab-design.js static/index.html static/panel-text.js static/panel-captions.js
git commit -m "refactor: one shared Shadow style section for the TEXT and CAPTIONS panels"
```

---

## Task 3: Highlight section — and CAPTIONS' MARKER/MODE move into the drill-down

**Files:**
- Create: `static/style-section-highlight.js`
- Modify: `static/style-tab-design.js`, `static/index.html`, `static/panel-text.js`, `static/panel-captions.js`
- Delete: `static/text-panel-highlight.js`, `static/caption-panel-highlight.js`

**Interfaces:**
- Consumes: `target.getFieldValue(field)`, `target.setField(field, value)`, `target.getPreset()`, `target.setPresetField(field, value)`; `host.page(title, buildBody, { onClose })`; `UI.settingsRow`, `UI.buttonGroup`, `UI.colorSwatch`, `UI.numberField`.
- Produces: `window.StyleSection.highlight(container, target, { host, modes }) -> { render() }`. `StyleTab.design` calls it eighth and last, passing `modes: options.highlightModes`.

**This is the mixed-capability file.** `highlight` and `highlight_color` are on `FormatRun` and use `setField`; `highlight_mode` and `highlight_border_radius` are not and use `setPresetField`. Re-read the capability table above before writing it.

- [ ] **Step 1: Create the section file**

Create `static/style-section-highlight.js`:

```js
// Shared Highlight style section for the TEXT and CAPTIONS Design tabs: a settings row
// (swatch + "ON"/"OFF") plus a drill-down subpage holding the MARKER on/off toggle, the
// colour and the corner radius — and, when options.modes is set (CAPTIONS), the karaoke MODE
// group. highlight/highlight_color are FormatRun-capable (setField/getFieldValue);
// highlight_mode/highlight_border_radius are not (setPresetField/getPreset).
window.StyleSection = window.StyleSection || {};

window.StyleSection.highlight = function highlightSection(container, target, options) {
  const host = options.host;
  // CAPTIONS only: the three karaoke modes. TEXT has no per-word karaoke, so no MODE group.
  const modes = !!options.modes;

  // Built once, in the factory. render() only ever calls the setValue updater captured below.
  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // getFieldValue, not getPreset().highlight: with a stage text selection active the row must
  // show that selection's FormatRun override.
  function isOn() { return !!target.getFieldValue("highlight"); }
  function colorValue() { return target.getFieldValue("highlight_color"); }

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Highlight",
    value: isOn() ? "ON" : "OFF",
    swatchColor: isOn() ? colorValue() : null,
    onClick: () => page.open(),
  });

  function refreshRow() {
    setRowValue(isOn() ? "ON" : "OFF", null, isOn() ? colorValue() : null);
  }

  const page = host.page("Highlight", (bodyEl) => {
    // MODE and RADIUS are whole-preset only, so they read the preset directly.
    const preset = target.getPreset();

    // The MARKER/MODE labels only earn their keep when there are two groups to tell apart;
    // with just the toggle, the subpage's own "Highlight" header already names it.
    if (modes) {
      const markerLabel = document.createElement("div");
      markerLabel.className = "style-group-label";
      markerLabel.textContent = "MARKER";
      bodyEl.appendChild(markerLabel);
    }

    const toggleGroup = document.createElement("div");
    toggleGroup.className = "style-group";
    const toggleEl = document.createElement("div");
    toggleGroup.appendChild(toggleEl);
    bodyEl.appendChild(toggleGroup);

    let modeEl = null;
    if (modes) {
      const modeLabel = document.createElement("div");
      modeLabel.className = "style-group-label";
      modeLabel.textContent = "MODE";
      bodyEl.appendChild(modeLabel);

      const modeGroup = document.createElement("div");
      modeGroup.className = "style-group";
      modeEl = document.createElement("div");
      modeGroup.appendChild(modeEl);
      bodyEl.appendChild(modeGroup);
    }

    const colorGroup = document.createElement("div");
    colorGroup.className = "style-group";
    const colorField = document.createElement("label");
    colorGroup.appendChild(colorField);

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "style-group";
    const radiusField = document.createElement("label");
    radiusGroup.appendChild(radiusField);

    bodyEl.append(colorGroup, radiusGroup);

    // One shared visibility rule for both panels: a detail field shows exactly when the value
    // it edits can affect what renders. The colour paints the marker rect whenever the marker
    // is on, and additionally paints the karaoke word in every mode — so it is always live
    // where modes exist. The radius only matters where a rounded rect is drawn: the marker
    // rect, or "background" mode's per-word rect. On TEXT, highlight_mode is never
    // "background", so both reduce to the old !preset.highlight rule.
    function syncFields() {
      colorField.hidden = !(isOn() || modes);
      radiusField.hidden = !(isOn() || target.getPreset().highlight_mode === "background");
    }

    UI.buttonGroup(toggleEl,
      [{ value: "off", label: "OFF", span: 4 }, { value: "on", label: "ON", span: 4 }],
      isOn() ? "on" : "off",
      (value) => {
        target.setField("highlight", value === "on");
        syncFields();
        refreshRow();
      });

    if (modeEl) {
      UI.buttonGroup(modeEl,
        [{ value: "current_word", label: "Current word", span: 4 },
         { value: "progressive_fill", label: "Progressive fill", span: 4 },
         { value: "background", label: "Background", span: 8 }],
        preset.highlight_mode,
        (value) => {
          target.setPresetField("highlight_mode", value);
          syncFields();
        });
    }

    UI.colorSwatch(colorField, {
      label: "Highlight", value: colorValue(), span: 8,
      onChange: (v) => { target.setField("highlight_color", v); refreshRow(); },
    });

    UI.numberField(radiusField, {
      label: "RADIUS", unit: "PX", value: preset.highlight_border_radius,
      min: 0, max: 40, span: 8,
      onChange: (v) => target.setPresetField("highlight_border_radius", v),
    });

    syncFields();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after the `<script src="/static/style-section-shadow.js"></script>` line, insert:

```html
<script src="/static/style-section-highlight.js"></script>
```

- [ ] **Step 3: Add `highlight` to the Design tab composer — the full eight-section order**

Replace the whole of `static/style-tab-design.js` with:

```js
// Design tab composer: builds every shared style section into one container, in the one
// fixed order used by both the TEXT and CAPTIONS panels. Defining the order here — and only
// here — is what makes the shared layout structural rather than conventional.
window.StyleTab = window.StyleTab || {};

window.StyleTab.design = function design(container, target, options) {
  const host = options.host;

  // Built once, in the resolved TEXT order. Each entry returns a { render() } handle; the
  // composer never re-runs a factory. `highlightModes` is the one per-panel difference:
  // CAPTIONS gets the karaoke MODE group inside the Highlight subpage, TEXT does not.
  const sections = [
    StyleSection.fontFamily(container, target, { host }),
    StyleSection.fontWeight(container, target, { host, sampleText: options.sampleText }),
    StyleSection.size(container, target, { compactRow: options.compactSizeRow }),
    StyleSection.emphasis(container, target, {}),
    StyleSection.color(container, target, { host }),
    StyleSection.outline(container, target, { host }),
    StyleSection.shadow(container, target, { host }),
    StyleSection.highlight(container, target, { host, modes: !!options.highlightModes }),
  ];

  return {
    // Async because fontWeight's render() awaits Api.listFontWeights(); awaiting each in turn
    // keeps the panel's rows updating in the same order they are laid out.
    async render() {
      for (const section of sections) await section.render();
    },
  };
};
```

- [ ] **Step 4: Delete the two old highlight files and their script tags**

```bash
git rm static/text-panel-highlight.js static/caption-panel-highlight.js
```

In `static/index.html`, delete these two lines:

```html
<script src="/static/caption-panel-highlight.js"></script>
<script src="/static/text-panel-highlight.js"></script>
```

- [ ] **Step 5: Delete the TEXT highlight markup**

Delete the TEXT Design-tab row (currently `index.html:687-689`):

```html
          <div class="style-group">
            <div id="text-highlight-row" class="col-8"></div>
          </div>
```

Delete the TEXT highlight subpanel (currently `index.html:816-827`):

```html
        <div id="panel-text-highlight" hidden>
          <div id="text-highlight-subpanel-header"></div>
          <div class="style-group">
            <div id="text-highlight-toggle-group"></div>
          </div>
          <div class="style-group">
            <label id="text-highlight-color-field"></label>
          </div>
          <div class="style-group">
            <label id="text-highlight-radius-field"></label>
          </div>
        </div>
```

- [ ] **Step 6: Delete the CAPTIONS inline HIGHLIGHT group — the divergence itself**

Delete the whole `#caption-highlight-body` tab pane (currently `index.html:323-338`):

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

- [ ] **Step 7: Unregister `#caption-highlight-body` from the CAPTIONS tab bar**

In `static/panel-captions.js`, the Design tab currently shows two bodies. Replace this:

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

with this:

```js
// Every tab is one body now: HIGHLIGHT moved from its own always-expanded pane into the
// Design tab's Highlight drill-down row (StyleSection.highlight), matching TEXT.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  filler: [document.getElementById("caption-filler-body")],
};
```

- [ ] **Step 8: Drop the old render calls from the two orchestrators**

In `static/panel-text.js`'s `renderTextPanel()`, delete this line:

```js
  TextPanel.renderHighlight();
```

In `static/panel-captions.js`'s `renderCaptionPanel()`, delete this line:

```js
  CaptionPanel.renderHighlight();
```

- [ ] **Step 9: Verify nothing still references the deleted ids**

```bash
grep -rn "renderHighlight\|highlight-row\|highlight-subpanel\|highlight-toggle-group\|highlight-marker-group\|highlight-mode-group\|highlight-color-field\|highlight-radius-field\|highlight-border-radius-field\|caption-highlight-body\|panel-text-highlight" static/
```

Expected: no output.

Then confirm every old file in this batch is gone:

```bash
ls static/text-panel-outline.js static/caption-panel-outline.js \
   static/text-panel-shadow.js static/caption-panel-shadow.js \
   static/text-panel-highlight.js static/caption-panel-highlight.js
```

Expected: six "No such file" errors.

- [ ] **Step 10: Verify the TEXT Highlight row is unchanged**

With the server running, in the **throwaway** project:

1. TEXT panel → Design tab. Expected row order, top to bottom: `Font Family`, `Weight`, SIZE stepper row, Italic/Underline/case row, `Color`, `Outline`, `Shadow`, `Highlight`. `Highlight` reads `OFF` with no swatch.
2. Click `Highlight`. Expected: a subpage titled "Highlight" with an `OFF / ON` toggle, and **no** MARKER or MODE label and **no** mode button group. The colour and RADIUS fields are hidden.
3. Click `ON`. Expected: the colour and `RADIUS (PX)` fields appear, and a yellow highlight box appears behind the stage text.
4. Set RADIUS to `20`. Expected: the highlight's corners round off on the stage.
5. Back arrow. Expected: the Highlight row reads `ON` with a yellow swatch.

- [ ] **Step 11: Verify the CAPTIONS divergence — MARKER/MODE now live in the drill-down**

Still in the throwaway project, CAPTIONS panel:

1. Open the CAPTIONS panel → Design tab. Expected **after**: the tab shows only the font rows ending in `Outline`, `Shadow`, `Highlight`. There is **no** longer a MARKER heading, MODE heading, mode button group, colour swatch or RADIUS field sitting inline below the font rows.
   (Expected **before** this batch, for contrast: the Design tab ended with the font rows and then an always-expanded `MARKER` / `MODE` / colour / RADIUS block, with no Highlight row at all.)
2. Click the `Highlight` row. Expected: a subpage titled "Highlight" containing, in order: a `MARKER` label, an `OFF / ON` toggle, a `MODE` label, the three-button `Current word` / `Progressive fill` / `Background` group (Background on its own second line), a `Highlight` colour swatch, and — hidden for now — the `RADIUS (PX)` field.
3. With MARKER `OFF` and MODE `Current word`: the colour swatch is **visible**, the RADIUS field is **hidden**. (This is the reconciled rule doing its job — the colour is live because the karaoke mode uses it.)
4. Click MODE `Background`. Expected: the RADIUS field appears, and the stage's active caption word gains a coloured rounded rect behind it.
5. Click MODE back to `Current word`. Expected: the RADIUS field hides again and the active word goes back to being recoloured rather than boxed.
6. Click MARKER `ON`. Expected: the RADIUS field appears again (marker rect is now drawn), and a coloured box appears behind the whole caption block on the stage.
7. Change the colour to green. Expected: both the marker box and the active word update on the stage.
8. Back arrow. Expected: the Highlight row reads `ON` with a green swatch.
9. Click MARKER `OFF` again, back out. Expected: row reads `OFF`, no swatch.
10. Browser console: no errors.

- [ ] **Step 12: Verify the FormatRun path for highlight on TEXT**

1. TEXT panel. Stage text `Hello world`; select only `Hello`.
2. Open Highlight, click `ON`, pick a bright pink colour.
3. Expected: **only** `Hello` gets the pink highlight box; `world` stays unhighlighted.
4. In the browser console run `currentTextBlock().formatting_runs`. Expected: a run whose `start`/`end` cover `Hello`, carrying `highlight: true` and `highlight_color` set to the pink value — and carrying **no** `highlight_mode` or `highlight_border_radius` key.
5. Still with `Hello` selected, set RADIUS to `24`. Expected: the whole block's highlight radius changes (there is only one, on the base preset) and `formatting_runs` still has no `highlight_border_radius` key.
6. Clear the selection and re-open the TEXT panel. Expected: the Highlight row shows the block's base state (`OFF`), not the selection's.

- [ ] **Step 13: Run the master plan's full verification procedure**

1. `node --test "tests/js/**/*.test.js"` — PASS, unchanged from Task 0.
2. `.venv/Scripts/python -m pytest -q` — PASS, unchanged (this batch touches no Python).
3. In the throwaway project, exercise every control this batch touched on **both** panels: Outline colour/width, Shadow on/off/colour/offsets/blur, Highlight on/off/colour/radius, plus CAPTIONS' MODE. Confirm the stage updates for each.
4. Reload the page (`F5`) and re-open both panels. Expected: every value from step 3 persisted, and both Design tabs still show all eight rows in the fixed order.
5. Screenshot both panels' Design tabs and both Highlight subpages; compare against Batch 3's screenshots. The only intended differences are the three new rows on each panel and the removal of CAPTIONS' inline HIGHLIGHT block.

- [ ] **Step 14: Commit**

```bash
git add static/style-section-highlight.js static/style-tab-design.js static/index.html static/panel-text.js static/panel-captions.js
git commit -m "refactor: one shared Highlight style section; captions MARKER/MODE move into the drill-down"
```

---

## Batch 4 done when

- [ ] `static/style-section-outline.js`, `static/style-section-shadow.js` and `static/style-section-highlight.js` exist, each opening with a purpose comment, each returning `{ render() }` from a `(container, target, options)` factory.
- [ ] `static/style-tab-design.js` lists all eight sections in the fixed order `fontFamily`, `fontWeight`, `size`, `emphasis`, `color`, `outline`, `shadow`, `highlight`, and is the only place that order is written down.
- [ ] All six old files are deleted: `text-panel-outline.js`, `caption-panel-outline.js`, `text-panel-shadow.js`, `caption-panel-shadow.js`, `text-panel-highlight.js`, `caption-panel-highlight.js` — along with their six `<script>` tags.
- [ ] Three new `<script>` tags are present in the master plan's load order, after `style-section-color.js`.
- [ ] All five old drill-down subpanels are gone from `index.html`: `#panel-text-outline`, `#panel-text-shadow`, `#panel-text-highlight`, `#panel-captions-outline`, `#panel-captions-shadow` — plus the four Design-tab row divs and the whole `#caption-highlight-body` pane.
- [ ] `grep -rn "renderOutline\|renderShadow\|renderHighlight\|caption-highlight-body" static/` returns nothing.
- [ ] `panel-captions.js`'s `captionTabPanes.design` holds exactly one body, `caption-font-body`.
- [ ] Outline colour and width write through `target.setField` and display through `target.getFieldValue`; every shadow control and `highlight_mode` / `highlight_border_radius` write through `target.setPresetField`; `highlight` and `highlight_color` write through `target.setField`.
- [ ] No `UI.settingsRow` / `UI.colorSwatch` / `UI.numberField` / `UI.buttonGroup` call happens inside any section's `render()`.
- [ ] No inline `style="..."` attribute was added to `index.html` or to any JS-built element.
- [ ] The CAPTIONS Design tab has a Highlight drill-down row and no inline MARKER/MODE block; its subpage shows MARKER, MODE, colour and radius.
- [ ] The TEXT Design tab and Highlight subpage look and behave exactly as before, except that Highlight is now selection-aware (see the behaviour note above).
- [ ] Selecting part of a TEXT heading and changing outline colour/width or highlight on/colour affects only the selection.
- [ ] `node --test "tests/js/**/*.test.js"` passes; `.venv/Scripts/python -m pytest -q` passes.
- [ ] Values survive a page reload on both panels.
- [ ] Three commits (four if Task 0's `host.closeAll()` fix was needed), and the app works in the browser at rest after each one.
