// Shared saved-style preset library section, used by both the TEXT and CAPTIONS Style tabs:
// the "+ Save current style" button, the inline save form, the card grid, save-mode overwrite,
// and per-card delete. Built once per panel; render() refetches the library and repaints.
window.StyleSection = window.StyleSection || {};

// presetLibrary(container, target, options) -> { render() }. `options` is unused today; the
// master plan's contract still passes an object so every section has one signature.
window.StyleSection.presetLibrary = function presetLibrary(container, target, options) {
  // ---- markup, built once ------------------------------------------------
  const saveGroup = document.createElement("div");
  saveGroup.className = "style-group";
  const saveBtn = UI.button(saveGroup, { label: "+ Save current style", intent: "dashed" });

  const formEl = document.createElement("div");
  formEl.className = "style-group";
  formEl.hidden = true;

  const listGroup = document.createElement("div");
  listGroup.className = "style-group";
  const listEl = document.createElement("ul");
  listEl.className = "font-list col-8";
  listGroup.appendChild(listEl);

  container.appendChild(saveGroup);
  container.appendChild(formEl);
  container.appendChild(listGroup);

  // ---- state -------------------------------------------------------------
  // True while the inline save form is open: cards become overwrite targets instead of
  // apply targets. Same flag the two replaced files each kept module-locally.
  let saveMode = false;

  // Applying a saved style writes ~30 fields at once. The target contract has no bulk write
  // and no bare save() — every write path is setField/setPresetField, which each save and
  // re-render. So assign the fields onto the live preset (target.getPreset() is the contract's
  // own accessor for it) and route ONE field back through setPresetField, which commits the
  // save and the preview re-render exactly once instead of firing thirty of each.
  const COMMIT_FIELD = "font";

  // Saved styles predate this branch's removal of the explicit FIT/FREE/FILL toggle, so an old
  // saved style may still carry the legacy box_width_mode/box_height_mode value "fill" — normalize
  // it to "fixed" here so applying a saved style never reintroduces a removed mode value.
  function normalizeBoxModes(fields) {
    const out = { ...fields };
    if (out.box_width_mode === "fill") out.box_width_mode = "fixed";
    if (out.box_height_mode === "fill") out.box_height_mode = "fixed";
    return out;
  }

  function applyStyleFields(fields) {
    const normalized = normalizeBoxModes(fields);
    Object.assign(target.getPreset(), normalized);
    target.setPresetField(COMMIT_FIELD, normalized[COMMIT_FIELD]);
  }

  async function saveNewPreset(name) {
    const saved = {
      ...StyleFields.styleFieldsOf(target.getPreset()),
      id: crypto.randomUUID().replaceAll("-", ""),
      name,
      usage_count: 0,
      preset_kind: target.kind,
    };
    await Api.savePreset(saved);
    saveMode = false;
    await render();
  }

  // Save-mode card click: overwrite that saved style's look, keeping id/name/usage_count.
  async function overwriteSavedPreset(saved) {
    Object.assign(saved, StyleFields.styleFieldsOf(target.getPreset()));
    await Api.savePreset(saved);
    saveMode = false;
    await render();
  }

  // No confirmation step, matching the pre-existing behaviour.
  async function deleteSavedPreset(saved) {
    await Api.deletePreset(saved.id);
    await render();
  }

  async function applySavedPreset(saved) {
    // Clear BEFORE the write: applyStyleFields' setPresetField call is what triggers the save,
    // so the emptied runs have to already be on the block or they would not be persisted until
    // some later save. No-op on the caption target, which has no runs — hence no branch here.
    target.clearFormatRuns();
    applyStyleFields(StyleFields.styleFieldsOf(saved));
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    // Re-renders the whole panel, which re-calls this section's render() and so refreshes the
    // card grid from the server — the job the old loadSavedPresets() call did by hand.
    target.rerenderPanel();
  }

  function exitSaveMode() {
    saveMode = false;
    render();
  }

  async function render() {
    // Fetched first, before the form is shown, preserving the replaced files' ordering — the
    // save form calls input.focus() on build, and that must stay the last thing that happens.
    const savedPresets = await Api.listPresets();

    saveBtn.hidden = saveMode;
    formEl.hidden = !saveMode;
    formEl.innerHTML = "";
    if (saveMode) UI.styleSaveForm(formEl, { onSave: saveNewPreset, onCancel: exitSaveMode });

    const sorted = savedPresets
      .filter((saved) => (saved.preset_kind || "text") === target.kind)
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, {
      onClick: saveMode ? overwriteSavedPreset : applySavedPreset,
      onDelete: deleteSavedPreset,
    })));
  }

  // Attached once here in the factory, not at load time and not from render(): sections are
  // built once and rendered many times, so a render()-time listener would stack up duplicates.
  saveBtn.addEventListener("click", () => { saveMode = true; render(); });

  return { render };
};
