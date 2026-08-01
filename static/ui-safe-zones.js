// Reusable safe-zone darkening guide, framework-free. Attaches to window.SAFE_ZONES/UI.
// SAFE_ZONES remains the single source of truth for the 4 real-TikTok-chrome band percentages
// that static/safe-zone-geometry.js derives TOP_ZONE_BOTTOM/CAPTION_ZONE_TOP/CAPTION_ZONE_BOTTOM/
// HORIZONTAL_MARGIN (and, in turn, TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT) from — but as of the
// safe-zone-darkening-alignment feature it's no longer iterated to render 4 separate shaded/
// labeled bands. UI.safeZones now darkens everything outside ONE context-aware safe rectangle
// instead (see the `kind` param below).
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

// One CSS rule per bar + the cutout border, computed from the active safe rect
// (TEXT_IMAGE_SAFE_RECT for kind="text", CAPTION_SAFE_RECT for kind="caption"). The top/bottom
// bars span the full canvas width (so they also cover the corners above/below the cutout's own
// left/right margins); the left/right bars only span the cutout's own vertical range — so the
// four bars tile the darkened area with no gaps or overlaps.
function guideCss(kind) {
  const rectPx = kind === "caption"
    ? uiSafeZonesGlobal.SafeZoneGeometry.CAPTION_SAFE_RECT
    : uiSafeZonesGlobal.SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  const r = rectToPercent(rectPx);
  return [
    `.safe-zone-bar-top { top: 0%; left: 0%; right: 0%; height: ${r.top}%; }`,
    `.safe-zone-bar-bottom { bottom: 0%; left: 0%; right: 0%; height: ${100 - r.bottom}%; }`,
    `.safe-zone-bar-left { top: ${r.top}%; height: ${r.bottom - r.top}%; left: 0%; width: ${r.left}%; }`,
    `.safe-zone-bar-right { top: ${r.top}%; height: ${r.bottom - r.top}%; left: ${r.right}%; right: 0%; }`,
    `.safe-zone-cutout { top: ${r.top}%; left: ${r.left}%; right: ${100 - r.right}%; bottom: ${100 - r.bottom}%; }`,
  ].join("\n");
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

// Renders the darkening guide into container (expects container to already be the #safe-zones
// element, which owns position:absolute/inset:0/pointer-events:none from safe-zones.css).
// kind: "text" (default) darkens around the wide, centered text/image safe area
// (SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT); "caption" darkens around the narrower, lower
// caption-only safe area (SafeZoneGeometry.CAPTION_SAFE_RECT). Call again with a different kind
// to switch which rect is cut out — editor.js's renderTimeline() does this on every selection
// change. A "SAFE ZONE" label (shield icon + text, safe-zone-guide-tweaks feature, replacing the
// cutout's accent border) sits just below the top edge of the stage, unconditional on `kind` — one
// static indicator that the guide is active, rather than a per-rect outline.
uiSafeZonesGlobal.UI.safeZones = function safeZones(container, kind = "text") {
  container.innerHTML = "";
  ensureStyleElement(kind);
  ["top", "bottom", "left", "right"].forEach((side) => {
    const bar = document.createElement("div");
    bar.className = `safe-zone-bar safe-zone-bar-${side}`;
    container.appendChild(bar);
  });
  const cutout = document.createElement("div");
  cutout.className = "safe-zone-cutout";
  container.appendChild(cutout);
  const label = document.createElement("div");
  label.className = "safe-zone-label";
  label.innerHTML = `<span class="safe-zone-label-icon">${uiSafeZonesGlobal.UI.icon("shield", { size: 14 })}</span><span class="safe-zone-label-text">SAFE ZONE</span>`;
  container.appendChild(label);
};

if (typeof module !== "undefined") {
  module.exports = { rectToPercent, guideCss };
}
