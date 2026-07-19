# Fit Text to Box (FILL mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third BOX-accordion SIZE mode, FILL, where the box is a fixed pixel size and the font size auto-computes (grows or shrinks) so the wrapped heading fills it as large as possible without overflowing.

**Architecture:** A new pure client-side module (`static/font-fit.js`, mirroring `app/font_metrics.py`) does a canvas-measured binary search over font size, wraps the text, and overwrites `TextPreset.size_px` — persisted like any other field. `preview.js` calls this once per render for FILL-mode blocks (memoized so it's cheap during 60fps playback). Export (`ass_render.py`) needs almost no change: it already treats `"fixed"` box dimensions as authoritative, so `"fill"` just gets added to the same mode check and reuses the client-persisted `size_px` — no server-side re-fitting.

**Tech Stack:** FastAPI/Pydantic backend (`app/`), vanilla JS/no-build frontend (`static/`), Pillow/fontTools for export-time text measurement, native Canvas 2D `measureText` for preview-time measurement.

## Global Constraints

- No JS build step/bundler — every `static/*.js` file is a plain `<script>` tag; new files must be added to `static/index.html`'s script list in dependency order.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup (CLAUDE.md convention) — this plan adds none (all new styling reuses existing CSS classes / native `disabled` attributes).
- Every `static/*.js` file opens with a one- or two-line comment stating its purpose.
- Tests: `.venv/Scripts/python -m pytest -q`. No JS test runner exists in this project — new JS math is verified manually in-browser via the browser preview tool, per this plan's Task 1 verification step.
- Reuse existing padding/line-height constants (`BOX_PAD_X_EM = 0.35`, `BOX_PAD_Y_EM = 0.15`, `LINE_HEIGHT = 1.15`, from `app/ass_render.py`) and the existing SIZE field's bounds (`min: 24, max: 200`, from `static/text-panel-font-style.js`) — do not invent new constants.

---

## Task 1: `static/font-fit.js` — pure fit algorithm

**Files:**
- Create: `static/font-fit.js`
- Modify: `static/index.html` (add script tag)

**Interfaces:**
- Consumes: nothing (pure module, only touches an offscreen `<canvas>` it creates itself).
- Produces: `window.FontFit.wrapText(text, measureFn, maxWidthPx) -> string`, `window.FontFit.canvasMeasurer(fontFamily, sizePx, {bold, italic}) -> (text) => number`, `window.FontFit.fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx, {minSize, maxSize, padXEm, padYEm, lineHeight}) -> {size: number, wrappedText: string}`. Task 3 (`preview.js`) is the only consumer.

- [ ] **Step 1: Create `static/font-fit.js`**

```js
// Pure text-fit math for the BOX accordion's FILL mode: word-wrap plus a canvas-based
// font-size binary search. Mirrors app/font_metrics.py's wrap_text/pil_font_measurer.
// Exposes window.FontFit.{wrapText, canvasMeasurer, fitFontSize}.
window.FontFit = (() => {
  function wrapText(text, measureFn, maxWidthPx) {
    const outLines = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(" ");
      let line = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`;
        if (measureFn(candidate) <= maxWidthPx) {
          line = candidate;
        } else {
          outLines.push(line);
          line = word;
        }
      }
      outLines.push(line);
    }
    return outLines.join("\n");
  }

  let sharedCanvas = null;
  function canvasMeasurer(fontFamily, sizePx, { bold = false, italic = false } = {}) {
    if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
    const ctx = sharedCanvas.getContext("2d");
    const weight = bold ? "bold " : "";
    const style = italic ? "italic " : "";
    ctx.font = `${style}${weight}${sizePx}px "${fontFamily}"`;
    return (text) => ctx.measureText(text).width;
  }

  function fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx,
      { minSize = 24, maxSize = 200, padXEm = 0.35, padYEm = 0.15, lineHeight = 1.15 } = {}) {
    function evalSize(size) {
      const measure = measurerFactory(size);
      const padX = padXEm * size * 2;
      const padY = padYEm * size * 2;
      const wrapped = wrapText(text, measure, Math.max(1, boxWidthPx - padX));
      const lines = wrapped.split("\n");
      const width = Math.max(...lines.map(measure)) + padX;
      const height = lines.length * size * lineHeight + padY;
      return { fits: width <= boxWidthPx && height <= boxHeightPx, wrapped };
    }
    let lo = minSize, hi = maxSize;
    let best = evalSize(minSize);
    let bestSize = minSize;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const result = evalSize(mid);
      if (result.fits) {
        best = result;
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { size: bestSize, wrappedText: best.wrapped };
  }

  return { wrapText, canvasMeasurer, fitFontSize };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, find this line (currently line 362):

```html
<script src="/static/preview.js"></script>
```

Add the new script tag immediately before it, since `preview.js` (Task 3) will consume `window.FontFit`:

```html
<script src="/static/font-fit.js"></script>
<script src="/static/preview.js"></script>
```

- [ ] **Step 3: Manually verify in-browser**

Start the dev server and open the app in the browser preview tool (`.venv/Scripts/python -m uvicorn app.main:app --reload`, then open `http://127.0.0.1:8000`). Using the browser tool's JS execution, run:

```js
FontFit.wrapText("hello world", (t) => t.length * 10, 80)
```

Expected: `"hello\nworld"` (measuring 10px/char: `"hello world"` is 110px > 80, `"hello"` alone is 50px ≤ 80).

```js
const measurerFactory = (size) => (text) => text.length * size * 0.5;
FontFit.fitFontSize("ab", measurerFactory, 100, 1000)
```

Expected: an object `{ size, wrappedText: "ab" }` where `size` is the largest integer in `[24, 200]` satisfying `2 * size * 0.5 + 0.35 * size * 2 <= 100` (i.e. `1.7 * size <= 100` → `size <= 58`), so `size` should be `58`.

```js
FontFit.canvasMeasurer("Public Sans", 96, {})("BIG NEWS")
```

Expected: a positive number (actual pixel width of "BIG NEWS" at 96px Public Sans — exact value doesn't matter, just confirm it's a finite number > 0, proving the canvas measurer works against the real vendored webfont).

- [ ] **Step 4: Commit**

```bash
git add static/font-fit.js static/index.html
git commit -m "feat: add pure font-fit module for BOX FILL mode"
```

---

## Task 2: `app/ass_render.py` — treat FILL like FIXED for export layout

**Files:**
- Modify: `app/ass_render.py:51-62` (`_wrapped_lines_and_size`)
- Test: `tests/test_ass_render.py`

**Interfaces:**
- Consumes: nothing new — `TextPreset.box_width_mode`/`box_height_mode` already exist as plain `str` fields (no Pydantic literal/enum constraint to update).
- Produces: no new public functions; `_wrapped_lines_and_size(b, p)` now also treats `p.box_width_mode == "fill"` / `p.box_height_mode == "fill"` the same as `"fixed"`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_ass_render.py` (after `test_wrapped_lines_and_size_fixed_dimensions_used_as_is`, currently ending at line 133):

```python
def test_wrapped_lines_and_size_fill_mode_same_as_fixed():
    pr = TextPreset(name="Pop", size_px=48, box_width_mode="fill", box_width=200,
                     box_height_mode="fill", box_height=80)
    b = TextBlockLayer(heading="hello", preset_id=pr.id, start=0, end=2)
    text, width, height = _wrapped_lines_and_size(b, pr)
    assert (width, height) == (200, 80)

def test_box_dialogue_present_with_fill_mode():
    pr = TextPreset(name="Pop", box_background=True, box_background_color="#FF0000",
                     box_width_mode="fill", box_width=300, box_height_mode="fill", box_height=100)
    b = TextBlockLayer(heading="H", preset_id=pr.id, start=1.0, end=3.0)
    line = _box_dialogue(b, pr)
    assert line is not None
    assert "\\p1" in line and "\\p0" in line
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -k fill_mode -v`
Expected: FAIL — `test_wrapped_lines_and_size_fill_mode_same_as_fixed` fails because `_wrapped_lines_and_size` falls into the `"fit"`-style branch for an unrecognized mode value (`width`/`height` come out computed from measured text instead of the fixed `200`/`80`).

- [ ] **Step 3: Update `_wrapped_lines_and_size`**

In `app/ass_render.py`, replace:

```python
def _wrapped_lines_and_size(b, p: TextPreset) -> tuple[str, float, float]:
    measure = pil_font_measurer(p.font, p.size_px)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    if p.box_width_mode == "fixed":
        text = wrap_text(b.heading, measure, max(1, p.box_width - pad_x))
    else:
        text = b.heading
    lines = text.split("\n")
    width = p.box_width if p.box_width_mode == "fixed" else max(measure(line) for line in lines) + pad_x
    height = p.box_height if p.box_height_mode == "fixed" else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height
```

with:

```python
def _wrapped_lines_and_size(b, p: TextPreset) -> tuple[str, float, float]:
    measure = pil_font_measurer(p.font, p.size_px)
    pad_x = BOX_PAD_X_EM * p.size_px * 2
    pad_y = BOX_PAD_Y_EM * p.size_px * 2
    width_fixed = p.box_width_mode in ("fixed", "fill")
    height_fixed = p.box_height_mode in ("fixed", "fill")
    if width_fixed:
        text = wrap_text(b.heading, measure, max(1, p.box_width - pad_x))
    else:
        text = b.heading
    lines = text.split("\n")
    width = p.box_width if width_fixed else max(measure(line) for line in lines) + pad_x
    height = p.box_height if height_fixed else len(lines) * p.size_px * LINE_HEIGHT + pad_y
    return text, width, height
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python -m pytest tests/test_ass_render.py -v`
Expected: all tests PASS (the two new ones plus all pre-existing `test_ass_render.py` tests, confirming `"fixed"` mode's behavior is unchanged).

- [ ] **Step 5: Run the full suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass (no regressions elsewhere).

- [ ] **Step 6: Commit**

```bash
git add app/ass_render.py tests/test_ass_render.py
git commit -m "feat: treat box_width_mode/box_height_mode=fill like fixed in export"
```

---

## Task 3: `static/preview.js` — refit wiring + memoization

**Depends on:** Task 1 (`window.FontFit` must exist).

**Files:**
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `window.FontFit.canvasMeasurer(fontFamily, sizePx, {bold, italic})`, `window.FontFit.fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx, opts)` (both from Task 1, defaults for `opts` already match `app/ass_render.py`'s constants, so no options need to be passed explicitly).
- Produces: no new public `window.Preview.*` methods — this is an internal change to the existing `renderText()` render loop. `preset.size_px` is now mutated in place for any preset whose `box_width_mode === "fill"`, immediately before that block's CSS is computed, which downstream code (the existing `sizePx = preset.size_px / 1920 * stageH` line) already reads correctly with no further changes.

- [ ] **Step 1: Add the memoization cache and refit helper**

In `static/preview.js`, inside the `window.Preview = (() => { ... })()` IIFE, find the existing `let` declarations block (currently lines 8–22, ending with `let virtualLastTs = 0;`). Add one more module-level `const` right after it:

```js
  const fitCache = new Map(); // blockId -> { key: string, size: number }
