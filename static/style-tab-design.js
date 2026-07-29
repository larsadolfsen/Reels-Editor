// Design-tab composer: builds the shared style sections into one mount container in the fixed
// order both the TEXT and CAPTIONS panels use, so the layout is structural rather than a
// convention each panel re-states. The order lives here and nowhere else.
window.StyleTab = window.StyleTab || {};

// The final order (master plan) is: fontFamily, fontWeight, size, emphasis, color, outline,
// shadow, highlight. Outline/shadow/highlight arrive in Batch 4 — the rest is each panel's own
// markup sitting below this mount point until then.
window.StyleTab.design = function design(container, target, options) {
  const opts = options || {};

  // Each section renders inside its own .style-section wrapper (layout-transparent via
  // `display: contents`) rather than directly into the shared mount — see style-panel.css's
  // .style-section rules, which restore the inter-section margin the flat .style-group:last-child
  // rule would otherwise strip from every section but the true last one.
  function sectionWrapper() {
    const div = document.createElement("div");
    div.className = "style-section";
    container.appendChild(div);
    return div;
  }

  const sections = [
    StyleSection.fontFamily(sectionWrapper(), target, { host: opts.host }),
    StyleSection.fontWeight(sectionWrapper(), target, { host: opts.host, sampleText: opts.sampleText }),
    StyleSection.size(sectionWrapper(), target, { compactRow: opts.compactSizeRow }),
    StyleSection.emphasis(sectionWrapper(), target, {}),
    StyleSection.color(sectionWrapper(), target, { host: opts.host }),
  ];

  return {
    // Returns a promise because fontWeight.render() awaits Api.listFontWeights; the panels await
    // it so the Weight row's label is filled in before the panel render is considered done.
    render() { return Promise.all(sections.map((s) => s.render())); },
  };
};
