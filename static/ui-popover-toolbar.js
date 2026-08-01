// Reusable hover-reveal popover toolbar, framework-free. Attaches to window.UI.
// UI.popoverToolbar(anchorEl, buttons) appends a small popover above anchorEl: an outer
// hit-area (contiguous with the anchor, no gap, so a diagonal mouse approach can't cross a
// dead zone and lose :hover) wrapping a visible chip (background/border/shadow + a triangle
// pointing down at the anchor) holding one icon-only button per `buttons` entry
// ({icon, title, onClick}). Adds a `ui-popover-toolbar-anchor` class to anchorEl so the
// hover-reveal CSS (popover-toolbar.css) triggers off ANY anchor, not a specific caller's
// element type — first consumer is static/timeline-overlay-copy-toolbar.js, but nothing here
// is timeline-specific. Depends on UI.icon (static/ui-icon.js) and popover-toolbar.css.
const uiPopoverToolbarGlobal = typeof window !== "undefined" ? window : global;
uiPopoverToolbarGlobal.UI = uiPopoverToolbarGlobal.UI || {};

uiPopoverToolbarGlobal.UI.popoverToolbar = function popoverToolbar(anchorEl, buttons) {
  anchorEl.classList.add("ui-popover-toolbar-anchor");

  const toolbar = document.createElement("div");
  toolbar.className = "ui-popover-toolbar";

  const chip = document.createElement("div");
  chip.className = "ui-popover-toolbar-chip";

  buttons.forEach(({ icon, title, onClick }) => {
    const btn = document.createElement("span");
    btn.className = "ui-popover-toolbar-icon";
    btn.title = title;
    btn.innerHTML = uiPopoverToolbarGlobal.UI.icon(icon, { size: 14 });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    chip.appendChild(btn);
  });

  toolbar.appendChild(chip);
  anchorEl.appendChild(toolbar);
  return toolbar;
};