```

Then, after the existing `hexToRgba` function (currently lines 32–35), add:

```js
  function fitCacheKey(preset, heading) {
    return JSON.stringify([heading, preset.box_width, preset.box_height, preset.font, preset.bold, preset.italic]);
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
      FontFit.canvasMeasurer(preset.font, size, { bold: preset.bold, italic: preset.italic });
    const { size } = FontFit.fitFontSize(block.heading || "", measurerFactory, preset.box_width, preset.box_height);
    preset.size_px = size;
    fitCache.set(block.id, { key, size });
  }
```

- [ ] **Step 2: Call it from the render loop**

In `renderText()`, find this block (currently lines 143–154):

```js
    for (const block of (project.text_blocks || [])) {
      const isSelected = block.id === selectedTextBlockId;
      // An empty heading normally means "nothing to show" — but the selected block must still
      // render (even empty) so there's something on the stage to click into and start typing;
      // this is the only way to enter a heading now that the side-panel textarea is gone.
      if (!block.heading && !isSelected) continue;
      if (!(block.start <= timelineTime && timelineTime < block.end)) continue;
      const preset = presets[block.preset_id];
      if (!preset) continue;
      if (keepEditingDiv && block.id === editingBlockId) continue; // already re-attached above, leave untouched

      const div = document.createElement("div");
```

Insert the refit call right after the `keepEditingDiv` skip check, before the div is created:

```js
    for (const block of (project.text_blocks || [])) {
      const isSelected = block.id === selectedTextBlockId;
      // An empty heading normally means "nothing to show" — but the selected block must still
      // render (even empty) so there's something on the stage to click into and start typing;
      // this is the only way to enter a heading now that the side-panel textarea is gone.
      if (!block.heading && !isSelected) continue;
      if (!(block.start <= timelineTime && timelineTime < block.end)) continue;
      const preset = presets[block.preset_id];
      if (!preset) continue;
      if (keepEditingDiv && block.id === editingBlockId) continue; // already re-attached above, leave untouched

      maybeRefitFillText(block, preset);

      const div = document.createElement("div");
```

- [ ] **Step 3: Update the file header comment**

`static/preview.js` currently opens with:

```js
// Preview stage playback: plays a project's clips back-to-back in timeline order,
// and composites the text-block overlay on top (renderText).
// Exposes window.Preview.{load, seek, renderText, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
```

Add one clause about the new behavior — replace the second line with:

```js
// Preview stage playback: plays a project's clips back-to-back in timeline order,
// and composites the text-block overlay on top (renderText). In BOX FILL mode, renderText()
// also auto-computes and persists preset.size_px via window.FontFit before laying out the div.
// Exposes window.Preview.{load, seek, renderText, currentTimelineTime, play, pause, restart, isPaused, setSelectedTextBlock, setOnStageTextActivate}. Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
```

- [ ] **Step 4: Manually verify in-browser**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`) and open it in the browser preview tool. Create a text block, open the TEXT panel's BOX accordion, switch SIZE to FREE, set WIDTH to 300 and HEIGHT to 150, and type a long heading (e.g. "THIS IS A FAIRLY LONG HEADING"). Note the current `size_px` doesn't matter yet — FREE mode leaves it exactly as set. Now switch SIZE to FILL (not yet wired until Task 4 adds the button — for this manual check, run `project.text_presets[Object.keys(project.text_presets)[0]].box_width_mode = "fill"` in the browser console, then call `renderTextPreview()`). Confirm via the browser tool that the text visibly shrinks or grows to fit within the 300×150 box, and that `project.text_presets[...].size_px` has changed from its previous value.

- [ ] **Step 5: Commit**

```bash
git add static/preview.js
git commit -m "feat: preview.js auto-refits font size for BOX FILL-mode blocks"
```

---

## Task 4: `static/editor.js` — SIZE row FILL button, field-visibility fix, drag-resize handling

**Files:**
- Modify: `static/editor.js:95-161`

**Interfaces:**
- Consumes: nothing new (this task doesn't call `window.FontFit` directly — Task 3's centralized `renderTextPreview()` call already handles the refit whenever this task's code paths call it).
- Produces: no new exported functions — `renderBoxPanel()` now offers `"fill"` as a `UI.buttonGroup` option, and `handleBoxResizeEnd()` preserves `"fill"` mode across a drag instead of forcing `"fixed"`.

- [ ] **Step 1: Add the FILL button and fix the field-visibility bug**

In `static/editor.js`, find (currently lines 98–107):

```js
  UI.buttonGroup(document.getElementById("text-box-size-mode-group"),
    [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FREE" }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      saveProject(); renderTextPreview(); renderBoxPanel();
    });

  const boxSizeFieldsHidden = preset.box_width_mode !== "fixed";
```

Replace with:

```js
  UI.buttonGroup(document.getElementById("text-box-size-mode-group"),
    [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FREE" }, { value: "fill", label: "FILL" }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      saveProject(); renderTextPreview(); renderBoxPanel();
    });

  // WIDTH/HEIGHT fields are needed by both FREE (manual fixed size) and FILL (fixed size that
  // auto-fits text) — only FIT (box sizes to content) has no use for them.
  const boxSizeFieldsHidden = preset.box_width_mode === "fit";
```

- [ ] **Step 2: Refit on heading-edit end (blur)**

Heading edits don't call `renderTextPreview()` while typing (the contentEditable div handles live typing natively, so FILL-mode font-size doesn't animate per keystroke — by design). To still refit once typing finishes, in `static/editor.js` find `renderTextPanel()`'s `onEditEnd` callback (currently line 91):

```js
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
```

Replace with:

```js
    onEditEnd: async (heading) => { block.heading = heading; renderTextPreview(); await saveProject(); },
```

`renderTextPreview()` runs synchronously (it just calls `Preview.renderText`, which is not async), so by the time `saveProject()` runs, any FILL-mode refit triggered inside that render has already updated `preset.size_px` — the persisted save includes the final fitted size, not the pre-edit one.

- [ ] **Step 3: Preserve FILL mode across drag-resize**

In `static/editor.js`, find (currently lines 153–161):

```js
async function handleBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  preset.box_width_mode = "fixed";
  preset.box_height_mode = "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  await saveProject();
  renderBoxPanel();
}
```

Replace with:

```js
async function handleBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  // Dragging a handle from FIT means "give this an explicit size" (switches to FREE), but
  // dragging while already in FILL should stay in FILL — autofit is only ever an explicit
  // opt-in via the SIZE button group, never a side effect of a resize drag.
  const wasFill = preset.box_width_mode === "fill";
  preset.box_width_mode = wasFill ? "fill" : "fixed";
  preset.box_height_mode = wasFill ? "fill" : "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  await saveProject();
  renderTextPreview(); // re-triggers FILL's refit against the new box dimensions
  renderBoxPanel();
}
```

- [ ] **Step 4: Manually verify in-browser**

Start the dev server and open it in the browser preview tool. Select a text block, open BOX, click FILL — confirm the WIDTH (PX)/HEIGHT (PX) fields appear (not hidden) and the button shows as pressed. Type a heading, click away to blur (triggering `onEditEnd`), and confirm the text visibly resizes to fit the box. Drag a corner resize handle to make the box bigger, release, and confirm the mode stays FILL (button still shows FILL pressed, not FREE) and the font size increases to fill the larger box.

- [ ] **Step 5: Commit**

```bash
git add static/editor.js
git commit -m "feat: wire BOX SIZE row's FILL mode and fix field-visibility bug"
```

---

## Task 5: SIZE (PX) field becomes read-only in FILL mode

**Files:**
- Modify: `static/ui-number-field.js`
- Modify: `static/text-panel-font-style.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `window.UI.numberField(container, {..., disabled})` gains an optional `disabled` boolean (default `false`) that disables the `<input>` and both stepper buttons. Any other current or future caller of `UI.numberField` is unaffected (defaults to `false`).

- [ ] **Step 1: Add `disabled` support to `UI.numberField`**

In `static/ui-number-field.js`, replace the whole file's contents with:

```js
// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .style-field/number-field CSS components. No app state — callers own data.
window.UI = window.UI || {};

// Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") with a
// custom up/down stepper (the native spin button can't be restyled) into `container`.
// onChange(number) fires on typing and on stepper clicks. Returns a setValue(v) updater.
// disabled (default false) disables the input and both stepper buttons — used e.g. by the
// TEXT panel's SIZE (PX) field when BOX's SIZE mode is FILL (size is computed, not typed).
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, disabled = false, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field");
  container.textContent = unit ? `${label} (${unit})` : label;

  const format = (v) => (decimals !== undefined ? v.toFixed(decimals) : v);

  const wrap = document.createElement("div");
  wrap.className = "number-field-wrap";

  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.value = format(value);
  input.disabled = disabled;
  input.addEventListener("input", () => onChange(parseFloat(input.value) || 0));

  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const bump = (delta) => {
    const v = clamp((parseFloat(input.value) || 0) + delta);
    input.value = format(v);
    onChange(v);
  };

  const stepper = document.createElement("div");
  stepper.className = "number-field-stepper";
  const up = document.createElement("button");
  up.type = "button"; up.className = "number-field-step number-field-step-up";
  up.setAttribute("aria-label", "Increment");
  up.disabled = disabled;
  up.addEventListener("click", () => bump(step));
  const down = document.createElement("button");
  down.type = "button"; down.className = "number-field-step number-field-step-down";
  down.setAttribute("aria-label", "Decrement");
  down.disabled = disabled;
  down.addEventListener("click", () => bump(-step));
  stepper.append(up, down);

  wrap.append(input, stepper);
  container.appendChild(wrap);
  return (v) => { input.value = format(v); };
};
```

- [ ] **Step 2: Disable the SIZE (PX) field and its step buttons in FILL mode**

In `static/text-panel-font-style.js`, find (currently lines 53–62):

```js
  window.TextPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);

    document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));

    currentSizeFieldSetValue = UI.numberField(document.getElementById("text-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200,
        onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });
