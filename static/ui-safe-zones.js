// Reusable safe-zone reference overlay, framework-free. Attaches to window.SAFE_ZONES/UI.
// Depends on the .safe-zone/.chip CSS (safe-zones.css, chip.css). Single source of truth for
// the 4 bands' geometry — static/safe-zone-geometry.js derives its pixel constants from this.
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

function insetDecls(inset) {
  const parts = [];
  if (inset.top !== undefined) parts.push(`top: ${inset.top}%`);
  if (inset.right !== undefined) parts.push(`right: ${inset.right}%`);
  if (inset.bottom !== undefined) parts.push(`bottom: ${inset.bottom}%`);
  if (inset.left !== undefined) parts.push(`left: ${inset.left}%`);
  if (inset.width !== undefined) parts.push(`width: ${inset.width}%`);
  if (inset.height !== undefined) parts.push(`height: ${inset.height}%`);
  return parts.join("; ");
}

// One CSS rule per band, e.g. ".safe-zone-top { top: 0%; left: 0%; right: 0%; height: 6%; }" —
// keeps SAFE_ZONES as the single source of truth for geometry while avoiding a per-band inline
// `style` attribute (this project's no-inline-style convention).
function zoneRuleCss(zone) {
  return `.safe-zone-${zone.key} { ${insetDecls(zone.inset)}; }`;
}

const STYLE_EL_ID = "safe-zone-geometry-style";

// Injects the generated geometry <style> element once (idempotent — safe to call on every
// render), rather than per-band inline styles on each div.
function ensureStyleElement() {
  if (document.getElementById(STYLE_EL_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_EL_ID;
  style.textContent = uiSafeZonesGlobal.SAFE_ZONES.map(zoneRuleCss).join("\n");
  document.head.appendChild(style);
}

// Renders all 4 bands into container (expects container to already be the #safe-zones element,
// which owns position:absolute/inset:0/pointer-events:none from safe-zones.css).
uiSafeZonesGlobal.UI.safeZones = function safeZones(container) {
  container.innerHTML = "";
  ensureStyleElement();
  for (const zone of uiSafeZonesGlobal.SAFE_ZONES) {
    const div = document.createElement("div");
    div.className = `safe-zone safe-zone-${zone.key}`;
    const span = document.createElement("span");
    span.className = "chip chip--outlined chip--safe-zone";
    span.innerHTML = zone.label;
    div.appendChild(span);
    container.appendChild(div);
  }
};
