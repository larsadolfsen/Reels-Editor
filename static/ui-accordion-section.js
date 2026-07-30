// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Builds an accordion header (title + chevron) for a body element (existing or freshly created)
// and wires the pair via UI.accordion. Callers own the body's content.
window.UI = window.UI || {};

window.UI.accordionSection = function accordionSection(container, body, { title, expanded = false } = {}) {
  container.innerHTML = "";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "accordion-header";
  UI.text(header, { variant: "eyebrow", content: title });
  header.insertAdjacentHTML("beforeend", UI.icon("chevron-right", { size: 14 }));
  header.querySelector("svg").classList.add("accordion-chevron");

  body.classList.add("accordion-body");
  container.appendChild(header);
  container.appendChild(body);

  window.UI.accordion(header, body, { expanded });

  return { header, body };
};