```

Replace with:

```js
  window.TextPanel.renderFontStyle = function renderFontStyle() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    // BOX SIZE mode FILL computes size_px automatically (static/preview.js's maybeRefitFillText) —
    // the field still shows the live value, but typing into it would just be overwritten on the
    // next render, so it's disabled rather than hidden.
    const sizeFieldDisabled = preset.box_width_mode === "fill";

    document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
    document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
    document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));
    document.getElementById("text-size-step-down").disabled = sizeFieldDisabled;
    document.getElementById("text-size-step-up").disabled = sizeFieldDisabled;

    currentSizeFieldSetValue = UI.numberField(document.getElementById("text-size-field"),
      { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200, disabled: sizeFieldDisabled,
        onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });
```

- [ ] **Step 3: Manually verify in-browser**

Start the dev server and open it in the browser preview tool. Select a text block, open FONT — confirm SIZE (PX) and its up/down buttons are enabled and editable. Open BOX, switch SIZE to FILL, go back to FONT — confirm SIZE (PX) and its up/down buttons are now visibly disabled (greyed out, unclickable) but still show the current (auto-fitted) number. Switch BOX SIZE back to FREE — confirm the field re-enables.

- [ ] **Step 4: Commit**

```bash
git add static/ui-number-field.js static/text-panel-font-style.js
git commit -m "feat: disable SIZE (PX) field while BOX SIZE mode is FILL"
```

---

## Task 6: Integration verification, docs, and finishing the branch

**Depends on:** Tasks 1–5 all merged/applied.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full backend test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: all tests pass, including the two new ones from Task 2.

- [ ] **Step 2: End-to-end manual verification in-browser**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`) and open it in the browser preview tool.

