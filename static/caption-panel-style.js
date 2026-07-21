// CAPTIONS panel Style tab: saved-style preset library, same global library TEXT's
// Style tab uses (GET/POST /api/presets) — a saved style can be applied to a text
// block or a caption track interchangeably. Exposes window.CaptionPanel.renderStyle().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let savedPresets = [];

  function styleFieldsOf(preset) {
    const { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
      x, y, highlight_color, highlight_mode, max_words_per_line } = preset;
    return { font, size_px, color, outline_color, outline_px, weight, italic, underline,
      box_width_mode, box_height_mode, box_width, box_height, box_background, box_background_color,
      box_border_width, box_border_color, box_border_radius, align, entrance,
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
    const listEl = document.getElementById("caption-style-most-used");
    listEl.innerHTML = "";
    mostUsed.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));

    UI.settingsRow(document.getElementById("caption-style-browse-row"), {
      label: "Browse all styles", value: String(savedPresets.length), onClick: openStylePanel,
    });
  }

  function openStylePanel() {
    renderStyleList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-style").hidden = false;
  }

  function closeStylePanel() {
    document.getElementById("panel-captions-style").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  function renderStyleList() {
    const listEl = document.getElementById("caption-style-list");
    listEl.innerHTML = "";
    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    sorted.forEach((saved) => listEl.appendChild(renderStyleListRow(saved)));
  }

  UI.subPanelHeader(document.getElementById("caption-style-subpanel-header"), { title: "Saved Styles", onBack: closeStylePanel });
  document.getElementById("caption-style-save").addEventListener("click", saveCurrentStyleAsPreset);
  loadSavedPresets();

  window.CaptionPanel.renderStyle = renderStyle;
})();
