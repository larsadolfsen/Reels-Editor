// Small reusable presentational UI helpers, framework-free. Exposes window.UI.
// Depends on the .btn-group/.style-field CSS components. No app state — callers own data.
window.UI = (() => {
  // Renders a row of toggle buttons into `container`; exactly one active at a time.
  // options: [{value, label}]; onSelect(value) fires on click. Returns a setActive(value) updater.
  function buttonGroup(container, options, activeValue, onSelect) {
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
  }

  // Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") into
  // `container`. onChange(number) fires on every input event. Returns a setValue(v) updater.
  function numberField(container, { label, unit, value, step, min, max, onChange }) {
    container.innerHTML = "";
    container.classList.add("style-field");
    container.textContent = unit ? `${label} (${unit})` : label;
    const input = document.createElement("input");
    input.type = "number";
    if (step !== undefined) input.step = step;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.value = value;
    input.addEventListener("input", () => onChange(parseFloat(input.value) || 0));
    container.appendChild(input);
    return (v) => { input.value = v; };
  }

  return { buttonGroup, numberField };
})();
