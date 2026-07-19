// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .save-indicator CSS component. No app state — caller drives setSaving()/setSaved().
window.UI = window.UI || {};

window.UI.saveIndicator = function saveIndicator(container) {
  container.classList.add("save-indicator");
  container.innerHTML = "";

  const dot = document.createElement("span");
  dot.className = "save-indicator-dot";
  const label = document.createElement("span");
  label.className = "save-indicator-label";
  container.append(dot, label);

  function setSaving() {
    container.classList.add("is-saving");
    label.textContent = "Saving…";
  }
  function setSaved() {
    container.classList.remove("is-saving");
    label.textContent = "Saved";
  }

  setSaved();
  return { setSaving, setSaved };
};
