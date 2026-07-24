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
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>',
  },
  {
    value: "text",
    title: "Text",
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/></svg>',
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
