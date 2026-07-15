# Safe Zones Overlay — Design

## Purpose
Add a "SAFE ZONES" toggle to the editor's video preview stage. When on, it overlays a reference image of TikTok's UI chrome (Following/For You bar, search icon, right-side like/comment/share rail, caption/username area, bottom nav) on top of the 9:16 preview, so the user can avoid placing text/captions where TikTok's own UI would cover them. Preview-only guide — never affects the exported mp4.

## Asset
`tiktok_overlay_1080x1920_transparent.png` (project root) — a transparent PNG already sized to the export canvas (1080×1920). Moved to `static/img/tiktok-safe-zones-overlay.png` so it's served by the existing `/static` mount. Used as-is, not redrawn.

## Components
- **`static/index.html`**: inside `#stage`, add `<img id="safe-zones" src="/static/img/tiktok-safe-zones-overlay.png" alt="">` as a sibling of `#overlay`, and a `#safe-zones-toggle` button (labelled "SAFE ZONES") positioned in the top-right corner of the stage.
- **New `static/css/components/safe-zones.css`**: `#safe-zones` — `position:absolute; inset:0; width:100%; height:100%; pointer-events:none;` hidden by default (`[hidden]`). `#safe-zones-toggle` — small bordered button, absolute top-right of `#stage`, reusing existing button/icon-btn visual language (border, mono font) rather than inventing new tokens.
- **`static/editor.js`**: a few lines — click handler toggles `#safe-zones`'s `hidden` attribute, persists the boolean to `localStorage['safeZonesVisible']`, restores on load. Mirrors the existing `setPanelCollapsed` pattern.

## Data model
None. Pure client-side UI toggle, not part of `Project`/persisted JSON.

## Out of scope
- Not burned into ffmpeg export.
- No per-project persistence (browser-local only, same tier as `panelCollapsed`).

## Testing
Thin UI wiring with no pure logic to unit test (same category as `setPanelCollapsed`). Verified manually: toggle shows/hides the overlay image at the correct size/position over the stage, state persists across reload, image renders correctly at different stage sizes (aspect-ratio-locked so no distortion), export path untouched.
