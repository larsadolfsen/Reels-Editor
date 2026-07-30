// Box-tab composer: renders the box and position sections into one tab body, in that fixed
// order, for both the TEXT and CAPTIONS panels. The order is defined here and nowhere else,
// which is what stops the two panels drifting apart again. (align moved to the Design tab
// 2026-07-30 — see style-tab-design.js.)
window.StyleTab = window.StyleTab || {};

// options.sizeModes is forwarded to StyleSection.box: true for TEXT (hides WIDTH/HEIGHT while
// auto-sizing to content), false for CAPTIONS (a caption box is always a fixed size).
window.StyleTab.box = function box(container, target, options) {
  const opts = options || {};

  container.innerHTML = "";

  // Each section builds into its own wrapper. .style-section makes the wrapper layout-transparent
  // and restores the bottom margin that .style-group:last-child would otherwise drop — see
  // style-panel.css.
  function mount() {
    const el = document.createElement("div");
    el.className = "style-section";
    container.appendChild(el);
    return el;
  }

  const boxEl = mount();
  // The box -> POSITION separator is a boundary between two sections, not part of either,
  // so the composer owns it (it was #text-box-border-position-divider /
  // #caption-box-border-position-divider in the markup this replaces).
  const dividerEl = document.createElement("div");
  container.appendChild(dividerEl);
  const positionEl = mount();

  const boxSection = StyleSection.box(boxEl, target, { sizeModes: !!opts.sizeModes });
  UI.divider(dividerEl);
  const positionSection = StyleSection.position(positionEl, target, {});

  function render() {
    boxSection.render();
    positionSection.render();
  }

  return { render };
};
