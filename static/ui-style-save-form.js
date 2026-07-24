// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Inline "save current style" form for the TEXT/CAPTIONS Style tabs: themed name input +
// Save/Cancel buttons + overwrite hint, replacing the native prompt(). Depends on
// the .style-save-form CSS component (style-save-form.css) and .panel-button.
window.UI = window.UI || {};

// styleSaveForm(container, {onSave, onCancel}) -> the form element.
// onSave(name) fires on Save/Enter with a non-empty name; onCancel() on Cancel/Escape.
window.UI.styleSaveForm = function styleSaveForm(container, { onSave, onCancel } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "style-save-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "style-save-form-input";
  input.placeholder = "Style name";

  const commit = () => {
    const name = input.value.trim();
    if (name && onSave) onSave(name);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape" && onCancel) onCancel();
  });

  const buttons = document.createElement("div");
  buttons.className = "style-save-form-buttons";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "panel-button";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", commit);
  buttons.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "panel-button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => { if (onCancel) onCancel(); });
  buttons.appendChild(cancelBtn);

  const hint = document.createElement("div");
  hint.className = "style-save-form-hint";
  hint.textContent = "…or click a style below to overwrite it";

  wrap.appendChild(input);
  wrap.appendChild(buttons);
  wrap.appendChild(hint);
  container.appendChild(wrap);
  input.focus();
  return wrap;
};
