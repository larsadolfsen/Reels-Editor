# Batch 1 — Foundation

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints** and **Interface contract** first — they apply to every task here.

**Deliverable:** the three pure modules, the two style targets, the panel host, and the `node --test "tests/js/**/*.test.js"` suite. Nothing is wired into the panels yet, so the app is visually unchanged. Verified by the test run alone.

**Why this batch is first:** every later batch calls `target.setField` and `host.page`. Pinning those with tests before any UI moves means a later batch that misuses them fails loudly rather than silently.

---


## Amendments from the master-plan reconciliation (2026-07-29)

Batches 2-6 were drafted in parallel against this file's contract and found three gaps in
it. The master plan is now the single authority; where a snippet below contradicts it,
**the master plan wins**.

- **Both targets must implement `setFields(obj)`** — apply every key, then save and
  re-render **once**. Without it, picking a font (which writes `font` plus a snapped
  `weight`) produces two saves and **two undo entries for a single click**. It follows the
  same `FormatRun` rules as `setField`, per key. Add it to both target files and to
  `tests/js`, alongside the existing `setField` cases.
- **`rerenderPanel()` must `return` its delegate's result.** `renderTextPanel()` and
  `renderCaptionPanel()` are both `async`; without the `return` no section can await a
  panel refresh. The snippets in this file have been corrected.
- **`font` is not selection-aware.** The contract's `setField` field list no longer
  includes `font` — see the master plan. This changes no code in Batch 1, but the target
  tests should not assert a `FormatRun` write for `font`.
- **Minor:** the caption target's default `renderPreviewWith` calls `Preview.renderCaptions`
  unguarded, while `caption-panel-font-family.js:23` and `panel-captions.js:51` both guard
  with `if (window.Preview && Preview.renderCaptions)`. Only reachable once `Preview` has
  loaded, so not a live bug — but keep the guard rather than dropping it silently.

---

## Task 1: Font size scale

**Files:**
- Create: `static/font-size-scale.js`
- Test: `tests/js/font-size-scale.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `window.FontSizeScale.FONT_SIZE_PRESETS` (number[]), `window.FontSizeScale.stepFontSizePreset(currentSize: number, direction: -1 | 1) -> number`. Batch 3's `style-section-size.js` calls both.

- [ ] **Step 1: Write the failing test**

Create `tests/js/font-size-scale.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { FONT_SIZE_PRESETS, stepFontSizePreset } = require("../../static/font-size-scale.js");

test("scale runs from 12 to 96", () => {
  assert.deepStrictEqual(FONT_SIZE_PRESETS, [12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96]);
});

test("steps up to the next preset from an on-scale value", () => {
  assert.strictEqual(stepFontSizePreset(24, 1), 36);
});

test("steps down to the previous preset from an on-scale value", () => {
  assert.strictEqual(stepFontSizePreset(24, -1), 21);
});

test("snaps up to the next larger preset from an off-scale value", () => {
  assert.strictEqual(stepFontSizePreset(30, 1), 36);
});

test("snaps down to the next smaller preset from an off-scale value", () => {
  assert.strictEqual(stepFontSizePreset(30, -1), 24);
});

test("clamps at the top instead of wrapping", () => {
  assert.strictEqual(stepFontSizePreset(96, 1), 96);
});

test("clamps at the bottom instead of wrapping", () => {
  assert.strictEqual(stepFontSizePreset(12, -1), 12);
});

// Regression: TEXT defaulted to size_px 96 while its scale stopped at 56, so
// stepping UP from 96 fell back to the last entry and moved the size DOWN.
test("stepping up from a value above the old TEXT ceiling does not shrink it", () => {
  assert.strictEqual(stepFontSizePreset(96, 1), 96);
  assert.ok(stepFontSizePreset(72, 1) > 72);
});

