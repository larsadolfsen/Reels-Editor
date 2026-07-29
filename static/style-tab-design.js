// Design-tab composer: builds the shared style sections into one mount container in the fixed
// order both the TEXT and CAPTIONS panels use, so the layout is structural rather than a
// convention each panel re-states. The order lives here and nowhere else.
window.StyleTab = window.StyleTab || {};

// The final order (master plan) is: fontFamily, fontWeight, size, emphasis, color, outline,
// shadow, highlight. Only the first two are shared components so far — the rest are still each
// panel's own markup sitting below this mount point, and move up into this list in Batches 3-4.
window.StyleTab.design = function design(container, target, options) {
  const opts = options || {};

  const sections = [
    StyleSection.fontFamily(container, target, { host: opts.host }),
    StyleSection.fontWeight(container, target, { host: opts.host, sampleText: opts.sampleText }),
  ];

  return {
    // Returns a promise because fontWeight.render() awaits Api.listFontWeights; the panels await
    // it so the Weight row's label is filled in before the panel render is considered done.
    render() { return Promise.all(sections.map((s) => s.render())); },
  };
};
