// Top toolbar: renders the tool-mode icon button(s) into the given container, centered via
// toolbar.css's #toolbar flex layout. Highlights the active tool (window.ToolMode) and
// subscribes to ToolMode.onChange to stay in sync; clicking a button calls ToolMode.set.
// Built via UI.button (button.css); its runtime aria-pressed toggle below relies on button.css's
// .button[aria-pressed="true"] rule (added Task 16) to stay visually reactive after creation.
// The Select tool button lives in the left icon rail instead (static/ui-rail-tool-button.js,
// selector-tool-rail feature, added 2026-07-30) — this file now renders Text only.
// Exposes window.UI.toolbar(container).
window.UI = window.UI || {};

const TOOLBAR_TOOLS = [
  {
    value: "text",
    title: "Text",
    icon: "type",
  },
];

window.UI.toolbar = function toolbar(container) {
  container.innerHTML = "";
  const buttons = {};
  TOOLBAR_TOOLS.forEach((tool) => {
    // Not using UI.button's `pressed` option here: it bakes a permanent .button-pressed class
    // in at creation, which nothing ever removes — a button created pressed would stay visually
    // pressed forever once ToolMode.onChange's plain setAttribute below (matching this file's
    // pre-existing runtime-toggle contract) switches it back to unpressed. Setting the initial
    // aria-pressed via the same setAttribute path onChange uses keeps both in sync, relying
    // solely on button.css's [aria-pressed="true"] attribute selector (added Task 16).
    const btn = UI.button(container, {
      icon: tool.icon,
      size: "sm",
      onClick: () => ToolMode.set(tool.value),
    });
    btn.title = tool.title;
    btn.setAttribute("aria-pressed", String(ToolMode.get() === tool.value));
    buttons[tool.value] = btn;
  });
  ToolMode.onChange((mode) => {
    Object.entries(buttons).forEach(([value, btn]) => btn.setAttribute("aria-pressed", String(value === mode)));
  });
};