test("a value above the whole scale clamps to the largest preset", () => {
  assert.strictEqual(stepFontSizePreset(200, 1), 96);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/js/font-size-scale.test.js
```

Expected: FAIL — `Cannot find module '../../static/font-size-scale.js'`.

- [ ] **Step 3: Write the implementation**

Create `static/font-size-scale.js`:

```js
// The one font-size step scale shared by the TEXT and CAPTIONS SIZE controls.
// Pure: exposes window.FontSizeScale.{FONT_SIZE_PRESETS, stepFontSizePreset} in the
// browser and the same object via module.exports for node --test.
(() => {
  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96];

  // direction: -1 = down, +1 = up. Snaps to the nearest preset in that direction first
  // if currentSize isn't exactly on the scale, then clamps at the ends rather than
  // wrapping — a value past either end steps to that end, never across to the far side.
  function stepFontSizePreset(currentSize, direction) {
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  const api = { FONT_SIZE_PRESETS, stepFontSizePreset };
  if (typeof window !== "undefined") window.FontSizeScale = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/js/font-size-scale.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add static/font-size-scale.js tests/js/font-size-scale.test.js
git commit -m "feat: shared font-size step scale with node tests"
```

---

## Task 2: Format run write

**Files:**
- Create: `static/format-run-write.js`
- Test: `tests/js/format-run-write.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `window.FormatRunWrite.upsertFormatRun(block, start, end, field, value) -> run`. Task 4's `style-target-text.js` calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/js/format-run-write.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { upsertFormatRun } = require("../../static/format-run-write.js");

test("creates a run for a range that has none", () => {
  const block = { formatting_runs: [] };
  upsertFormatRun(block, 0, 4, "color", "#FF0000");
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 4, color: "#FF0000" }]);
});

test("updates in place when the exact range is re-edited", () => {
  const block = { formatting_runs: [{ start: 0, end: 4, color: "#FF0000" }] };
  upsertFormatRun(block, 0, 4, "color", "#00FF00");
  assert.strictEqual(block.formatting_runs.length, 1);
  assert.strictEqual(block.formatting_runs[0].color, "#00FF00");
});

test("adds a second field to an existing run without dropping the first", () => {
  const block = { formatting_runs: [{ start: 0, end: 4, color: "#FF0000" }] };
  upsertFormatRun(block, 0, 4, "weight", 700);
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 4, color: "#FF0000", weight: 700 }]);
});

test("keeps runs for different ranges separate", () => {
  const block = { formatting_runs: [] };
  upsertFormatRun(block, 0, 4, "color", "#FF0000");
  upsertFormatRun(block, 5, 9, "color", "#0000FF");
  assert.strictEqual(block.formatting_runs.length, 2);
});

// A freshly created block is a plain object literal with no formatting_runs key until
// the project round-trips through the backend and Pydantic fills in the [] default.
test("initialises formatting_runs when the key is absent", () => {
  const block = {};
  upsertFormatRun(block, 0, 4, "italic", true);
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 4, italic: true }]);
});

