// CAPTIONS panel Design tab: font-weight row + drill-down subpanel. Pure UI over the
// caption track's TextPreset.weight. Exposes window.CaptionPanel.renderFontWeight().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let weightRowSetValue = null;
  let currentWeights = [];

  function openWeightPanel() {
    renderWeightList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-weight").hidden = false;
  }

  function closeWeightPanel() {
    document.getElementById("panel-captions-weight").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  async function selectWeight(weightValue) {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    preset.weight = weightValue;
    await saveProject();
    renderCaptionPreview();
    renderFontWeight();
    closeWeightPanel();
  }

  function renderWeightList() {
    const listEl = document.getElementById("caption-weight-list");
    listEl.innerHTML = "";
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));

      const content = document.createElement("span");
      content.className = "font-weight-row-content";

      const labelEl = document.createElement("span");
      labelEl.className = "font-list-row-name";
      labelEl.textContent = w.label;
      content.appendChild(labelEl);

      const previewEl = document.createElement("span");
      previewEl.className = "font-weight-row-preview";
      previewEl.style.fontFamily = preset.font;
      previewEl.style.fontWeight = w.value;
      previewEl.textContent = "kind of insane";
      content.appendChild(previewEl);

      li.appendChild(content);

      if (w.value === preset.weight) {
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

  UI.subPanelHeader(document.getElementById("caption-weight-subpanel-header"), { title: "Weight", onBack: closeWeightPanel });

  async function renderFontWeight() {
    const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
    currentWeights = await Api.listFontWeights(preset.font);
    const current = currentWeights.find((w) => w.value === preset.weight);
    const label = current ? current.label : String(preset.weight);
    if (weightRowSetValue) {
      weightRowSetValue(label);
    } else {
      weightRowSetValue = UI.settingsRow(document.getElementById("caption-weight-row"), {
        label: "Weight", value: label,
        onClick: openWeightPanel,
      });
    }
  }

  window.CaptionPanel.renderFontWeight = renderFontWeight;
})();
