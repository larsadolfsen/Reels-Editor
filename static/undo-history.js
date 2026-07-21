// Pure per-session undo/redo state machine over whole-project JSON snapshots.
// Two stacks of strings, cap 50, no DOM/fetch — all editor wiring lives in editor.js.
// Exposes window.UndoHistory.{record, undo, redo, reset, _debug}.
window.UndoHistory = (() => {
  const CAP = 50;
  let undoStack = [];
  let redoStack = [];

  function record(snapshot) {
    if (undoStack.length && undoStack[undoStack.length - 1] === snapshot) return; // dedupe
    undoStack.push(snapshot);
    if (undoStack.length > CAP) undoStack.shift(); // drop oldest
    redoStack = []; // a fresh edit invalidates the redo future
  }

  function undo(current) {
    if (!undoStack.length) return null;
    redoStack.push(current);
    return undoStack.pop();
  }

  function redo(current) {
    if (!redoStack.length) return null;
    undoStack.push(current);
    return redoStack.pop();
  }

  function reset() {
    undoStack = [];
    redoStack = [];
  }

  function _debug() {
    return { undo: undoStack.length, redo: redoStack.length };
  }

  return { record, undo, redo, reset, _debug };
})();
