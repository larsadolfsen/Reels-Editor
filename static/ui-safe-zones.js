// Reusable safe-zone guide, framework-free. Attaches to window.SAFE_ZONES/UI.
// SAFE_ZONES remains the single source of truth for the 4 real-TikTok-chrome band percentages
// that static/safe-zone-geometry.js derives TOP_ZONE_BOTTOM/CAPTION_ZONE_TOP/CAPTION_ZONE_BOTTOM/
// HORIZONTAL_MARGIN (and, in turn, TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT) from — but as of the
// safe-zone-darkening-alignment feature it's no longer iterated to render 4 separate shaded/
// labeled bands. UI.safeZones outlines ONE context-aware safe rectangle instead (see the `kind`
// param below) with a black/yellow hazard-stripe border (`.safe-zone-border`), replacing the
// earlier diagonally-striped darkening scrim that covered the rest of the canvas — that scrim was
// found too visually intrusive while editing (safe-zone-border-not-scrim feature), so the guide is
// now a non-covering outline: nothing outside the safe rect is dimmed or drawn over.
const uiSafeZonesGlobal = typeof window !== "undefined" ? window : global;
uiSafeZonesGlobal.UI = uiSafeZonesGlobal.UI || {};

// Percentages are of the 1080x1920 canvas (matching TikTok's real UI chrome). `inset` uses the
// same box-model shorthand as CSS: {top, right, bottom, left, width, height} as percentages.
uiSafeZonesGlobal.SAFE_ZONES = [
  { key: "top", label: "FOLLOWING / FOR YOU", inset: { top: 0, left: 0, right: 0, height: 6 } },
  { key: "right", label: "LIKE &middot; COMMENT &middot; SAVE &middot; SHARE", inset: { top: 40, right: 0, width: 15, height: 44 } },
  { key: "caption", label: "USERNAME / CAPTION / SOUND", inset: { left: 0, right: 15, bottom: 7, height: 20 } },
  { key: "nav", label: "HOME / DISCOVER / INBOX / PROFILE", inset: { left: 0, right: 0, bottom: 0, height: 7 } },
];

const STYLE_EL_ID = "safe-zone-geometry-style";

// Percent-of-canvas division (e.g. 162 / 1080 * 100) lands on values like 15.000000000000002 due
// to binary floating point — round to squash that drift back to the clean decimal, same fix
// safe-zone-geometry.js applies to its own derived constants. Named specifically (not the generic
// `round`, a classic-script top-level function here would collide with any other file's own
// top-level `round`/`const round`) since this is a plain script, not an IIFE.
function roundPct(n) { return Math.round(n * 1e6) / 1e6; }

// Converts a SafeZoneGeometry px rect ({left, right, top, bottom}, safe-zone-geometry.js) into
// percent-of-canvas bounds — the unit the generated <style> rules below are written in.
function rectToPercent(rect) {
  const w = uiSafeZonesGlobal.SafeZoneGeometry.CANVAS_W;
  const h = uiSafeZonesGlobal.SafeZoneGeometry.CANVAS_H;
  return {
    top: roundPct((rect.top / h) * 100),
    bottom: roundPct((rect.bottom / h) * 100),
    left: roundPct((rect.left / w) * 100),
    right: roundPct((rect.right / w) * 100),
  };
}

// The position/size rule for .safe-zone-border, computed from the active safe rect
// (TEXT_IMAGE_SAFE_RECT for kind="text", CAPTION_SAFE_RECT for kind="caption"), in percent of
// #safe-zones' own rendered box (#safe-zones isn't a fixed pixel size — it fills #stage, which is
// itself CSS-scaled to the viewport). .safe-zone-label's own position is set imperatively in
// safeZones() below, not here — it needs the label's actual rendered height (which a fixed-px CSS
// offset can't know), so it's computed from real DOM geometry after both elements are mounted.
function guideCss(kind) {
  const rectPx = kind === "caption"
    ? uiSafeZonesGlobal.SafeZoneGeometry.CAPTION_SAFE_RECT
    : uiSafeZonesGlobal.SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  const pct = rectToPercent(rectPx);
  const width = roundPct(pct.right - pct.left);
  const height = roundPct(pct.bottom - pct.top);
  return `.safe-zone-border { left: ${pct.left}%; top: ${pct.top}%; width: ${width}%; height: ${height}%; }`;
}

// Injects/updates the generated geometry <style> element (idempotent — safe to call on every
// render; the element is reused, only its content is replaced when `kind` changes).
function ensureStyleElement(kind) {
  let style = document.getElementById(STYLE_EL_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_EL_ID;
    document.head.appendChild(style);
  }
  style.textContent = guideCss(kind);
}

// Renders the outline guide into container (expects container to already be the #safe-zones
// element, which owns position:absolute/inset:0/pointer-events:none from safe-zones.css).
// kind: "text" (default) outlines the wide, centered text/image safe area
// (SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT); "caption" outlines the narrower, lower caption-only
// safe area (SafeZoneGeometry.CAPTION_SAFE_RECT). Call again with a different kind to switch which
// rect is outlined — editor.js's renderTimeline() does this on every selection change. A
// "SAFE ZONE ON" label (shield icon + text) sits pinned to the stage's own top edge
// (top: 8px, safe-zones.css), independent of which rect is currently outlined.
uiSafeZonesGlobal.UI.safeZones = function safeZones(container, kind = "text") {
  container.innerHTML = "";
  ensureStyleElement(kind);
  const border = document.createElement("div");
  border.className = "safe-zone-border";
  container.appendChild(border);
  const label = document.createElement("div");
  label.className = "safe-zone-label";
  label.innerHTML = `<span class="safe-zone-label-icon">${uiSafeZonesGlobal.UI.icon("shield", { size: 14 })}</span><span class="safe-zone-label-text">SAFE ZONE ON</span>`;
  container.appendChild(label);
};

if (typeof module !== "undefined") {
  module.exports = { rectToPercent, guideCss };
}
