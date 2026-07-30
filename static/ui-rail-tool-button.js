// Left rail's Select-tool button (selector-tool-rail feature, added 2026-07-30, moved out of the
// top toolbar): renders a single icon-rail-style toggle button into the given container that sets
// window.ToolMode to "select" and stays highlighted while ToolMode is "select". Switching to Text
// mode still happens via the remaining Text button in the top toolbar (static/ui-toolbar.js).
// Reuses icon-rail.css's .icon-rail-btn/.icon-rail-icon classes so it matches the FILES/TEXT/...
// rail buttons below it. Exposes window.UI.railToolButton(container).
window.UI = window.UI || {};

window.UI.railToolButton = function railToolButton(container) {
  container.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-rail-btn icon-rail-btn-icon-only";
  btn.title = "Select";
  btn.setAttribute("aria-pressed", String(ToolMode.get() === "select"));

  const iconEl = document.createElement("span");
  iconEl.className = "icon-rail-icon";
  iconEl.innerHTML = UI.icon("mouse-pointer-2", { size: 20 });
  btn.appendChild(iconEl);

  btn.addEventListener("click", () => ToolMode.set("select"));
  ToolMode.onChange((mode) => btn.setAttribute("aria-pressed", String(mode === "select")));

  container.appendChild(btn);
};
