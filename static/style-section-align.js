// Shared Box-tab section: the TEXT ALIGN button group (left/center/right), one file serving both
// the TEXT and CAPTIONS panels. Builds its markup once; render() only refreshes which button is
// active. align is not FormatRun-capable, so the write is setPresetField.
window.StyleSection = window.StyleSection || {};

(() => {
  // Lucide align-left / align-center / align-right, via the shared UI.icon service (ui-icon.js
  // already carries these three, added when text-panel-align.js/caption-panel-box.js were
  // migrated off hand-inlined SVG) rather than a third raw-markup copy.
  const ALIGN_OPTIONS = [
    { value: "left", label: "LEFT", span: 1, icon: UI.icon("align-left", { size: 16 }) },
    { value: "center", label: "CENTER", span: 1, icon: UI.icon("align-center", { size: 16 }) },
    { value: "right", label: "RIGHT", span: 1, icon: UI.icon("align-right", { size: 16 }) },
  ];

  window.StyleSection.align = function align(container, target, options) {
    container.innerHTML = "";

    const labelEl = document.createElement("div");
    labelEl.className = "section-label-spacer";
    UI.text(labelEl, { variant: "eyebrow", content: "TEXT ALIGN" });
    container.appendChild(labelEl);

    const group = document.createElement("div");
    group.className = "style-group";
    // .style-align-group replaces the old #text-align-group / #caption-align-group ids that
    // style-panel.css used to pin these icon buttons to 28x28 squares — a shared section
    // renders twice and so cannot carry an id.
    const groupEl = document.createElement("div");
    groupEl.className = "style-align-group";
    group.appendChild(groupEl);
    container.appendChild(group);

    // Construction-time value is a placeholder, not target.getPreset().align: this factory runs
    // once at panel load (now inside the Design tab's eagerly-built section list — see
    // style-tab-design.js), before any text block/caption track necessarily exists yet, and
    // getPreset() throws in that state (same class of bug style-section-size.js documents fixing
    // for the same reason). render() (below) supplies the real value immediately after.
    const setActive = UI.buttonGroup(groupEl, ALIGN_OPTIONS, "center",
      (value) => target.setPresetField("align", value));

    // Changing align moves the box on stage (stage.css keys its transform off it) but does NOT
    // re-render the panel — matching the old behaviour, where HORIZONTAL kept its stored value.
    function render() { setActive(target.getPreset().align); }

    // Not self-invoked at construction (unlike this file's very first version): this section now
    // constructs eagerly inside the Design tab (style-tab-design.js), before any text block/
    // caption track necessarily exists, and render() calling target.getPreset() this early throws
    // for the same reason the comment above documents. Every other Design-tab section already
    // defers its first real render() to the panel's own renderTextPanel()/renderCaptionPanel()
    // call, which only ever runs once a block/track exists — this section now matches that.
    return { render };
  };
})();
