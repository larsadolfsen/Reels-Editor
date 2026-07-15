# Safe Zones Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "SAFE ZONES" toggle in the top-right corner of the video stage that shows/hides a reference PNG overlay of TikTok's UI chrome, so users can avoid placing content where TikTok's own UI would cover it.

**Architecture:** A static `<img>` layer inside `#stage` (sibling of `#overlay`), toggled via a `hidden` attribute by a new button, wired the same way `panelCollapsed` is: a `set*` function that toggles a DOM state + writes to `localStorage`, restored on page load. No new color tokens — the PNG carries its own visuals. Preview-only; export path untouched.

**Tech Stack:** Vanilla JS/CSS/HTML (existing stack — no new dependencies).

## Global Constraints
- Overlay image is served from `static/img/tiktok-safe-zones-overlay.png` (already copied into place).
- Overlay must not affect `app/ffmpeg_cmd.py` / export output — preview-only.
- Follow existing button/icon-btn visual language (border, `--font-ui` mono) — no new color tokens.
- Persist toggle state in `localStorage` under key `safeZonesVisible`, same tier as `panelCollapsed`.

---

### Task 1: Safe zones toggle + overlay image

**Files:**
- Modify: `static/index.html` (inside `#stage`, static/index.html:44)
- Create: `static/css/components/safe-zones.css`
- Modify: `static/index.html` (stylesheet `<link>` list, static/index.html:3-12)
- Modify: `static/editor.js` (near `setPanelCollapsed`, static/editor.js:339-346, and the startup IIFE, static/editor.js:362-363)

**Interfaces:**
- Produces: `setSafeZonesVisible(visible)` — module-level function in `editor.js`, same shape as `setPanelCollapsed(collapsed)`. No other task depends on it (single-task plan).

- [ ] **Step 1: Add the overlay `<img>` and toggle button markup**

Edit `static/index.html`. Change line 44 from:
```html
        <div id="stage"><video id="player"></video><div id="overlay"></div></div>
```
to:
```html
        <div id="stage">
          <video id="player"></video>
          <div id="overlay"></div>
          <img id="safe-zones" src="/static/img/tiktok-safe-zones-overlay.png" alt="" hidden>
          <button id="safe-zones-toggle" class="icon-btn" type="button" aria-pressed="false" title="Toggle TikTok UI safe-zone guide">SAFE ZONES</button>
        </div>
```

- [ ] **Step 2: Add the stylesheet link**

Edit `static/index.html`, add after the `color-swatch.css` link (static/index.html:12):
```html
<link rel="stylesheet" href="/static/css/components/safe-zones.css">
```

- [ ] **Step 3: Write `safe-zones.css`**

Create `static/css/components/safe-zones.css`:
```css
/* Safe-zone reference overlay + its toggle button. */
/* Exposes #safe-zones, #safe-zones-toggle. Depends on tokens.css, button-group.css (.icon-btn). */
#safe-zones {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

#safe-zones[hidden] { display: none; }

#safe-zones-toggle {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 10;
  width: auto;
  height: auto;
  padding: 2px var(--space-2);
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

#safe-zones-toggle[aria-pressed="true"] {
  color: var(--text);
  border-color: var(--accent);
}
```

- [ ] **Step 4: Wire the toggle in `editor.js`**

Edit `static/editor.js`. Add right after the `setPanelCollapsed` block (after line 346, `});`):
```javascript
function setSafeZonesVisible(visible) {
  document.getElementById("safe-zones").hidden = !visible;
  document.getElementById("safe-zones-toggle").setAttribute("aria-pressed", String(visible));
  localStorage.setItem("safeZonesVisible", visible ? "1" : "");
}

document.getElementById("safe-zones-toggle").addEventListener("click", () => {
  setSafeZonesVisible(document.getElementById("safe-zones").hidden);
});
```

Then edit the startup IIFE (static/editor.js:362-363) to restore state on load — change:
```javascript
(async () => {
  setPanelCollapsed(localStorage.getItem("panelCollapsed") === "1");
```
to:
```javascript
(async () => {
  setPanelCollapsed(localStorage.getItem("panelCollapsed") === "1");
  setSafeZonesVisible(localStorage.getItem("safeZonesVisible") === "1");
```

- [ ] **Step 5: Manual verification (no automated test — pure UI wiring, per spec's testing section)**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`.
Check in browser:
- "SAFE ZONES" button visible in the top-right corner of the stage.
- Click it: the TikTok chrome overlay image appears on top of the video, matching the stage's aspect ratio without distortion; button shows a highlighted/pressed state.
- Click again: overlay hides, button unpressed.
- Reload the page with the overlay on: it stays on (localStorage persisted).
- Confirm `#overlay` (text-block layer) still renders/updates correctly with the safe-zones image on top (z-order: safe-zones image sits above `#overlay`, both above `#player`).

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/css/components/safe-zones.css static/editor.js
git commit -m "feat: add SAFE ZONES toggle overlaying TikTok UI reference image on stage"
```