test("returns the run it wrote", () => {
  const block = {};
  const run = upsertFormatRun(block, 2, 6, "size_px", 48);
  assert.strictEqual(run, block.formatting_runs[0]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/js/format-run-write.test.js
```

Expected: FAIL — `Cannot find module '../../static/format-run-write.js'`.

- [ ] **Step 3: Write the implementation**

Create `static/format-run-write.js`:

```js
// Per-range FormatRun upsert shared by every selection-aware style control.
// Pure: exposes window.FormatRunWrite.upsertFormatRun in the browser and the same
// object via module.exports for node --test.
(() => {
  // Runs never overlap: this splits/merges as needed by finding any existing run whose
  // range exactly matches [start, end) — the common case, re-editing the same selection —
  // and updating it in place, else pushing a fresh one. Overlapping-but-not-identical
  // ranges are out of scope: the UI only ever selects fresh ranges via the browser's
  // native Selection API, so exact-range re-edits are the only overlap that occurs.
  function upsertFormatRun(block, start, end, field, value) {
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
    return run;
  }

  const api = { upsertFormatRun };
  if (typeof window !== "undefined") window.FormatRunWrite = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/js/format-run-write.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add static/format-run-write.js tests/js/format-run-write.test.js
git commit -m "feat: shared FormatRun upsert with node tests"
```

---

## Task 3: Saved-style field list

**Files:**
- Create: `static/style-fields.js`
- Test: `tests/js/style-fields.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `window.StyleFields.STYLE_FIELD_NAMES` (string[]), `window.StyleFields.styleFieldsOf(preset) -> object`. Batch 6's `style-section-preset-library.js` calls both.

**Context:** this replaces two hand-copied field lists. `text-panel-style.js:19-30` includes `highlight`; `caption-panel-style.js:15-27` omits it, so saving a caption style silently drops its MARKER on/off state. The shared list is TEXT's — the complete one.

- [ ] **Step 1: Write the failing test**

Create `tests/js/style-fields.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { STYLE_FIELD_NAMES, styleFieldsOf } = require("../../static/style-fields.js");

test("carries every style field and no identity or usage field", () => {
  assert.ok(STYLE_FIELD_NAMES.includes("font"));
  assert.ok(STYLE_FIELD_NAMES.includes("size_px"));
  assert.ok(STYLE_FIELD_NAMES.includes("x"));
  assert.ok(STYLE_FIELD_NAMES.includes("y"));
  assert.ok(!STYLE_FIELD_NAMES.includes("id"));
  assert.ok(!STYLE_FIELD_NAMES.includes("name"));
  assert.ok(!STYLE_FIELD_NAMES.includes("usage_count"));
});

// Regression: caption-panel-style.js's copy omitted `highlight` while keeping the other
// three highlight_* fields, so a saved caption style came back with MARKER off.
test("includes the highlight on/off flag alongside the other highlight fields", () => {
  assert.ok(STYLE_FIELD_NAMES.includes("highlight"));
  assert.ok(STYLE_FIELD_NAMES.includes("highlight_color"));
  assert.ok(STYLE_FIELD_NAMES.includes("highlight_mode"));
  assert.ok(STYLE_FIELD_NAMES.includes("highlight_border_radius"));
});

test("includes every shadow field", () => {
  ["shadow", "shadow_color", "shadow_offset_x", "shadow_offset_y", "shadow_blur"]
    .forEach((f) => assert.ok(STYLE_FIELD_NAMES.includes(f), `missing ${f}`));
});

test("copies only the style fields off a preset", () => {
  const preset = { id: "abc", name: "Mine", usage_count: 7, font: "Public Sans", size_px: 72, highlight: true };
  const fields = styleFieldsOf(preset);
  assert.strictEqual(fields.font, "Public Sans");
  assert.strictEqual(fields.size_px, 72);
  assert.strictEqual(fields.highlight, true);
  assert.strictEqual("id" in fields, false);
  assert.strictEqual("name" in fields, false);
  assert.strictEqual("usage_count" in fields, false);
});

test("returns a new object rather than the preset itself", () => {
  const preset = { font: "Public Sans" };
  const fields = styleFieldsOf(preset);
  fields.font = "JetBrains Mono";
  assert.strictEqual(preset.font, "Public Sans");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/js/style-fields.test.js
```

Expected: FAIL — `Cannot find module '../../static/style-fields.js'`.

- [ ] **Step 3: Write the implementation**

Create `static/style-fields.js`:

```js
// The saved-style field list: everything a TextPreset holds except identity (id/name)
// and usage stats. Pure: exposes window.StyleFields.{STYLE_FIELD_NAMES, styleFieldsOf}
// in the browser and the same object via module.exports for node --test.
(() => {
  // One list, used by both the TEXT and CAPTIONS Style tabs. Position (x/y) is included,
  // matching the pre-existing behaviour of saved styles carrying a position.
  const STYLE_FIELD_NAMES = [
    "font", "size_px", "color", "outline_color", "outline_px", "weight", "italic",
    "underline", "text_case",
    "box_width_mode", "box_height_mode", "box_width", "box_height",
    "box_background", "box_background_color",
    "box_border_width", "box_border_color", "box_border_radius",
    "align", "entrance",
    "shadow", "shadow_color", "shadow_offset_x", "shadow_offset_y", "shadow_blur",
    "highlight", "highlight_color", "highlight_mode", "highlight_border_radius",
    "x", "y",
  ];

  function styleFieldsOf(preset) {
    const out = {};
    STYLE_FIELD_NAMES.forEach((name) => { out[name] = preset[name]; });
    return out;
  }

  const api = { STYLE_FIELD_NAMES, styleFieldsOf };
  if (typeof window !== "undefined") window.StyleFields = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/js/style-fields.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add static/style-fields.js tests/js/style-fields.test.js
git commit -m "fix: one saved-style field list, including the highlight flag captions dropped"
```

---

## Task 4: Text style target

**Files:**
- Create: `static/style-target-text.js`
- Test: `tests/js/style-target-text.test.js`

**Interfaces:**
- Consumes: `FormatRunWrite.upsertFormatRun` (Task 2).
- Produces: `window.StyleTarget.forTextBlock(deps?)` returning the object defined in the master plan's Interface contract. Every section from Batch 2 onward calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/js/style-target-text.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");

const { upsertFormatRun } = require("../../static/format-run-write.js");
const { forTextBlock } = require("../../static/style-target-text.js");

// Builds a target over an in-memory block/preset with every collaborator injected, so
// no browser globals are involved. `selection` is what Preview.getActiveFormatSelection()
// would return; null means "no text is selected on the stage".
function makeTarget({ selection = null, block, preset } = {}) {
  const b = block || { id: "b1", heading: "Hello", preset_id: "p1", formatting_runs: [] };
  const p = preset || { id: "p1", color: "#FFFFFF", size_px: 96, shadow: false };
  const calls = { saves: 0, previews: 0, panels: 0 };
  const target = forTextBlock({
    getBlock: () => b,
    getPreset: () => p,
    getSelection: () => selection,
    save: () => { calls.saves += 1; },
    rerenderPreview: () => { calls.previews += 1; },
    rerenderPanel: () => { calls.panels += 1; },
    getBoxSize: () => ({ width: 500, height: 200 }),
    renderPreviewWith: (presets) => { calls.lastPreviewPresets = presets; },
    allPresets: () => ({ p1: p }),
    upsert: upsertFormatRun,
  });
  return { target, block: b, preset: p, calls };
}

test("declares itself as a text target that supports format runs", () => {
  const { target } = makeTarget();
  assert.strictEqual(target.kind, "text");
  assert.strictEqual(target.supportsFormatRuns, true);
});

test("setField writes the base preset when nothing is selected", () => {
  const { target, preset, block, calls } = makeTarget({ selection: null });
  target.setField("color", "#FF0000");
  assert.strictEqual(preset.color, "#FF0000");
  assert.strictEqual(block.formatting_runs.length, 0);
  assert.strictEqual(calls.saves, 1);
  assert.strictEqual(calls.previews, 1);
});

test("setField writes a FormatRun when a selection on this block is active", () => {
  const { target, preset, block } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 } });
  target.setField("color", "#FF0000");
  assert.strictEqual(preset.color, "#FFFFFF", "base preset must be untouched");
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 2, color: "#FF0000" }]);
});

