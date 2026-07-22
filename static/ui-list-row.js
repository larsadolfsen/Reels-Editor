// Reusable presentational UI helper, framework-free. Attaches to window.UI. Stamps the shared
// clickable-row styling (static/css/components/list-row.css) onto an already-built element,
// mirroring ui-button.js's "apply variant to an existing element" pattern — callers build their
// own row (thumbnail/name/meta/actions) and call this once before appending it to its list.
window.UI = window.UI || {};

window.UI.listRow = function listRow(el, { selected = false, subtle = false } = {}) {
  el.classList.add("list-row");
  el.classList.toggle("list-row--subtle", subtle);
  el.classList.toggle("selected", selected);
  return el;
};
