// Top toolbar: renders the tool-mode icon buttons (Select/Text) into the given container,
// centered via toolbar.css's #toolbar flex layout. Highlights the active tool (window.ToolMode)
// and subscribes to ToolMode.onChange to stay in sync; clicking a button calls ToolMode.set.
// Reuses button-group.css's .icon-btn / .icon-btn[aria-pressed="true"] styling — no new
// active-state CSS needed. Exposes window.UI.toolbar(container).
window.UI = window.UI || {};

const TOOLBAR_TOOLS = [
  {
    value: "select",
    title: "Select",
    icon: UI.icon("mouse-pointer-2", { size: 16 }),
  },
  {
    value: "text",
    title: "Text",
    icon: UI.icon("type", { size: 16 }),
  },
];

window.UI.toolbar = function toolbar(container) {
  container.innerHTML = "";
  const buttons = {};
  TOOLBAR_TOOLS.forEach((tool) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn";
    btn.title = tool.title;
    btn.setAttribute("aria-pressed", String(ToolMode.get() === tool.value));
    btn.innerHTML = tool.icon;
    btn.addEventListener("click", () => ToolMode.set(tool.value));
    container.appendChild(btn);
    buttons[tool.value] = btn;
  });
  ToolMode.onChange((mode) => {
    Object.entries(buttons).forEach(([value, btn]) => btn.setAttribute("aria-pressed", String(value === mode)));
  });
};