// A stale selection belonging to a different block must not leak into this one.
test("setField writes the base preset when the selection belongs to another block", () => {
  const { target, preset, block } = makeTarget({ selection: { blockId: "OTHER", start: 0, end: 2 } });
  target.setField("color", "#FF0000");
  assert.strictEqual(preset.color, "#FF0000");
  assert.strictEqual(block.formatting_runs.length, 0);
});

test("setPresetField always writes the base preset even with a selection active", () => {
  const { target, preset, block } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 } });
  target.setPresetField("shadow", true);
  assert.strictEqual(preset.shadow, true);
  assert.strictEqual(block.formatting_runs.length, 0);
});

test("getFieldValue reads the active run's override when there is one", () => {
  const block = { id: "b1", heading: "Hello", preset_id: "p1", formatting_runs: [{ start: 0, end: 2, color: "#00FF00" }] };
  const { target } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 }, block });
  assert.strictEqual(target.getFieldValue("color"), "#00FF00");
});

test("getFieldValue falls back to the preset when the run has no override for that field", () => {
  const block = { id: "b1", heading: "Hello", preset_id: "p1", formatting_runs: [{ start: 0, end: 2, weight: 700 }] };
  const { target } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 }, block });
  assert.strictEqual(target.getFieldValue("color"), "#FFFFFF");
});

test("getFieldValue reads the preset when nothing is selected", () => {
  const { target } = makeTarget({ selection: null });
  assert.strictEqual(target.getFieldValue("size_px"), 96);
});

test("clearFormatRuns empties the block's runs", () => {
  const block = { id: "b1", preset_id: "p1", formatting_runs: [{ start: 0, end: 2, color: "#00FF00" }] };
  const { target } = makeTarget({ block });
  target.clearFormatRuns();
  assert.deepStrictEqual(block.formatting_runs, []);
});

test("previewField renders an overridden preset without writing or saving", () => {
  const { target, preset, calls } = makeTarget();
  target.previewField("font", "JetBrains Mono");
  assert.strictEqual(preset.font, undefined, "preview must not mutate the preset");
  assert.strictEqual(calls.saves, 0);
  assert.strictEqual(calls.lastPreviewPresets.p1.font, "JetBrains Mono");
});

test("cancelPreview re-renders from the unmodified presets", () => {
  const { target, calls } = makeTarget();
  target.previewField("font", "JetBrains Mono");
  target.cancelPreview();
  assert.strictEqual(calls.previews, 1);
});

test("getBoxSize returns the block's rendered size", () => {
  const { target } = makeTarget();
  assert.deepStrictEqual(target.getBoxSize(), { width: 500, height: 200 });
});

