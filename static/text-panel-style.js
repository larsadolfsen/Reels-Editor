// TEXT panel STYLE accordion: saved-style preset library — save current style as new, most-used
// inline list, browse-all drill-down. Exposes window.TextPanel.renderStyle()/loadSavedPresets().
// Distinct from project.text_presets (per-block live working style) — this is the separate global
// library persisted via GET/POST /api/presets (app/main.py).
window.TextPanel = window.TextPanel || {};

(() => {
  let savedPresets = []; // the global preset library, fetched once on load and refreshed after every save/apply

  // Fields copied when saving/applying a saved style — everything TextPreset holds except
  // identity (id/name), derived pixel coordinates (x/y, recomputed from
  // pos_row/pos_col/offset_x/offset_y), and usage stats.
  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      pos_row, pos_col, offset_x, offset_y } = preset;
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      pos_row, pos_col, offset_x, offset_y };
  }

  async function saveCurrentStyleAsPreset() {
    const name = prompt("Name this style:");
    if (!name) return;
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const saved = { ...styleFieldsOf(preset), id: crypto.randomUUID().replaceAll("-", ""), name, usage_count: 0 };
    await Api.savePreset(saved);
    await loadSavedPresets();
    renderStyle();
  }

  async function applySavedPreset(saved) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    Object.assign(preset, styleFieldsOf(saved));
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    await saveProject();
    await loadSavedPresets();
    renderTextPanel();
    closeStylePanel();
  }

  function renderStyleListRow(saved) {
    const li = document.createElement("li");
    li.className = "font-list-row";
    li.addEventListener("click", () => applySavedPreset(saved));
    const nameEl = document.createElement("span");
    nameEl.className = "font-list-row-name";
    nameEl.textContent = saved.name;
    li.appendChild(nameEl);
    return li;
  }

  function renderStyle() {
    const mostUsed = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 3);
    const listEl = document.getElementById("text-style-most-used");
    listEl.innerHTML = "";
    mostUsed.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));

    UI.settingsRow(document.getElementById("text-style-browse-row"), {
      label: "Browse all styles", value: String(savedPresets.length), onClick: openStylePanel,
    });
  }

  function openStylePanel() {
    renderStyleList();
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-style").hidden = false;
  }

  function closeStylePanel() {
    document.getElementById("panel-text-style").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  function renderStyleList() {
    const listEl = document.getElementById("text-style-list");
    listEl.innerHTML = "";
    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    sorted.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));
  }

  async function loadSavedPresets() {
    savedPresets = await Api.listPresets();
  }

  UI.subPanelHeader(document.getElementById("text-style-subpanel-header"), { title: "Saved Styles", onBack: closeStylePanel });
  document.getElementById("text-style-save").addEventListener("click", saveCurrentStyleAsPreset);

  window.TextPanel.renderStyle = renderStyle;
  window.TextPanel.loadSavedPresets = loadSavedPresets;
})();
