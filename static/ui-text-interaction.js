// Reusable stage interaction: click-to-edit a contentEditable element. Mirrors ui-resize-handles.js's
// shape (a standalone interaction handler preview.js mounts/unmounts per-element via a callback object).
window.UI = window.UI || {};

window.UI.textInteraction = function textInteraction(div, { onEditStart, onInput, onEditEnd } = {}) {
  function enterEditMode() {
    if (div.contentEditable === "true") return;
    div.contentEditable = "true";
    div.focus();
    if (onEditStart) onEditStart();
    const onInputEvt = () => { if (onInput) onInput(div.textContent); };
    const onBlur = () => {
      div.removeEventListener("input", onInputEvt);
      div.removeEventListener("blur", onBlur);
      div.contentEditable = "false";
      if (onEditEnd) onEditEnd(div.textContent);
    };
    div.addEventListener("input", onInputEvt);
    div.addEventListener("blur", onBlur);
  }

  div.addEventListener("click", enterEditMode);
};
