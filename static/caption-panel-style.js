// CAPTIONS panel Style tab: saved-style preset library, same global library TEXT's
// Style tab uses (GET/POST /api/presets) — a saved style can be applied to a text
// block or a caption track interchangeably. Shown as a grid of style-preset cards
// (rendered-style preview, not just a name). Exposes window.CaptionPanel.renderStyle().
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

  async function saveCurrentStyleAsPreset() {
    const name = prompt("Name this style:");
    if (!name) return;
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    await loadSavedPresets();
    renderStyle();
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

  function renderStyle() {
    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    const listEl = document.getElementById("caption-style-list");
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, { onClick: applySavedPreset })));
  }

  document.getElementById("caption-style-save").addEventListener("click", saveCurrentStyleAsPreset);
  loadSavedPresets();

  window.CaptionPanel.renderStyle = renderStyle;
})();
