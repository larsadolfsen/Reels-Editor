// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .style-field/number-field CSS components. No app state — callers own data.
window.UI = window.UI || {};

// Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") with a
// custom up/down stepper (the native spin button can't be restyled) into `container`.
// onChange(number) fires on typing and on stepper clicks. Returns a setValue(v) updater.
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, onChange }) {
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
};
