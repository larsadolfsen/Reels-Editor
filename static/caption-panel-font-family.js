// CAPTIONS panel FONT accordion: font-family row + drill-down subpanel. Pure UI over the
// caption track's TextPreset.font. Exposes window.CaptionPanel.renderFontFamily().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let fontRowSetValue = null;

  function openFontPanel() {
    renderFontList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-font").hidden = false;
  }

  function closeFontPanel() {
    document.getElementById("panel-captions-font").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
    renderCaptionPreview();
  }

  function hoverPreviewFont(fontName) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
    if (window.Preview && Preview.renderCaptions) Preview.renderCaptions(project, previewPresets, Preview.currentTimelineTime());
  }

  async function selectFont(fontName) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.font = fontName;
    const weights = await Api.listFontWeights(fontName);
    if (!weights.some((w) => w.value === preset.weight)) {
      preset.weight = weights.reduce((closest, w) =>
        Math.abs(w.value - preset.weight) < Math.abs(closest.value - preset.weight) ? w : closest
      ).value;
    }
    await saveProject();
    renderFontFamily();
    await CaptionPanel.renderFontWeight();
    renderFontList();
    closeFontPanel();
  }

  function renderFontList() {
    const listEl = document.getElementById("caption-font-list");
    listEl.innerHTML = "";
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
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
      li.addEventListener("mouseleave", () => renderCaptionPreview());
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

  UI.subPanelHeader(document.getElementById("caption-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });

  function renderFontFamily() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    if (fontRowSetValue) {
      fontRowSetValue(preset.font, preset.font);
    } else {
      fontRowSetValue = UI.settingsRow(document.getElementById("caption-font-row"), {
        label: "Font Family", value: preset.font, valueFontFamily: preset.font,
        onClick: openFontPanel,
      });
    }
  }

  window.CaptionPanel.renderFontFamily = renderFontFamily;
})();
