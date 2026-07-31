// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .icon-rail CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a narrow vertical rail of icon+label toggle buttons into `container`. items:
// [{value, icon (inline SVG markup string), label, title, shortcut}] — omit `label` for an
// icon-only button; `title`/`shortcut` (both optional, added 2026-07-31 rail-nav-tooltips) set a
// native `title` attribute + `data-tooltip-shortcut`, which ui-tooltip.js's MutationObserver
// auto-upgrades into the app's styled hover tooltip — no extra wiring needed here.
// onSelect(value) fires on click. Returns a setActive(value) updater (mirrors buttonGroup).
window.UI.iconRail = function iconRail(container, items, activeValue, onSelect) {
  container.innerHTML = "";
  container.classList.add("icon-rail");
  const buttons = items.map(({ value, icon, label, title, shortcut }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-rail-btn";
    if (!label) btn.classList.add("icon-rail-btn-icon-only");
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", String(value === activeValue));
    if (title) btn.title = title;
    if (shortcut) btn.dataset.tooltipShortcut = shortcut;

    const iconEl = document.createElement("span");
    iconEl.className = "icon-rail-icon";
    iconEl.innerHTML = icon;
    btn.appendChild(iconEl);

    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "icon-rail-label";
      labelEl.textContent = label;
      btn.appendChild(labelEl);
    }

    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });
  return (value) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
};
