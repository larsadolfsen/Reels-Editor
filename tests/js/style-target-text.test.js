const test = require("node:test");
const assert = require("node:assert");

// static/style-target-text.js writes unconditionally to `window` (no `typeof window`
// guard, unlike format-run-write.js/font-size-scale.js/style-fields.js) and this test
// reads its result off `global` rather than a module.exports return value, so `window`
// must be bridged to `global` before either require — otherwise requiring the file
// throws `ReferenceError: window is not defined` in plain Node.
global.window = global;
require("../../static/format-run-write.js");
require("../../static/style-target-text.js");
const { forTextBlock } = global.StyleTarget;

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
    upsert: global.FormatRunWrite.upsertFormatRun,
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
