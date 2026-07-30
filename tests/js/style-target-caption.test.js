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

test("exists() is always true — a caption track is auto-created, never absent", () => {
  const { target } = makeTarget();
  assert.strictEqual(target.exists(), true);
});
