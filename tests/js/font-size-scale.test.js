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
