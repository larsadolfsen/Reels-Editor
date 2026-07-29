// Design-tab composer: builds the shared style sections into one mount container in the fixed
// order both the TEXT and CAPTIONS panels use, so the layout is structural rather than a
// convention each panel re-states. The order lives here and nowhere else.
window.StyleTab = window.StyleTab || {};

// The final order (master plan) is: fontFamily, fontWeight, size, emphasis, color, outline,
// shadow, highlight. Only the first two are shared components so far — the rest are still each
// panel's own markup sitting below this mount point, and move up into this list in Batches 3-4.
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
  ];

  return {
    // Returns a promise because fontWeight.render() awaits Api.listFontWeights; the panels await
    // it so the Weight row's label is filled in before the panel render is considered done.
    render() { return Promise.all(sections.map((s) => s.render())); },
  };
};
