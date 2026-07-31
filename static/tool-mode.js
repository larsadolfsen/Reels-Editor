// Current stage tool ("select", "text", or "shape") the editor is in — drives whether a stage
// click/drag selects/drags a box, edits/inserts text, or draws a new shape. Pure, DOM-free state
// holder with a subscriber list; no persistence, always resets to "select" on reload. Exposes
// window.ToolMode.
window.ToolMode = (() => {
  let current = "select";
  const listeners = [];

  function get() {
    return current;
  }

  function set(mode) {
    if (mode === current) return;
    current = mode;
    listeners.forEach((fn) => fn(current));
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  return { get, set, onChange };
})();
