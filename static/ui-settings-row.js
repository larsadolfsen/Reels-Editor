// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .settings-row CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a clickable row into `container`: a label on the left, a value (optionally styled
// in valueFontFamily) plus a right-chevron on the right. onClick() fires on click.
// `swatchColor` (optional) renders a small color square immediately before the value text —
// used by rows previewing a color+size pair (e.g. Outline: color square + "1px").
// Returns a setValue(value, valueFontFamily, swatchColor) updater.
window.UI.settingsRow = function settingsRow(container, { label, value, valueFontFamily, swatchColor, onClick }) {
  container.innerHTML = "";
  container.classList.add("settings-row");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-row-btn";

  const labelEl = document.createElement("span");
  labelEl.className = "settings-row-label";
  labelEl.textContent = label;

  const swatchEl = document.createElement("span");
  swatchEl.className = "settings-row-swatch";
  swatchEl.hidden = !swatchColor;
  if (swatchColor) swatchEl.style.backgroundColor = swatchColor;

  const valueEl = document.createElement("span");
  valueEl.className = "settings-row-value";
  valueEl.textContent = value;
  if (valueFontFamily) valueEl.style.fontFamily = valueFontFamily;

  const valueInner = document.createElement("span");
  valueInner.className = "settings-row-value-inner";
  valueInner.append(swatchEl, valueEl);

  const valueGroup = document.createElement("span");
  valueGroup.className = "settings-row-value-group";
  valueGroup.innerHTML = '<svg class="settings-row-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  valueGroup.prepend(valueInner);

  btn.append(labelEl, valueGroup);
  btn.addEventListener("click", () => onClick());
  container.appendChild(btn);

  return (v, fontFamily, swatch) => {
    valueEl.textContent = v;
    valueEl.style.fontFamily = fontFamily || "";
    swatchEl.hidden = !swatch;
    if (swatch) swatchEl.style.backgroundColor = swatch;
  };
};
