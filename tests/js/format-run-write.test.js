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