// setFields exists because picking a font writes `font` plus a snapped `weight` in one
// user action. Two separate setField calls would mean two saves and two undo entries
// for a single click.
test("setFields writes several base-preset fields with exactly one save", () => {
  const { target, preset, block, calls } = makeTarget({ selection: null });
  target.setFields({ font: "JetBrains Mono", weight: 700 });
  assert.strictEqual(preset.font, "JetBrains Mono");
  assert.strictEqual(preset.weight, 700);
  assert.strictEqual(block.formatting_runs.length, 0);
  assert.strictEqual(calls.saves, 1);
  assert.strictEqual(calls.previews, 1);
});

test("setFields writes several FormatRun fields into the same run with one save", () => {
  const { target, preset, block, calls } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 } });
  target.setFields({ color: "#FF0000", weight: 700 });
  assert.strictEqual(preset.color, "#FFFFFF", "base preset must be untouched");
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 2, color: "#FF0000", weight: 700 }]);
  assert.strictEqual(calls.saves, 1);
});

// Regression: `font` must never become selection-aware (raised and declined), no matter
// which method writes it or whether it's batched with a field that IS FormatRun-capable.
test("setField never writes font into a FormatRun even with a selection active", () => {
  const { target, preset, block } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 } });
  target.setField("font", "JetBrains Mono");
  assert.strictEqual(preset.font, "JetBrains Mono");
  assert.strictEqual(block.formatting_runs.length, 0);
});

test("setFields splits a mixed batch: font stays on the preset, weight goes into the run", () => {
  const { target, preset, block, calls } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 } });
  target.setFields({ font: "JetBrains Mono", weight: 700 });
  assert.strictEqual(preset.font, "JetBrains Mono");
  assert.strictEqual(preset.weight, undefined, "weight must not also land on the preset");
  assert.deepStrictEqual(block.formatting_runs, [{ start: 0, end: 2, weight: 700 }]);
  assert.strictEqual(calls.saves, 1);
});

