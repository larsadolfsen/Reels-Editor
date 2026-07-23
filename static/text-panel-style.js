// TEXT panel Style tab: saved-style preset library — save current style as new, shown as a
// grid of style-preset cards (rendered-style preview, not just a name) applied on click.
// Exposes window.TextPanel.renderStyle()/loadSavedPresets().
// Distinct from project.text_presets (per-block live working style) — this is the separate global
// library persisted via GET/POST /api/presets (app/main.py).
window.TextPanel = window.TextPanel || {};

(() => {
  let savedPresets = []; // the global preset library, fetched once on load and refreshed after every save/apply

  // Fields copied when saving/applying a saved style — everything TextPreset holds except
  // identity (id/name) and usage stats. Position (x/y) is included, matching the pre-existing
  // behavior of saved styles carrying a position.
  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      shadow, shadow_color, shadow_offset_x, shadow_offset_y, shadow_blur,
      x, y } = preset;
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      shadow, shadow_color, shadow_offset_x, shadow_offset_y, shadow_blur,
      x, y };
  }

  async function saveCurrentStyleAsPreset() {
    const name = prompt("Name this style:");
    if (!name) return;
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    await loadSavedPresets();
    renderStyle();
  }

  async function applySavedPreset(saved) {
    const block = currentTextBlock();
    const preset = ensureTextPreset(block.preset_id);
    Object.assign(preset, styleFieldsOf(saved));
    block.formatting_runs = [];   // a saved preset is "reset to this whole look" — clears any per-range overrides
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    await saveProject();
    await loadSavedPresets();
    renderTextPanel();
  }

  function renderStyle() {
    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    const listEl = document.getElementById("text-style-list");
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, { onClick: applySavedPreset })));
  }

  async function loadSavedPresets() {
    savedPresets = await Api.listPresets();
  }

  document.getElementById("text-style-save").addEventListener("click", saveCurrentStyleAsPreset);

  window.TextPanel.renderStyle = renderStyle;
  window.TextPanel.loadSavedPresets = loadSavedPresets;
})();
