// Reusable safe-zone darkening guide, framework-free. Attaches to window.SAFE_ZONES/UI.
// SAFE_ZONES remains the single source of truth for the 4 real-TikTok-chrome band percentages
// that static/safe-zone-geometry.js derives TOP_ZONE_BOTTOM/CAPTION_ZONE_TOP/CAPTION_ZONE_BOTTOM/
// HORIZONTAL_MARGIN (and, in turn, TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT) from — but as of the
// safe-zone-darkening-alignment feature it's no longer iterated to render 4 separate shaded/
// labeled bands. UI.safeZones now darkens everything outside ONE context-aware safe rectangle
// instead (see the `kind` param below), via one flat-tinted `.safe-zone-dim` div rather than 4
// separate `.safe-zone-bar-*` divs — the cutout is punched out via a CSS `mask-image` (a
// "full-canvas white rect + a black hole" luminance-mask data URI, the same technique
// `static/shape-mask.js`'s `cssInverseMaskImage` uses for the video/image-box rubylith mask-edit
// overlay — built locally here rather than reusing that file, since it isn't `require()`-safe
// under `node --test`: it assigns `window.ShapeMask` unconditionally with no
// `typeof window !== "undefined"` guard) instead of 4 tiled scrim rectangles. (Briefly given a
// diagonal-striped fill the same day as this rewrite, safe-zone-scrim-stripes feature — reverted
// the day after, safe-zone-revert-stripes feature, back to the flat tint per feedback; the
// single-div-plus-mask architecture itself was kept either way, it's simpler than 4 tiled bars
// regardless of fill style.)
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

// A luminance mask data URI on a 100x100 canvas (matching our percent-of-canvas coordinate
// system exactly): a full white rect (visible everywhere) with a black rect punched out over
// `r` (hidden there — the safe rect's own hole).
function maskDataUri(r) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
    `<rect x="0" y="0" width="100" height="100" fill="#fff"/>` +
    `<rect x="${r.left}" y="${r.top}" width="${r.right - r.left}" height="${r.bottom - r.top}" fill="#000"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// The mask-image rule for .safe-zone-dim, computed from the active safe rect
// (TEXT_IMAGE_SAFE_RECT for kind="text", CAPTION_SAFE_RECT for kind="caption"). mask-size
// stretches the 100x100 intrinsic SVG to the element's own actual rendered box (#safe-zones isn't
// a fixed pixel size — it fills #stage, which is itself CSS-scaled to the viewport).
function guideCss(kind) {
  const rectPx = kind === "caption"
    ? uiSafeZonesGlobal.SafeZoneGeometry.CAPTION_SAFE_RECT
    : uiSafeZonesGlobal.SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  const mask = maskDataUri(rectToPercent(rectPx));
  return `.safe-zone-dim { mask-image: ${mask}; -webkit-mask-image: ${mask}; mask-size: 100% 100%; -webkit-mask-size: 100% 100%; }`;
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
  const dim = document.createElement("div");
  dim.className = "safe-zone-dim";
  container.appendChild(dim);
  const label = document.createElement("div");
  label.className = "safe-zone-label";
  label.innerHTML = `<span class="safe-zone-label-icon">${uiSafeZonesGlobal.UI.icon("shield", { size: 14 })}</span><span class="safe-zone-label-text">SAFE ZONE</span>`;
  container.appendChild(label);
};

if (typeof module !== "undefined") {
  module.exports = { rectToPercent, guideCss };
}
