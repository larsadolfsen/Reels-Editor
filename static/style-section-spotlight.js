// CAPTIONS-only Design-tab section: "Spotlight", the per-word karaoke highlight (off / current
// word / progressive fill). A mode is either off or always one of the other two — this row is
// never "None" the way Highlight/Outline/Shadow can be. Distinct from TEXT/CAPTIONS' shared
// static-box Highlight (style-section-highlight.js) — see that file's header. The active word's
// own Color/Outline/Shadow/Highlight are built by reusing the four shared style sections
// (style-section-color.js/outline.js/shadow.js/highlight.js) pointed at the preset's spotlight_*
// fields via each section's field-name options (added 2026-07-30) — a second, nested
// SubpanelHost scoped to this subpage's own body gives them their own chevron drill-downs,
// matching the reference mockup, without changing SubpanelHost itself. Outline and Shadow only
// render in "current_word" mode (see app/ass_render.py's _current_word_dialogues header for why
// ASS can't carry them through "progressive_fill"'s \k sweep) — their rows hide in that mode and
// when the mode is "off"; Color and Highlight hide only when "off".
window.StyleSection = window.StyleSection || {};

window.StyleSection.spotlight = function spotlightSection(container, target, options) {
  const host = options.host;

  const MODE_LABELS = {
    off: "Off",
    current_word: "Current word",
    progressive_fill: "Progressive fill",
  };

  const group = document.createElement("div");
  group.className = "style-group";
  const rowEl = document.createElement("div");
  rowEl.className = "col-8";
  group.appendChild(rowEl);
  container.appendChild(group);

  const setRowValue = UI.settingsRow(rowEl, {
    label: "Spotlight",
    value: "",
    swatchColor: "",
    onClick: () => page.open(),
  });

  function refreshRow() {
    if (!target.exists()) return;
    const preset = target.getPreset();
    setRowValue(MODE_LABELS[preset.highlight_mode] || preset.highlight_mode, null,
      preset.highlight_mode === "off" ? null : preset.spotlight_color);
  }

  const page = host.page("Spotlight", (bodyEl) => {
    const modeGroup = document.createElement("div");
    modeGroup.className = "style-group";
    const modeEl = document.createElement("div");
    modeGroup.appendChild(modeEl);
    bodyEl.appendChild(modeGroup);

    // A nested SubpanelHost scoped to this subpage: mainEl is this subpage's own body (already
    // holding the mode group above it), drillEl is a sibling appended to the subpage's outer
    // element so the four reused sections' subpages don't get wiped when this body rebuilds.
    const pageEl = bodyEl.parentElement;
    const nestedDrillEl = document.createElement("div");
    pageEl.appendChild(nestedDrillEl);
    const nestedHost = SubpanelHost(bodyEl, nestedDrillEl);

    // Each wrapper uses the existing .style-section convention (style-panel.css) — the same one
    // style-tab-design.js's sectionWrapper() uses — so the reused sections' own .style-group
    // margin math (the :last-child rule that strips a trailing section's bottom margin) works
    // correctly with four of them side by side, instead of every one of them (each being the only
    // child of its own bare wrapper) incorrectly matching :last-child and losing its margin.
    function sectionWrapper() {
      const div = document.createElement("div");
      div.className = "style-section";
      bodyEl.appendChild(div);
      return div;
    }
    const colorWrap = sectionWrapper();
    const outlineWrap = sectionWrapper();
    const shadowWrap = sectionWrapper();
    const highlightWrap = sectionWrapper();

    const colorSection = StyleSection.color(colorWrap, target, { host: nestedHost, field: "spotlight_color" });
    const outlineSection = StyleSection.outline(outlineWrap, target,
      { host: nestedHost, colorField: "spotlight_outline_color", widthField: "spotlight_outline_px" });
    const shadowSection = StyleSection.shadow(shadowWrap, target,
      { host: nestedHost, fields: { toggle: "spotlight_shadow", color: "spotlight_shadow_color", offsetX: "spotlight_shadow_offset_x", offsetY: "spotlight_shadow_offset_y", blur: "spotlight_shadow_blur" } });
    const highlightSection = StyleSection.highlight(highlightWrap, target,
      { host: nestedHost, fields: { toggle: "spotlight_highlight", color: "spotlight_highlight_color", radius: "spotlight_highlight_border_radius" } });

    // .style-section is `display: contents` (style-panel.css) — toggling `hidden` on the wrapper
    // itself is unreliable since an author rule and the UA [hidden] default have equal
    // specificity. Instead toggle `hidden` on each wrapper's actual `.style-group` child (the one
    // thing each reused section appends into its container) — `.style-group[hidden] { display:
    // none; }` already exists in style-panel.css for exactly this.
    function syncVisibility() {
      const mode = target.getPreset().highlight_mode;
      colorWrap.firstElementChild.hidden = mode === "off";
      outlineWrap.firstElementChild.hidden = mode !== "current_word";
      shadowWrap.firstElementChild.hidden = mode !== "current_word";
      highlightWrap.firstElementChild.hidden = mode === "off";
    }

    UI.buttonGroup(modeEl,
      [{ value: "off", label: "Off", span: 8 },
       { value: "current_word", label: "Current word", span: 4 },
       { value: "progressive_fill", label: "Progressive fill", span: 4 }],
      target.getPreset().highlight_mode,
      (value) => {
        target.setPresetField("highlight_mode", value);
        syncVisibility();
        refreshRow();
      });

    colorSection.render();
    outlineSection.render();
    shadowSection.render();
    highlightSection.render();
    syncVisibility();
  }, { onClose: refreshRow });

  return { render: refreshRow };
};
