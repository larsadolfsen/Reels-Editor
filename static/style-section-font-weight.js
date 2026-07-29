// Shared style section: the Weight settings row plus its weight-list drill-down subpage.
// Serves both the TEXT and CAPTIONS Design tabs; render() is async because the weights a font
// actually ships come from Api.listFontWeights.
window.StyleSection = window.StyleSection || {};

window.StyleSection.fontWeight = function fontWeight(container, target, options) {
  const opts = options || {};
  const host = opts.host;
  // Each list row previews real text at that weight rather than just naming it. TEXT passes the
  // block's own heading (read fresh on every open, so it follows edits); a caption track has no
  // single heading to preview, so panel-captions.js passes the fixed sample string
  // caption-panel-font-weight.js already used.
  const sampleText = opts.sampleText || (() => "");

  // Refreshed by render() for the current font; the subpage reads whatever render() last fetched.
  let currentWeights = [];

  function checkmark() {
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
    return check;
  }

  function buildList(bodyEl) {
    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

    const font = target.getFieldValue("font");
    const weight = target.getFieldValue("weight");
    const previewText = sampleText() || "";

    currentWeights.forEach((w) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectWeight(w.value));

      // Label + preview are grouped in one wrapper so the row still has exactly two direct
      // children (content, checkmark?) — .font-list-row's `justify-content: space-between`
      // expects the checkmark as the sole right-hand item.
      const content = document.createElement("span");
      content.className = "font-weight-row-content";

      const labelEl = document.createElement("span");
      labelEl.className = "font-list-row-name";
      labelEl.textContent = w.label;
      content.appendChild(labelEl);

      const previewEl = document.createElement("span");
      previewEl.className = "font-weight-row-preview";
      // Live preview of the value being edited — the one sanctioned inline-style exception.
      previewEl.style.fontFamily = font;
      previewEl.style.fontWeight = w.value;
      previewEl.textContent = previewText || w.label;
      content.appendChild(previewEl);

      li.appendChild(content);

      if (w.value === weight) li.appendChild(checkmark());

      listEl.appendChild(li);
    });
  }

  function selectWeight(weightValue) {
    // setField, not setPresetField: a FormatRun can override weight, so on TEXT with a partial
    // selection active this writes that range only. On CAPTIONS the two are identical.
    target.setField("weight", weightValue);
    page.close();
    handle.render();
  }

  const page = host.page("Weight", buildList);

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const setValue = UI.settingsRow(rowEl, {
    label: "Weight", value: "", onClick: () => page.open(),
  });

  const handle = {
    async render() {
      currentWeights = await Api.listFontWeights(target.getFieldValue("font"));
      const weight = target.getFieldValue("weight");
      const current = currentWeights.find((w) => w.value === weight);
      // TEXT's label format ("Regular 400") over CAPTIONS' bare "Regular": the numeric weight is
      // real information, and one shared component cannot carry two formats.
      setValue(`${current ? current.label : ""} ${weight}`.trim());
    },
  };

  return handle;
};