test("getFieldValue never reads font from a FormatRun even if one somehow has it", () => {
  const block = { id: "b1", heading: "Hello", preset_id: "p1", formatting_runs: [{ start: 0, end: 2, font: "Stale Legacy Font" }] };
  const { target } = makeTarget({ selection: { blockId: "b1", start: 0, end: 2 }, block, preset: { id: "p1", font: "Public Sans" } });
  assert.strictEqual(target.getFieldValue("font"), "Public Sans");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/js/style-target-text.test.js
```

Expected: FAIL — `Cannot find module '../../static/style-target-text.js'`.

- [ ] **Step 3: Write the implementation**

Create `static/style-target-text.js`:

```js
// Style target for a text block: the adapter every shared style section writes through.
// Absorbs the TEXT panel's selection-aware behaviour — setField writes a per-range
// FormatRun when a stage selection is active — so the sections above stay branch-free.
// Guarded dual export like the pure modules: the factory itself has no browser
// dependency (only its *default* deps fallback does, and that path is only evaluated
// when called with no argument, which tests never do), so it must be Node-requireable.
(() => {
// The only fields a FormatRun can override. `font` is deliberately excluded — per-range
// fonts inside one heading were raised and declined (master plan, "Raised and declined")
// — so setField/setFields/getFieldValue all treat `font` as preset-only no matter what
// is selected, regardless of which method a caller reaches for. This is enforced here,
// once, rather than relying on every call site to remember not to pass `font` to a
// selection-aware method.
const FORMAT_RUN_FIELDS = new Set([
  "size_px", "color", "outline_color", "outline_px", "weight",
  "italic", "underline", "highlight", "highlight_color",
]);

function forTextBlock(deps) {
  // Collaborators are injected so this is testable outside a browser; in the app it is
  // called with no argument and falls back to editor.js's globals.
  const d = deps || {
    getBlock: () => currentTextBlock(),
    getPreset: (id) => ensureTextPreset(id),
    getSelection: () => Preview.getActiveFormatSelection(),
    save: () => saveProject(),
    rerenderPreview: () => renderTextPreview(),
    rerenderPanel: () => renderTextPanel(),
    getBoxSize: (id) => Preview.getTextBoxSize(id),
    renderPreviewWith: (presets) => {
      if (window.Preview && Preview.renderText) Preview.renderText(project, presets, Preview.currentTimelineTime());
    },
    allPresets: () => project.text_presets,
    upsert: FormatRunWrite.upsertFormatRun,
  };

  function preset() { return d.getPreset(d.getBlock().preset_id); }

  // The selection only counts when it belongs to the block currently being edited — a
  // stale selection left on another block must never redirect this block's writes.
  function activeSelection() {
    const sel = d.getSelection();
    return sel && sel.blockId === d.getBlock().id ? sel : null;
  }

  return {
    kind: "text",
    supportsFormatRuns: true,

    getPreset: preset,

    getFieldValue(field) {
      const sel = activeSelection();
      if (sel && FORMAT_RUN_FIELDS.has(field)) {
        const runs = d.getBlock().formatting_runs || [];
        const run = runs.find((r) => r.start === sel.start && r.end === sel.end);
        if (run && run[field] != null) return run[field];
      }
      return preset()[field];
    },

    setField(field, value) {
      const sel = activeSelection();
      if (sel && FORMAT_RUN_FIELDS.has(field)) {
        d.upsert(d.getBlock(), sel.start, sel.end, field, value);
      } else {
        preset()[field] = value;
      }
      d.save();
      d.rerenderPreview();
    },

    // Same per-field routing as setField, but ONE save/re-render for the whole batch —
    // picking a font writes `font` (never selection-aware) plus a snapped `weight`
    // (selection-aware) in a single user action, and two setField calls would mean two
    // undo entries for one click.
    setFields(fields) {
      const sel = activeSelection();
      Object.keys(fields).forEach((field) => {
        if (sel && FORMAT_RUN_FIELDS.has(field)) {
          d.upsert(d.getBlock(), sel.start, sel.end, field, fields[field]);
        } else {
          preset()[field] = fields[field];
        }
      });
      d.save();
      d.rerenderPreview();
    },

    setPresetField(field, value) {
      preset()[field] = value;
      d.save();
      d.rerenderPreview();
    },

    previewField(field, value) {
      const p = preset();
      d.renderPreviewWith({ ...d.allPresets(), [p.id]: { ...p, [field]: value } });
    },

    cancelPreview() { d.rerenderPreview(); },

    clearFormatRuns() { d.getBlock().formatting_runs = []; },

    rerenderPreview() { d.rerenderPreview(); },
    rerenderPanel() { return d.rerenderPanel(); },
    getBoxSize() { return d.getBoxSize(d.getBlock().id); },
  };
}

const api = { forTextBlock };
if (typeof window !== "undefined") window.StyleTarget = Object.assign(window.StyleTarget || {}, api);
if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/js/style-target-text.test.js
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add static/style-target-text.js tests/js/style-target-text.test.js
git commit -m "feat: text style target adapter with node tests"
```

---

## Task 5: Caption style target

**Files:**
- Create: `static/style-target-caption.js`
- Test: `tests/js/style-target-caption.test.js`

**Interfaces:**
- Consumes: nothing (no `FormatRunWrite` — captions have no per-range overrides).
- Produces: `window.StyleTarget.forCaptionTrack(deps?)` returning the same object shape as `forTextBlock`.

- [ ] **Step 1: Write the failing test**

Create `tests/js/style-target-caption.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");

const { forCaptionTrack } = require("../../static/style-target-caption.js");

function makeTarget() {
  const p = { id: "p1", color: "#FFFFFF", size_px: 72, shadow: false };
  const calls = { saves: 0, previews: 0, panels: 0 };
  const target = forCaptionTrack({
    getPreset: () => p,
    getSelection: () => null,
    save: () => { calls.saves += 1; },
    rerenderPreview: () => { calls.previews += 1; },
    rerenderPanel: () => { calls.panels += 1; },
    getBoxSize: () => ({ width: 900, height: 350 }),
    renderPreviewWith: (presets) => { calls.lastPreviewPresets = presets; },
    allPresets: () => ({ p1: p }),
  });
  return { target, preset: p, calls };
}

test("declares itself as a caption target with no format-run support", () => {
  const { target } = makeTarget();
  assert.strictEqual(target.kind, "caption");
  assert.strictEqual(target.supportsFormatRuns, false);
});

test("setField writes the preset", () => {
  const { target, preset, calls } = makeTarget();
  target.setField("color", "#FF0000");
  assert.strictEqual(preset.color, "#FF0000");
  assert.strictEqual(calls.saves, 1);
  assert.strictEqual(calls.previews, 1);
});

// setField and setPresetField are indistinguishable here by design — that is exactly why
// the TEXT target's tests above are the ones that pin the difference.
test("setPresetField writes the preset the same way setField does", () => {
  const { target, preset } = makeTarget();
  target.setPresetField("shadow", true);
  assert.strictEqual(preset.shadow, true);
});

test("getFieldValue reads the preset", () => {
  const { target } = makeTarget();
  assert.strictEqual(target.getFieldValue("size_px"), 72);
});

test("clearFormatRuns is a no-op that does not throw", () => {
  const { target } = makeTarget();
  assert.doesNotThrow(() => target.clearFormatRuns());
});

test("previewField renders an overridden preset without writing or saving", () => {
  const { target, preset, calls } = makeTarget();
  target.previewField("font", "JetBrains Mono");
  assert.strictEqual(preset.font, undefined);
  assert.strictEqual(calls.saves, 0);
  assert.strictEqual(calls.lastPreviewPresets.p1.font, "JetBrains Mono");
});

test("getBoxSize returns the caption box's rendered size", () => {
  const { target } = makeTarget();
  assert.deepStrictEqual(target.getBoxSize(), { width: 900, height: 350 });
});

test("setFields writes several preset fields with exactly one save", () => {
  const { target, preset, calls } = makeTarget();
  target.setFields({ font: "JetBrains Mono", weight: 700 });
  assert.strictEqual(preset.font, "JetBrains Mono");
  assert.strictEqual(preset.weight, 700);
  assert.strictEqual(calls.saves, 1);
  assert.strictEqual(calls.previews, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/js/style-target-caption.test.js
```

Expected: FAIL — `Cannot find module '../../static/style-target-caption.js'`.

- [ ] **Step 3: Write the implementation**

Create `static/style-target-caption.js`:

```js
// Style target for the caption track: the adapter every shared style section writes
// through when the CAPTIONS panel is open. Same shape as style-target-text.js, but a
// caption track has no per-range FormatRun overrides, so every write is whole-preset.
// Guarded dual export like style-target-text.js — see that file's header for why.
(() => {
function forCaptionTrack(deps) {
  // Collaborators are injected so this is testable outside a browser; in the app it is
  // called with no argument and falls back to panel-captions.js's globals.
  const d = deps || {
    getPreset: () => ensureCaptionPreset(ensureCaptionTrack().preset_id),
    save: () => saveProject(),
    rerenderPreview: () => renderCaptionPreview(),
    rerenderPanel: () => renderCaptionPanel(),
    getBoxSize: () => Preview.getCaptionBoxSize(),
    renderPreviewWith: (presets) => {
      if (window.Preview && Preview.renderCaptions) Preview.renderCaptions(project, presets, Preview.currentTimelineTime());
    },
    allPresets: () => project.text_presets,
  };

  function writePreset(field, value) {
    d.getPreset()[field] = value;
    d.save();
    d.rerenderPreview();
  }

  return {
    kind: "caption",
    supportsFormatRuns: false,

    getPreset: () => d.getPreset(),
    getFieldValue: (field) => d.getPreset()[field],

    // Identical by design: with no format runs there is nothing for setField to target
    // other than the preset. Both exist so sections can be written once for both panels.
    setField: writePreset,
    setPresetField: writePreset,

    // No selection routing needed — every key just lands on the preset, one save/re-render
    // for the whole batch, same as the TEXT target's setFields.
    setFields(fields) {
      const p = d.getPreset();
      Object.keys(fields).forEach((field) => { p[field] = fields[field]; });
      d.save();
      d.rerenderPreview();
    },

    previewField(field, value) {
      const p = d.getPreset();
      d.renderPreviewWith({ ...d.allPresets(), [p.id]: { ...p, [field]: value } });
    },

    cancelPreview() { d.rerenderPreview(); },

    clearFormatRuns() { /* captions have no per-range overrides */ },

    rerenderPreview() { d.rerenderPreview(); },
    rerenderPanel() { return d.rerenderPanel(); },
    getBoxSize() { return d.getBoxSize(); },
  };
}

const api = { forCaptionTrack };
if (typeof window !== "undefined") window.StyleTarget = Object.assign(window.StyleTarget || {}, api);
if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/js/style-target-caption.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add static/style-target-caption.js tests/js/style-target-caption.test.js
git commit -m "feat: caption style target adapter with node tests"
```

---

## Task 6: Style panel host

**Files:**
- Create: `static/style-panel-host.js`
- Modify: `static/index.html` (add the six new script tags)

**Interfaces:**
- Consumes: `UI.subPanelHeader` (`static/ui-sub-panel-header.js`).
- Produces: `window.StylePanelHost(mainEl, drillEl) -> { page(title, buildBody, options?), closeAll() }`, where `page(...)` returns `{ open(), close(), bodyEl }`. Batches 2, 3, 4 pass a host into their sections.

**Not unit-tested** — it is DOM wiring with no decision logic. It is exercised by every drill-down in Batches 2–4 and verified in the browser there. Keep it thin; if logic accumulates here, extract it to a pure module with tests.

- [ ] **Step 1: Write the implementation**

Create `static/style-panel-host.js`:

```js
// Generic drill-down subpage manager for the TEXT and CAPTIONS panels: registers a
// subpage against a panel's main view, builds its back-arrow header, and toggles which
// of the two is visible. Replaces the per-control openXPanel/closeXPanel function pairs.
window.StylePanelHost = function StylePanelHost(mainEl, drillEl) {
  const pages = [];

  // Closes through each open page's own close() — not a bare `hidden = true` sweep — so
  // an onClose callback (Batch 2's hover-preview cancel, Batch 4's row refresh) still
  // fires when closeAll() runs at the top of a panel render. A page that was never open
  // is left alone; mainEl is always shown regardless, since nothing else does that if no
  // page happened to be open.
  function closeAll() {
    pages.forEach((p) => { if (!p.el.hidden) p.close(); });
    mainEl.hidden = false;
  }

  function page(title, buildBody, options) {
    const opts = options || {};

    const el = document.createElement("div");
    el.className = "style-sub-panel";
    el.hidden = true;

    const header = document.createElement("div");
    el.appendChild(header);

    const bodyEl = document.createElement("div");
    el.appendChild(bodyEl);

    drillEl.appendChild(el);

    const handle = {
      el,
      bodyEl,
      open() {
        // The body is rebuilt on every open so a subpage always reflects the current
        // preset — the old per-control panels re-ran their list render for the same reason.
        bodyEl.innerHTML = "";
        buildBody(bodyEl);
        pages.forEach((p) => { p.el.hidden = true; });
        mainEl.hidden = true;
        el.hidden = false;
      },
      close() {
        el.hidden = true;
        mainEl.hidden = false;
        if (opts.onClose) opts.onClose();
      },
    };

    UI.subPanelHeader(header, { title, onBack: handle.close });

    pages.push(handle);
    return handle;
  }

  return { page, closeAll };
};
```

- [ ] **Step 2: Add a `.style-sub-panel` rule**

The subpage wrapper needs no styling of its own beyond participating in the panel flow — `sub-panel.css` already styles the header and lists. Append to `static/css/components/sub-panel.css`:

```css
/* Wrapper the StylePanelHost creates around each drill-down subpage's header + body.
   Layout only — the header and any list inside keep their existing styling. */
.style-sub-panel {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 3: Add the script tags**

In `static/index.html`, immediately after the `<script src="/static/ui-project-picker.js"></script>` line, insert:

```html
<script src="/static/font-size-scale.js"></script>
<script src="/static/format-run-write.js"></script>
<script src="/static/style-fields.js"></script>
<script src="/static/style-target-text.js"></script>
<script src="/static/style-target-caption.js"></script>
<script src="/static/style-panel-host.js"></script>
```

- [ ] **Step 4: Verify the app still loads clean**

Start the server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, open a throwaway project, and check the browser console.

Expected: no errors. The panels look and behave exactly as before — nothing is wired to the new files yet. In the console, `StyleTarget.forTextBlock` and `StylePanelHost` are both functions.

- [ ] **Step 5: Run the whole JS suite**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, 45 tests across 5 files.

- [ ] **Step 6: Commit**

```bash
git add static/style-panel-host.js static/css/components/sub-panel.css static/index.html
git commit -m "feat: generic drill-down subpage host for the style panels"
```

---

## Task 7: Record the test command

**Files:**
- Modify: `CLAUDE.md` (Run commands section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks. Documentation only.

- [ ] **Step 1: Add the command**

In `CLAUDE.md`, under `## Run commands`, immediately after the `- Tests: ...pytest -q` line, add:

```markdown
- Frontend tests: `node --test "tests/js/**/*.test.js"` (pure JS modules only — no DOM, no dependencies)
```

- [ ] **Step 2: Verify both suites pass**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: PASS, 45 tests.

```bash
.venv/Scripts/python -m pytest -q
```

Expected: PASS, unchanged from before this batch.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the node --test frontend test command"
```

---

## Batch 1 done when

- `node --test "tests/js/**/*.test.js"` passes with 45 tests across 5 files.
- `.venv/Scripts/python -m pytest -q` passes.
- The app loads with no console errors and both panels behave exactly as before.
- `StyleTarget.forTextBlock`, `StyleTarget.forCaptionTrack` and `StylePanelHost` are available in the browser console.
- One commit per task at minimum (seven). Additional commits are expected and fine when a task-reviewer or the final whole-branch review finds something to fix before merge — the substance (all seven tasks complete and reviewed clean) is what this checklist is really pinning, not an exact commit count.
