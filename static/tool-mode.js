// Current stage tool ("select" or "text") the editor is in — drives whether a stage click
// selects/drags a box or edits/inserts text. Pure, DOM-free state holder with a subscriber
// list; no persistence, always resets to "select" on reload. Exposes window.ToolMode.
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
