// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Renders a plain static divider line into container — no options, no hover effect, no state.
window.UI = window.UI || {};

window.UI.divider = function divider(container) {
  container.innerHTML = "";
  const line = document.createElement("div");
  line.className = "ui-divider";
  container.appendChild(line);
  return line;
};