1. Create a new text block, open BOX, switch SIZE to FILL, set WIDTH 400 / HEIGHT 200.
2. Type a short heading (e.g. "HI") — confirm the font renders large, filling most of the box.
3. Extend the heading to a long sentence — confirm the font shrinks and wraps to multiple lines, still fitting inside the 400×200 box.
4. Confirm SIZE (PX) in FONT shows the live computed number and is disabled.
5. Drag a corner handle to shrink the box — confirm the font shrinks further and the mode stays FILL.
6. Reload the page (or navigate away from TEXT and back) — confirm the fitted `size_px` persisted (the box still looks correctly fitted, not reset to a default size).
7. Export the project (`EXPORT` panel) and, using `ffprobe`/`ffmpeg` frame extraction (same technique noted in `docs/superpowers/specs/2026-07-17-text-box-design.md`'s Task 13 verification) or simply opening the exported mp4, confirm the FILL-mode text block's rendered size/wrapping visually matches the live preview (no gross mismatch, minor pixel drift is an accepted risk per the design doc).
8. Check the browser console for errors throughout — expect none.

- [ ] **Step 3: Update `CLAUDE.md`**

In `CLAUDE.md`, update the `static/editor.js` inventory bullet. Find this substring (part of the long `static/editor.js` bullet):

```
`renderBoxPanel()` (BOX accordion: width/height Fit-vs-Fixed `UI.buttonGroup` + `UI.numberField`, background `UI.colorSwatch`, border width/radius/color, added 2026-07-17, unchanged), `handleBoxResize()`/`handleBoxResizeEnd()` (stage resize-handle callbacks, unchanged)
```

Replace with:

```
`renderBoxPanel()` (BOX accordion: width/height SIZE mode `UI.buttonGroup` — FIT (size-to-content) / FREE (fixed size, manual font) / FILL (fixed size, auto-fitted font — added 2026-07-19, see `static/font-fit.js`) — + `UI.numberField`, background `UI.colorSwatch`, border width/radius/color, added 2026-07-17), `handleBoxResize()`/`handleBoxResizeEnd()` (stage resize-handle callbacks; `handleBoxResizeEnd()` preserves FILL mode across a drag instead of always forcing FREE, added 2026-07-19)
```

Next, find the `static/css/components/style-panel.css` bullet's substring:

```
BOX (width/height Fit-vs-Fixed + background/border fields)
```

Replace with:

```
BOX (width/height SIZE mode FIT/FREE/FILL + background/border fields)
```

Next, find the `app/ass_render.py` bullet (ends with `` with rounded corners from `_rounded_rect_path()`.``) and append one sentence:

```
As of 2026-07-19, `_wrapped_lines_and_size()` treats `box_width_mode`/`box_height_mode == "fill"` identically to `"fixed"` (FILL is a client-side-only distinction — see `static/font-fit.js`/`static/preview.js` — export just trusts the already-fitted `size_px`).
```

Next, add a new inventory bullet after the `app/font_metrics.py` line (alphabetically/logically grouped with the other `static/*.js` bullets — place it near the `static/preview.js` bullet), and append one sentence to the existing `static/preview.js` bullet noting the FILL-mode refit call added in Task 3:

```
- `static/font-fit.js` — `FontFit.wrapText(text, measureFn, maxWidthPx) -> string` (JS port of `app/font_metrics.py`'s `wrap_text`), `FontFit.canvasMeasurer(fontFamily, sizePx, {bold, italic}) -> measureFn` (offscreen `<canvas>` 2D `measureText`, no PIL-vs-browser drift since it measures the same webfont the browser renders with), `FontFit.fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx, opts) -> {size, wrappedText}` (binary search over `[24, 200]` using the same `BOX_PAD_X_EM`/`BOX_PAD_Y_EM`/`LINE_HEIGHT` formula as `app/ass_render.py`). Added 2026-07-19 for the BOX accordion's FILL mode; consumed only by `static/preview.js`.
```

