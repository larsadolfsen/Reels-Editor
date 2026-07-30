// Shared emphasis row for the TEXT and CAPTIONS Design tabs: Italic and Underline toggles plus
// the lowercase / UPPERCASE / As-typed case group, all on ONE .style-row via .btn-group-inline.
// Builds its own markup. italic/underline write through target.setField (FormatRun-capable);
// text_case writes through target.setPresetField (whole-preset only, no per-range override).
window.StyleSection = window.StyleSection || {};

(() => {
  const ITALIC_ICON = UI.icon("italic", { size: 16 });
  const UNDERLINE_ICON = UI.icon("underline", { size: 16 });

  // Copied verbatim — SVG paths included — from text-panel-case.js, which caption-panel-case.js
  // held a byte-identical second copy of. This is now the only copy.
  const CASE_OPTIONS = [
    {
      value: "lower", label: "LOWERCASE", span: 1,
      icon: UI.icon("case-lower", { size: 16 }),
    },
    {
      value: "upper", label: "UPPERCASE", span: 1,
      icon: UI.icon("case-upper", { size: 16 }),
    },
    {
      value: "none", label: "AS TYPED", span: 1,
      icon: UI.icon("case-sensitive", { size: 16 }),
    },
  ];

  function toggleButton(icon, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-btn col-1";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = icon;
    return btn;
  }

  // options: none.
  window.StyleSection.emphasis = function emphasis(container, target) {
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row";
    group.appendChild(row);

    const italicBtn = toggleButton(ITALIC_ICON, "Italic");
    const underlineBtn = toggleButton(UNDERLINE_ICON, "Underline");

    // .btn-group-inline is display:contents, so UI.buttonGroup's three buttons become direct
    // grid items of THIS .style-row and sit beside the two toggles instead of opening their
    // own grid one row below. This is the resolved layout; CAPTIONS gains it here.
    const caseGroupEl = document.createElement("div");
    caseGroupEl.className = "btn-group-inline";

    row.append(italicBtn, underlineBtn, caseGroupEl);
    container.appendChild(group);

    // Built ONCE, same rule as the SIZE field: UI.buttonGroup wipes its container.
    function wireToggle(btn, field) {
      btn.addEventListener("click", () => {
        const next = !target.getFieldValue(field);
        target.setField(field, next);   // FormatRun-capable
        btn.setAttribute("aria-pressed", String(next));
      });
    }
    wireToggle(italicBtn, "italic");
    wireToggle(underlineBtn, "underline");

    // "none" is a placeholder, not target.getFieldValue("text_case"): this factory runs once
    // at panel load, before any text block/caption track necessarily exists yet, and
    // getFieldValue throws in that state. render() supplies the real active case immediately
    // after, and only ever runs once a block/track exists (each panel's own empty-state guard).
    const setActiveCase = UI.buttonGroup(caseGroupEl, CASE_OPTIONS, "none",
      // text_case has no FormatRun equivalent — always a whole-preset write.
      (value) => target.setPresetField("text_case", value));

    return {
      render() {
        italicBtn.setAttribute("aria-pressed", String(!!target.getFieldValue("italic")));
        underlineBtn.setAttribute("aria-pressed", String(!!target.getFieldValue("underline")));
        setActiveCase(target.getFieldValue("text_case") || "none");
      },
    };
  };
})();
