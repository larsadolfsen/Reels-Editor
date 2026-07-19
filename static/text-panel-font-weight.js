// TEXT panel FONT accordion: font-weight row + drill-down subpanel. Pure UI over
// TextPreset.weight, unless a stage text selection is active (Preview.getActiveFormatSelection()),
// in which case selecting a weight writes/updates a per-range FormatRun instead (mirrors
// text-panel-font-style.js's upsertFormatRun). Exposes window.TextPanel.renderFontWeight().
// No bundler — reaches directly into editor.js's globals (ensureTextBlock, ensureTextPreset,
// saveProject, renderTextPreview), same pattern as text-panel-font-family.js.
window.TextPanel = window.TextPanel || {};

(() => {
  let weightRowSetValue = null;
  let currentWeights = [];   // [{value, label}] for the currently selected font, refreshed per render

  function openWeightPanel() {
    renderWeightList();
    document.getElementById("panel-text-main").hidden = true;
    document.getElementById("panel-text-weight").hidden = false;
  }

  function closeWeightPanel() {
    document.getElementById("panel-text-weight").hidden = true;
    document.getElementById("panel-text-main").hidden = false;
  }

  // Mirrors text-panel-font-style.js's upsertFormatRun: runs never overlap, so an exact-range
  // re-edit updates the existing run in place instead of pushing a duplicate.
  function upsertFormatRun(block, start, end, field, value) {
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
  }

  async function selectWeight(weightValue) {
    const block = ensureTextBlock();
    const preset = ensureTextPreset(block.preset_id);
    const sel = Preview.getActiveFormatSelection();
    if (sel && sel.blockId === block.id) {
      upsertFormatRun(block, sel.start, sel.end, "weight", weightValue);
    } else {
      preset.weight = weightValue;
    }
    await saveProject();
    renderTextPreview();
    renderFontWeight();
    closeWeightPanel();
  }

  function renderWeightList() {
    const listEl = document.getElementById("text-weight-list");
    listEl.innerHTML = "";
    const block = ensureTextBlock();
    const preset = ensureTextPreset(block.preset_id);
    // Each row renders the block's actual heading text (not just the weight's label) in the
    // current font family at that exact weight — a real preview of how the block would look,
    // not just a labeled option. Falls back to the label itself for an empty/new block, so
    // there's still something visible to compare.
    const previewText = block.heading || "";
    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      li.addEventListener("click", () => selectWeight(w.value));

      // Label + preview are grouped in one wrapper so this row still has exactly two direct
      // children (content, checkmark?) — matching font-list-row's existing
      // `justify-content: space-between` layout, which expects the checkmark as the sole
      // right-hand item.
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
      previewEl.textContent = previewText || w.label;
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

  UI.subPanelHeader(document.getElementById("text-weight-subpanel-header"), { title: "Weight", onBack: closeWeightPanel });

  async function renderFontWeight() {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    currentWeights = await Api.listFontWeights(preset.font);
    const current = currentWeights.find((w) => w.value === preset.weight);
    const label = current ? current.label : String(preset.weight);
    if (weightRowSetValue) {
      weightRowSetValue(label);
    } else {
      weightRowSetValue = UI.settingsRow(document.getElementById("text-weight-row"), {
        label: "Weight", value: label,
        onClick: openWeightPanel,
      });
    }
  }

  window.TextPanel.renderFontWeight = renderFontWeight;
})();
