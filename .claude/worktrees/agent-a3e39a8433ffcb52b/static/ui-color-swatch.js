// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .color-swatch CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a small square color-picker swatch with a label beside it (see .color-swatch-row)
// into `container`. onChange(hexString) fires on pick. Returns a setValue(hex) updater.
window.UI.colorSwatch = function colorSwatch(container, { label, value, onChange }) {
  container.innerHTML = "";
  container.classList.add("color-swatch-row");

  const input = document.createElement("input");
  input.type = "color";
  input.className = "color-swatch";
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));

  const labelEl = document.createElement("span");
  labelEl.className = "color-swatch-label";
  labelEl.textContent = label;

  container.append(input, labelEl);
  return (v) => { input.value = v; };
};