For the `static/preview.js` bullet, append this sentence at the end:

```
As of 2026-07-19, `renderText()` calls an internal `maybeRefitFillText(block, preset)` (memoized per block via a `fitCache` keyed on heading/box size/font/bold/italic, to avoid recomputing every animation frame during playback) before laying out each block, which overwrites `preset.size_px` via `window.FontFit` whenever that block's `box_width_mode === "fill"`.
```

- [ ] **Step 4: Commit the docs update**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md inventory for BOX FILL mode"
```

- [ ] **Step 5: Finish the development branch**

Run the `superpowers:finishing-a-development-branch` skill to decide how to integrate this work (merge back to main locally and push to origin, open a PR, or other cleanup) — do not skip this step.

---

## Next-session handoff

If this plan is picked up in a fresh session rather than continued immediately:

- **Recommended:** dispatch via `superpowers:subagent-driven-development`, one fresh subagent per task, model **Sonnet 5** at **medium** reasoning effort — each task here is a well-scoped, fully-specified code change (exact diffs given), not an open-ended design problem, so high/xhigh effort isn't needed; medium balances following the exact snippets faithfully against burning excess tokens.
- Tasks 1, 2, 4, and 5 have no code dependency on each other (different files, no shared interfaces) and can run as four parallel subagents immediately.
- Task 3 must wait until Task 1's `static/font-fit.js` exists (it calls `window.FontFit`) — dispatch it once Task 1's subagent reports back.
- Task 6 must run last, after all of Tasks 1–5 have landed — it's the integration/verification/docs/finishing-branch task, and per project convention should not be parallelized or skipped.
