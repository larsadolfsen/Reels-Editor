// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .btn-group CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a row of toggle buttons into `container`; exactly one active at a time.
// options: [{value, label}]; onSelect(value) fires on click. Returns a setActive(value) updater.
window.UI.buttonGroup = function buttonGroup(container, options, activeValue, onSelect) {
  container.innerHTML = "";
  container.classList.add("btn-group");
  const buttons = options.map(({ value, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", String(value === activeValue));
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });
  return (value) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
};
