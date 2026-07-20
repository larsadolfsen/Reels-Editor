// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .color-swatch CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a small square color-picker swatch with a label beside it (see .color-swatch-row)
// into `container`. onChange(hexString) fires on pick. Returns a setValue(hex) updater.
// `showLabel` (default true) controls whether `label` renders as visible text; either way
// it's set as the input's aria-label so screen readers still get it (used by rows that
// want a swatch-only look, e.g. Background/Border Color). `span` (default showLabel ? 8 : 1)
// applies a .col-{span} class to position it within its parent grid.
window.UI.colorSwatch = function colorSwatch(container, { label, value, onChange, showLabel = true, span }) {
  container.innerHTML = "";
  container.classList.add("color-swatch-row", `col-${span ?? (showLabel ? 8 : 1)}`);

  const input = document.createElement("input");
  input.type = "color";
  input.className = "color-swatch col-1";
  input.value = value;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => onChange(input.value));

  container.append(input);
  if (showLabel) {
    const labelEl = document.createElement("span");
    labelEl.className = "color-swatch-label col-7";
    labelEl.textContent = label;
    container.append(labelEl);
  }
  return (v) => { input.value = v; };
};
