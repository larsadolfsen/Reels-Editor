// Left rail's Select-tool button (selector-tool-rail feature, added 2026-07-30, moved out of the
// top toolbar; sits in #rail-tool between #panel-nav-top and #panel-nav-bottom as of the
// selector-tool-rail-placement feature): built via the shared UI.iconRail component (same one
// backing PANEL_NAV_TOP_ITEMS/PANEL_NAV_BOTTOM_ITEMS in panel-nav.js) rather than a hand-rolled
// button, so it gets the same icon+"SELECT" label markup/styling as its FILES/TEXT/... neighbors
// for free (fixed 2026-07-30, fix-text-tool-rail-reuse — a hand-rolled icon-only button here had
// drifted from that shared look once this button moved inline into the rail). Sets window.ToolMode
// to "select" on click and stays pressed while ToolMode is "select", following external tool
// changes (e.g. the TEXT entry arming "text", or a stage insert auto-reverting to "select") via
// UI.iconRail's returned setActive(value) updater. The Text tool itself is armed via the existing
// TEXT entry in #panel-nav-bottom instead of a second button here (see panel-nav.js —
// remove-text-tool-top-bar feature, added 2026-07-30) now that the top toolbar
// (static/ui-toolbar.js) is gone. Exposes window.UI.railToolButton(container).
window.UI = window.UI || {};

window.UI.railToolButton = function railToolButton(container) {
  const items = [{ value: "select", label: "Select", icon: UI.icon("mouse-pointer-2", { size: 20 }), title: "Select tool", shortcut: "V" }];
  const setActive = UI.iconRail(container, items, ToolMode.get(), (value) => ToolMode.set(value));
  ToolMode.onChange((mode) => setActive(mode === "select" ? "select" : null));
};
