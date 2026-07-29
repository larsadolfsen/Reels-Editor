// Shared emphasis row for the TEXT and CAPTIONS Design tabs: Italic and Underline toggles plus
// the lowercase / UPPERCASE / As-typed case group, all on ONE .style-row via .btn-group-inline.
// Builds its own markup. italic/underline write through target.setField (FormatRun-capable);
// text_case writes through target.setPresetField (whole-preset only, no per-range override).
window.StyleSection = window.StyleSection || {};

(() => {
  const ITALIC_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>';
  const UNDERLINE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>';

  // Copied verbatim — SVG paths included — from text-panel-case.js, which caption-panel-case.js
  // held a byte-identical second copy of. This is now the only copy.
  const CASE_OPTIONS = [
    {
      value: "lower", label: "LOWERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3" /><path d="M10 9v6" /><circle cx="17" cy="12" r="3" /><path d="M14 7v8" /></svg>',
    },
    {
      value: "upper", label: "UPPERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><path d="M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4" /></svg>',
    },
    {
      value: "none", label: "AS TYPED", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><circle cx="18" cy="12" r="3" /><path d="M21 9v6" /></svg>',
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

    const setActiveCase = UI.buttonGroup(caseGroupEl, CASE_OPTIONS,
      target.getFieldValue("text_case") || "none",
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
