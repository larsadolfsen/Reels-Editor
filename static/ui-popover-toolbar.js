// Reusable hover-reveal popover toolbar, framework-free. Attaches to window.UI.
// UI.popoverToolbar(anchorEl, buttons) appends a small popover above anchorEl: an outer
// hit-area (contiguous with the anchor, no gap, so a diagonal mouse approach can't cross a
// dead zone and lose "hovered") wrapping a visible chip (background/border/shadow + a triangle
// pointing down at the anchor) holding one icon-only button per `buttons` entry
// ({icon, title, onClick}). The chip appears centered under wherever the pointer was when it
// revealed (clamped to the anchor's own width) and then holds that position — it does NOT keep
// tracking the pointer while visible (changed 2026-08-01: continuously re-centering under a
// moving cursor made the chip feel like it was chasing the mouse; appearing where the cursor
// already is, then staying put, gives a stable target to click without drifting). Adds a
// `ui-popover-toolbar-anchor` class to anchorEl so the fade-reveal CSS (popover-toolbar.css)
// triggers off ANY anchor, not a specific caller's element type — first consumer is
// static/timeline-overlay-copy-toolbar.js, but nothing here is timeline-specific. The icon
// buttons reuse the shared .ui-toolbar-icon look (toolbar-chip.css, also used by the timeline's
// playhead slice handle) rather than their own copy of the same rules. Depends on UI.icon
// (static/ui-icon.js), popover-toolbar.css, and toolbar-chip.css.
//
// Reveal is idle-gated, not instant-on-hover (fixed 2026-08-01: an instant popover made it hard
// to move the cursor up through a lane without the chip popping up in the way). A
// `HOVER_DELAY_MS` timer restarts on every mousemove over the anchor and only adds the
// `ui-popover-toolbar-visible` class (CSS fades it in) once the pointer has been still for that
// long — kept short (not the original 400ms) so the toolbar still feels responsive. Once
// visible, only leaving the anchor's whole subtree (mouseleave) hides it again — mousemove never
// hides (or repositions) an already-visible toolbar, so moving the cursor up into the popover
// itself (still a descendant of anchorEl, hence never a mouseleave) never makes it disappear.
const uiPopoverToolbarGlobal = typeof window !== "undefined" ? window : global;
uiPopoverToolbarGlobal.UI = uiPopoverToolbarGlobal.UI || {};

const UI_POPOVER_TOOLBAR_HOVER_DELAY_MS = 120;

uiPopoverToolbarGlobal.UI.popoverToolbar = function popoverToolbar(anchorEl, buttons) {
  anchorEl.classList.add("ui-popover-toolbar-anchor");

  const toolbar = document.createElement("div");
  toolbar.className = "ui-popover-toolbar";

  const chip = document.createElement("div");
  chip.className = "ui-toolbar-chip ui-popover-toolbar-chip";

  buttons.forEach(({ icon, title, onClick }) => {
    const btn = document.createElement("span");
    btn.className = "ui-toolbar-icon";
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

  let hoverTimer = null;
  let lastX = null;

  anchorEl.addEventListener("mousemove", (e) => {
    const rect = anchorEl.getBoundingClientRect();
    lastX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

    if (!toolbar.classList.contains("ui-popover-toolbar-visible")) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        toolbar.style.left = `${lastX}px`;
        toolbar.classList.add("ui-popover-toolbar-visible");
      }, UI_POPOVER_TOOLBAR_HOVER_DELAY_MS);
    }
  });

  anchorEl.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    toolbar.classList.remove("ui-popover-toolbar-visible");
  });

  return toolbar;
};
