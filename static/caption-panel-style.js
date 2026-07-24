// CAPTIONS panel Style tab: saved-style preset library, same global library TEXT's
// Style tab uses (GET/POST /api/presets) — a saved style can be applied to a text
// block or a caption track interchangeably. Shown as a grid of style-preset cards
// (rendered-style preview, not just a name). "+ Save current style" opens an inline
// themed form (UI.styleSaveForm, replacing the old native prompt()) to save as a new
// preset; while that form is open ("save mode"), clicking an existing card overwrites
// its style fields (keeping id/name/usage_count) instead of applying it. Every card
// also gets a hover-revealed trash icon that deletes it immediately via Api.deletePreset
// (no confirmation step). Exposes window.CaptionPanel.renderStyle().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let savedPresets = [];

  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      shadow, shadow_color, shadow_offset_x, shadow_offset_y, shadow_blur,
      x, y, highlight_color, highlight_mode, max_words_per_line } = preset;
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      shadow, shadow_color, shadow_offset_x, shadow_offset_y, shadow_blur,
      x, y, highlight_color, highlight_mode, max_words_per_line };
  }

  async function loadSavedPresets() {
    savedPresets = await Api.listPresets();
  }

  let saveMode = false; // true while the inline save form is open: cards become overwrite targets

  function enterSaveMode() { saveMode = true; renderStyle(); }
  function exitSaveMode() { saveMode = false; renderStyle(); }

  async function saveNewPreset(name) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    saveMode = false;
    await renderStyle();
  }

  // Save-mode card click: overwrite that saved style's look (id/name/usage_count kept).
  async function overwriteSavedPreset(saved) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    Object.assign(saved, styleFieldsOf(preset));
    await Api.savePreset(saved);
    saveMode = false;
    await renderStyle();
  }

  async function deleteSavedPreset(saved) {
    await Api.deletePreset(saved.id);
    await renderStyle();
  }

  async function applySavedPreset(saved) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    Object.assign(preset, styleFieldsOf(saved));
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    await saveProject();
    await loadSavedPresets();
    renderCaptionPanel();
  }

  async function renderStyle() {
    savedPresets = await Api.listPresets();
    const saveBtn = document.getElementById("caption-style-save");
    const formEl = document.getElementById("caption-style-form");
    saveBtn.hidden = saveMode;
    formEl.hidden = !saveMode;
    formEl.innerHTML = "";
    if (saveMode) UI.styleSaveForm(formEl, { onSave: saveNewPreset, onCancel: exitSaveMode });

    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    const listEl = document.getElementById("caption-style-list");
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, {
      onClick: saveMode ? overwriteSavedPreset : applySavedPreset,
      onDelete: deleteSavedPreset,
    })));
  }

  document.getElementById("caption-style-save").addEventListener("click", enterSaveMode);
  loadSavedPresets();

  window.CaptionPanel.renderStyle = renderStyle;
})();
