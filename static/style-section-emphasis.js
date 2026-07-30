// Shared emphasis row for the TEXT and CAPTIONS Design tabs: Italic and Underline toggles plus
// the lowercase / UPPERCASE / As-typed case group, all on ONE .style-row via .btn-group-inline.
// Builds its own markup. italic/underline write through target.setField (FormatRun-capable);
// text_case writes through target.setPresetField (whole-preset only, no per-range override).
window.StyleSection = window.StyleSection || {};

(() => {
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

  function toggleButton(container, icon, label) {
    const btn = UI.button(container, { icon, size: "sm" });
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", "false");
    btn.classList.add("col-1");
    return btn;
  }

  // options: none.
  window.StyleSection.emphasis = function emphasis(container, target) {
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row";
    group.appendChild(row);

    // UI.button appends to its container immediately, so build directly into `row` in visual
    // order rather than creating all children then appending.
    const italicBtn = toggleButton(row, "italic", "Italic");
    const underlineBtn = toggleButton(row, "underline", "Underline");

    // .btn-group-inline is display:contents, so UI.buttonGroup's three buttons become direct
    // grid items of THIS .style-row and sit beside the two toggles instead of opening their
    // own grid one row below. This is the resolved layout; CAPTIONS gains it here.
    const caseGroupEl = document.createElement("div");
    caseGroupEl.className = "btn-group-inline";
    row.appendChild(caseGroupEl);
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
