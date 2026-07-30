// Left rail's tool-mode buttons (selector-tool-rail feature, added 2026-07-30; extended
// 2026-07-30 remove-text-tool-top-bar to also hold the Text button, replacing the now-removed
// top #toolbar / static/ui-toolbar.js entirely): renders one icon-rail-style toggle button per
// entry in RAIL_TOOLS into the given container, each setting window.ToolMode to its own value and
// staying highlighted while ToolMode matches. Reuses icon-rail.css's .icon-rail-btn/.icon-rail-icon
// classes so these match the FILES/TEXT/... rail buttons below them. Exposes
// window.UI.railToolButton(container).
window.UI = window.UI || {};

const RAIL_TOOLS = [
  { value: "select", title: "Select", icon: "mouse-pointer-2" },
  { value: "text", title: "Text", icon: "type" },
];

window.UI.railToolButton = function railToolButton(container) {
  container.innerHTML = "";
  const buttons = {};
  RAIL_TOOLS.forEach((tool) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-rail-btn icon-rail-btn-icon-only";
    btn.title = tool.title;
    btn.setAttribute("aria-pressed", String(ToolMode.get() === tool.value));

    const iconEl = document.createElement("span");
    iconEl.className = "icon-rail-icon";
    iconEl.innerHTML = UI.icon(tool.icon, { size: 20 });
    btn.appendChild(iconEl);

    btn.addEventListener("click", () => ToolMode.set(tool.value));
    buttons[tool.value] = btn;
    container.appendChild(btn);
  });
  ToolMode.onChange((mode) => {
    Object.entries(buttons).forEach(([value, btn]) => btn.setAttribute("aria-pressed", String(value === mode)));
  });
};
