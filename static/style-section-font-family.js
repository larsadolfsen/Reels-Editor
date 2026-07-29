// Shared style section: the Font Family settings row plus its font-list drill-down subpage.
// Serves both the TEXT and CAPTIONS Design tabs — every read and write goes through the style
// target, so this file never knows which panel it is rendering into.
window.StyleSection = window.StyleSection || {};

window.StyleSection.fontFamily = function fontFamily(container, target, options) {
  const opts = options || {};
  const host = opts.host;

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

  // The host rebuilds this body on every open(), so the list always reflects the current font.
  function buildList(bodyEl) {
    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

    const currentFont = target.getFieldValue("font");
    const orderedFonts = [currentFont, ...AVAILABLE_FONTS.filter((f) => f !== currentFont)];
    orderedFonts.forEach((fontName, index) => {
      if (index > 0) {
        const dividerLi = document.createElement("li");
        dividerLi.className = "font-list-divider";
        UI.divider(dividerLi);
        listEl.appendChild(dividerLi);
      }

      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("mouseenter", () => target.previewField("font", fontName));
      li.addEventListener("mouseleave", () => target.cancelPreview());
      li.addEventListener("click", () => selectFont(fontName));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      // Live preview of the value being edited — the one sanctioned inline-style exception.
      nameEl.style.fontFamily = fontName;
      nameEl.textContent = fontName;
      li.appendChild(nameEl);

      if (fontName === currentFont) li.appendChild(checkmark());

      listEl.appendChild(li);
    });
  }

  // Verbatim from text-panel-font-family.js: a weight the newly chosen family does not ship
  // snaps to the numerically nearest weight it does ship, so nothing renders at a weight that
  // does not exist. Only the read/write path changed — target.setFields decides per key
  // whether a write lands on the base preset or a per-range FormatRun (font never does,
  // weight does when a selection is active), and does exactly ONE save/undo-entry for the
  // whole call, whether or not a snap fires.
  async function selectFont(fontName) {
    const weights = await Api.listFontWeights(fontName);
    const currentWeight = target.getFieldValue("weight");
    const fields = { font: fontName };
    if (!weights.some((w) => w.value === currentWeight)) {
      fields.weight = weights.reduce((closest, w) =>
        Math.abs(w.value - currentWeight) < Math.abs(closest.value - currentWeight) ? w : closest
      ).value;
    }
    target.setFields(fields);
    page.close();
    // Repaints the Font Family and Weight rows together; renderTextPanel/renderCaptionPanel
    // re-render every section, which is what the old file's two by-name calls did by hand.
    target.rerenderPanel();
  }

  const page = host.page("Font Family", buildList, { onClose: () => target.cancelPreview() });

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  // Built once, here. render() only pushes new values through the setter this returns —
  // UI.settingsRow is never called again.
  const setValue = UI.settingsRow(rowEl, {
    label: "Font Family", value: "", onClick: () => page.open(),
  });

  return {
    render() {
      const font = target.getFieldValue("font");
      setValue(font, font);
    },
  };
};
