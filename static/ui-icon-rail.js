// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .icon-rail CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a narrow vertical rail of icon+label toggle buttons into `container`. items:
// [{value, icon (inline SVG markup string), label}] — omit `label` for an icon-only button.
// — set badge:true on an item to overlay a small plus, marking it as an "insert" action rather
// than a plain panel toggle.
// onSelect(value) fires on click. Returns a setActive(value) updater (mirrors buttonGroup).
window.UI.iconRail = function iconRail(container, items, activeValue, onSelect) {
  container.innerHTML = "";
  container.classList.add("icon-rail");
  const buttons = items.map(({ value, icon, label, badge }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-rail-btn";
    if (!label) btn.classList.add("icon-rail-btn-icon-only");
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", String(value === activeValue));

    const iconEl = document.createElement("span");
    iconEl.className = "icon-rail-icon";
    iconEl.innerHTML = icon;
    btn.appendChild(iconEl);

    if (badge) {
      const badgeEl = document.createElement("span");
      badgeEl.className = "icon-rail-badge";
      badgeEl.setAttribute("aria-hidden", "true");
      badgeEl.textContent = "+";
      btn.appendChild(badgeEl);
    }

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
