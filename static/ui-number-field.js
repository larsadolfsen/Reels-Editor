// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .style-field/number-field CSS components. No app state — callers own data.
window.UI = window.UI || {};

// Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") with a
// custom up/down stepper (the native spin button can't be restyled) into `container`.
// onChange(number) fires on typing and on stepper clicks. Returns a setValue(v) updater.
// disabled (default false) disables the input and both stepper buttons — used e.g. by the
// TEXT panel's SIZE (PX) field when BOX's SIZE mode is FILL (size is computed, not typed).
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, disabled = false, span = 8, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field", `col-${span}`);
  const labelEl = document.createElement("span");
  labelEl.className = "number-field-label";
  labelEl.textContent = unit ? `${label} (${unit})` : label;
  container.appendChild(labelEl);

  const format = (v) => (decimals !== undefined ? v.toFixed(decimals) : v);

  const wrap = document.createElement("div");
  wrap.className = "number-field-wrap";

  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.value = format(value);
  input.disabled = disabled;
  input.addEventListener("input", () => onChange(parseFloat(input.value) || 0));

  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const bump = (delta) => {
    const v = clamp((parseFloat(input.value) || 0) + delta);
    input.value = format(v);
    onChange(v);
  };

  const stepper = document.createElement("div");
  stepper.className = "number-field-stepper";
  const up = document.createElement("button");
  up.type = "button"; up.className = "number-field-step number-field-step-up";
  up.setAttribute("aria-label", "Increment");
  up.disabled = disabled;
  up.addEventListener("click", () => bump(step));
  const down = document.createElement("button");
  down.type = "button"; down.className = "number-field-step number-field-step-down";
  down.setAttribute("aria-label", "Decrement");
  down.disabled = disabled;
  down.addEventListener("click", () => bump(-step));
  stepper.append(up, down);

  wrap.append(input, stepper);
  container.appendChild(wrap);
  return (v) => { input.value = format(v); };
};
