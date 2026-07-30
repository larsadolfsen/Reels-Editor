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

  UI.text(btn, { variant: "eyebrow", content: label });

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
  valueGroup.innerHTML = UI.icon("chevron-right", { size: 16 }).replace("<svg ", '<svg class="settings-row-chevron" ');
  valueGroup.prepend(valueInner);

  btn.append(valueGroup);
  btn.addEventListener("click", () => onClick());
  container.appendChild(btn);

  return (v, fontFamily, swatch) => {
    valueEl.textContent = v;
    valueEl.style.fontFamily = fontFamily || "";
    swatchEl.hidden = !swatch;
    if (swatch) swatchEl.style.backgroundColor = swatch;
  };
};
