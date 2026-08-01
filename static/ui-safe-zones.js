// Reusable safe-zone darkening guide, framework-free. Attaches to window.SAFE_ZONES/UI.
// SAFE_ZONES remains the single source of truth for the 4 real-TikTok-chrome band percentages
// that static/safe-zone-geometry.js derives TOP_ZONE_BOTTOM/CAPTION_ZONE_TOP/CAPTION_ZONE_BOTTOM/
// HORIZONTAL_MARGIN (and, in turn, TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT) from — but as of the
// safe-zone-darkening-alignment feature it's no longer iterated to render 4 separate shaded/
// labeled bands. UI.safeZones now darkens everything outside ONE context-aware safe rectangle
// instead (see the `kind` param below), via one diagonally-striped `.safe-zone-dim` div rather
// than 4 separate `.safe-zone-bar-*` divs — a single continuous element avoids the stripe pattern
// seaming at bar boundaries (each bar would otherwise restart the diagonal at its own origin). The
// cutout is punched out via a CSS `mask-image`: a single `<path fill-rule="evenodd">` tracing the
// full canvas then the hole rect, so the hole is genuinely unpainted (alpha 0) rather than merely
// drawn in a different *color* — CSS `mask-image` on a bare image source keys off the ALPHA
// channel, not luminance (that's only the default for a referenced `<mask>` element), so an
// earlier two-`<rect>` version of this mask (opaque white rect + opaque black rect on top) had
// alpha=255 in the "hole" too — same opacity as the surrounding fill — and produced no cutout at
// all in any browser, regardless of whether the fill was striped or flat (the bug predates and
// outlived the striped-vs-flat back-and-forth below — fixed here, safe-zone-mask-fix feature).
// (The div's fill was briefly reverted from striped to flat the day the mask bug shipped,
// safe-zone-revert-stripes feature, on a mistaken read of user feedback that was actually about
// this same missing-cutout bug, not the stripe pattern itself; restored to striped here now that
// the real bug is fixed.)
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

// An alpha mask data URI on a 100x100 canvas (matching our percent-of-canvas coordinate system
// exactly): ONE evenodd-filled path tracing the full canvas then `r`'s rect — the hole is genuinely
// unpainted there (alpha 0, verified via canvas getImageData: a two-<rect> version — an opaque
// white rect followed by an opaque black rect drawn on top — left alpha=255 in the "hole" too,
// since CSS mask-image keys off the ALPHA channel for a bare image source, not luminance; only a
// referenced <mask> element defaults to luminance). Do not go back to two separate <rect>s here.
function maskDataUri(r) {
  const path = `M0,0 H100 V100 H0 Z M${r.left},${r.top} H${r.right} V${r.bottom} H${r.left} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
    `<path fill-rule="evenodd" fill="#fff" d="${path}"/>` +
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
