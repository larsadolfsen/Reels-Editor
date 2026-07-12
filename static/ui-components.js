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

  // Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") with a
  // custom up/down stepper (the native spin button can't be restyled) into `container`.
  // onChange(number) fires on typing and on stepper clicks. Returns a setValue(v) updater.
  function numberField(container, { label, unit, value, step = 1, min, max, onChange }) {
    container.innerHTML = "";
    container.classList.add("style-field");
    container.textContent = unit ? `${label} (${unit})` : label;

    const wrap = document.createElement("div");
    wrap.className = "number-field-wrap";

    const input = document.createElement("input");
    input.type = "number";
    input.step = step;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.value = value;
    input.addEventListener("input", () => onChange(parseFloat(input.value) || 0));

    const clamp = (v) => {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    };
    const bump = (delta) => {
      const v = clamp((parseFloat(input.value) || 0) + delta);
      input.value = v;
      onChange(v);
    };

    const stepper = document.createElement("div");
    stepper.className = "number-field-stepper";
    const up = document.createElement("button");
    up.type = "button"; up.className = "number-field-step number-field-step-up";
    up.setAttribute("aria-label", "Increment");
    up.addEventListener("click", () => bump(step));
    const down = document.createElement("button");
    down.type = "button"; down.className = "number-field-step number-field-step-down";
    down.setAttribute("aria-label", "Decrement");
    down.addEventListener("click", () => bump(-step));
    stepper.append(up, down);

    wrap.append(input, stepper);
    container.appendChild(wrap);
    return (v) => { input.value = v; };
  }

  return { buttonGroup, numberField };
})();
