// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Builds an accordion header (title + chevron) for a body element (existing or freshly created)
// and wires the pair via UI.accordion. Callers own the body's content.
window.UI = window.UI || {};

window.UI.accordionSection = function accordionSection(container, body, { title, expanded = false } = {}) {
  const header = document.createElement("button");
  header.type = "button";
  header.className = "accordion-header";
  header.innerHTML = `${title} <svg class="accordion-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

  body.classList.add("accordion-body");
  container.appendChild(header);
  container.appendChild(body);

  window.UI.accordion(header, body, { expanded });

  return { header, body };
};
