// TEXT panel FONT accordion: font-family row + drill-down subpanel. Pure UI over TextPreset.font.
// Exposes window.TextPanel.renderFontFamily(). No bundler — reaches directly into editor.js's
// globals (ensureTextBlock, ensureTextPreset, saveProject, renderTextPreview, project, AVAILABLE_FONTS),
// same pattern renderBoxPanel() already uses.
window.TextPanel = window.TextPanel || {};

(() => {
  let fontRowSetValue = null;

  function openFontPanel() {
    renderFontList();
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-font").hidden = false;
  }

  function closeFontPanel() {
    document.getElementById("panel-text-font").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
    renderTextPreview();
  }

  function hoverPreviewFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
    Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
  }

  async function selectFont(fontName) {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset.font = fontName;
    const weights = await Api.listFontWeights(fontName);
    if (!weights.some((w) => w.value === preset.weight)) {
      preset.weight = weights.reduce((closest, w) =>
        Math.abs(w.value - preset.weight) < Math.abs(closest.value - preset.weight) ? w : closest
      ).value;
    }
    await saveProject();
    renderFontFamily();
    await TextPanel.renderFontWeight();
    renderFontList();
    closeFontPanel();
  }

  function renderFontList() {
    const listEl = document.getElementById("text-font-list");
    listEl.innerHTML = "";
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    const orderedFonts = [preset.font, ...AVAILABLE_FONTS.filter((f) => f !== preset.font)];
    orderedFonts.forEach((fontName, index) => {
      if (index > 0) {
        const dividerLi = document.createElement("li");
        dividerLi.className = "font-list-divider";
        UI.divider(dividerLi);
        listEl.appendChild(dividerLi);
      }

      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
      li.addEventListener("mouseleave", () => renderTextPreview());
      li.addEventListener("click", () => selectFont(fontName));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.style.fontFamily = fontName;
      nameEl.textContent = fontName;
      li.appendChild(nameEl);

      if (fontName === preset.font) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("text-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });

  function renderFontFamily() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    if (fontRowSetValue) {
      fontRowSetValue(preset.font, preset.font);
    } else {
      fontRowSetValue = UI.settingsRow(document.getElementById("text-font-row"), {
        label: "Font Family", value: preset.font, valueFontFamily: preset.font,
        onClick: openFontPanel,
      });
    }
  }

  window.TextPanel.renderFontFamily = renderFontFamily;
})();
