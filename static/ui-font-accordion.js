// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Builds a FONT-select accordion section (via UI.accordionSection) with a hardcoded
// font list matching the two vendored font families.
window.UI = window.UI || {};

window.UI.fontAccordion = function fontAccordion(container, { value, onChange }) {
  const body = document.createElement("div");

  const group = document.createElement("div");
  group.className = "style-group";
  const row = document.createElement("div");
  row.className = "style-row";
  const label = document.createElement("label");
  label.className = "style-field";
  label.textContent = "FONT";

  const select = document.createElement("select");
  ["Public Sans", "JetBrains Mono"].forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    select.appendChild(option);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));

  label.appendChild(select);
  row.appendChild(label);
  group.appendChild(row);
  body.appendChild(group);

  window.UI.accordionSection(container, body, { title: "FONT", expanded: false });

  return { setValue: (font) => { select.value = font; } };
};
