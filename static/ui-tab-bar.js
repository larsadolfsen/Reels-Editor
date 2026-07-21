// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .tab-bar CSS component. No app state — callers own the active tab and
// which panes it shows/hides.
window.UI = window.UI || {};

// Renders a horizontal row of icon tab buttons into `container`; exactly one active at a time.
// tabs: [{value, icon (inline SVG markup string), label}] — aria-label comes from `label`.
// onSelect(value) fires on click. Returns a setActive(value) updater (mirrors buttonGroup/iconRail).
window.UI.tabBar = function tabBar(container, tabs, activeValue, onSelect) {
  container.innerHTML = "";
  container.classList.add("tab-bar");
  container.setAttribute("role", "tablist");
  const buttons = tabs.map(({ value, icon, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-bar-btn";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-selected", String(value === activeValue));
    btn.dataset.value = value;
    btn.innerHTML = icon;
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.value === value)));
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });
  return (value) => buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.value === value)));
};
