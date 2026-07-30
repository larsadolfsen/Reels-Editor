// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .style-field/number-field CSS components and UI.text (ui-text.js) for the
// label's typography. No app state — callers own data.
window.UI = window.UI || {};

// Renders a labeled number input (label always shows its unit, e.g. "START (SEC)") with a
// custom up/down stepper (the native spin button can't be restyled) into `container`.
// onChange(number) fires on typing and on stepper clicks. Returns a setValue(v) updater.
// disabled (default false) disables the input and both stepper buttons.
window.UI.numberField = function numberField(container, { label, unit, value, step = 1, min, max, decimals, disabled = false, span = 8, onChange }) {
  container.innerHTML = "";
  container.classList.add("style-field", `col-${span}`);
  const labelEl = UI.text(container, { variant: "label", content: unit ? `${label} (${unit})` : label });
  labelEl.classList.add("number-field-label");

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

  // Named "arrows" (not the old "stepper" wording) so no class here collides with the retired
  // stepper-button class pinned by tests/js/no-legacy-button-classes.test.js.
  const arrows = document.createElement("div");
  arrows.className = "number-field-arrows";
  const up = UI.button(arrows, {
    icon: "chevron-up",
    size: "sm",
    disabled,
    onClick: () => bump(step),
  });
  up.classList.add("number-field-arrow", "number-field-arrow-up");
  up.setAttribute("aria-label", "Increment");
  const down = UI.button(arrows, {
    icon: "chevron-down",
    size: "sm",
    disabled,
    onClick: () => bump(-step),
  });
  down.classList.add("number-field-arrow", "number-field-arrow-down");
  down.setAttribute("aria-label", "Decrement");

  wrap.append(input, arrows);
  container.appendChild(wrap);
  const setValue = (v) => { input.value = format(v); };
  return setValue;
};
