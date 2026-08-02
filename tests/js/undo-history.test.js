// window.UndoHistory is a pure two-stack snapshot machine with no test coverage — a broken
// undo/redo would be highly user-visible and easy to miss by inspection alone.
const test = require("node:test");
const assert = require("node:assert");

function load() {
  global.window = global; // undo-history.js assigns window.UndoHistory unconditionally
  delete require.cache[require.resolve("../../static/undo-history.js")];
  require("../../static/undo-history.js");
  window.UndoHistory.reset();
  return window.UndoHistory;
}

test("record then undo returns the snapshot recorded before the current one", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  UndoHistory.record("v2");
  assert.strictEqual(UndoHistory.undo("v3"), "v2");
});

test("record dedupes a snapshot identical to the top of the undo stack", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  UndoHistory.record("v1");
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 1, redo: 0 });
});

test("undo pushes the current snapshot onto the redo stack", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  UndoHistory.undo("v2");
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 0, redo: 1 });
});

test("redo returns the most recently undone snapshot and restores it to the undo stack", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  const restored = UndoHistory.undo("v2"); // restored === "v1"; "v2" now sits on the redo stack
  assert.strictEqual(UndoHistory.redo(restored), "v2");
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 1, redo: 0 });
});

test("a fresh record after an undo clears the redo future", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  UndoHistory.undo("v2");
  UndoHistory.record("v3");
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 1, redo: 0 });
  assert.strictEqual(UndoHistory.redo("v3"), null);
});

test("undo on an empty stack is a no-op returning null", () => {
  const UndoHistory = load();
  assert.strictEqual(UndoHistory.undo("v1"), null);
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 0, redo: 0 });
});

test("redo on an empty stack is a no-op returning null", () => {
  const UndoHistory = load();
  assert.strictEqual(UndoHistory.redo("v1"), null);
});

test("the undo stack evicts the oldest entry once it exceeds the 50-entry cap", () => {
  const UndoHistory = load();
  for (let i = 0; i < 51; i++) UndoHistory.record(`v${i}`);
  assert.strictEqual(UndoHistory._debug().undo, 50);
  // oldest ("v0") was dropped: 50 undos should bottom out at "v1", never reach "v0"
  let last = "current";
  for (let i = 0; i < 50; i++) last = UndoHistory.undo(last);
  assert.strictEqual(last, "v1");
  assert.strictEqual(UndoHistory.undo(last), null);
});

test("reset clears both stacks", () => {
  const UndoHistory = load();
  UndoHistory.record("v1");
  UndoHistory.undo("v2");
  UndoHistory.reset();
  assert.deepStrictEqual(UndoHistory._debug(), { undo: 0, redo: 0 });
});
