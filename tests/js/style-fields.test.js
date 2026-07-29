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
