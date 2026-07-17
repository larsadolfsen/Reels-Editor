// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// No app state — callers own data.
window.UI = window.UI || {};

// Wires an existing header <button> + body <div> pair (already in the DOM) into a collapsible
// section: toggles body.hidden and header's aria-expanded on click. Returns a `(isExpanded)` updater function.
window.UI.accordion = function accordion(header, body, { expanded = false } = {}) {
  const apply = (isExpanded) => {
    body.hidden = !isExpanded;
    header.setAttribute("aria-expanded", String(isExpanded));
  };
  apply(expanded);
  header.addEventListener("click", () => {
    apply(header.getAttribute("aria-expanded") !== "true");
  });
  return (isExpanded) => apply(isExpanded);
};
