# Audio Batch 6: VIDEO Panel VOLUME Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The VIDEO context-panel section gets a VOLUME group — a 0–200% number field plus a mute icon button — for the selected clip, mirroring the existing SPEED group's placement and wiring pattern.

**Architecture:** New `style-group` in `static/index.html`'s `#panel-video` section, right after the existing SPEED group and before the Duplicate/Delete buttons. Wired in `static/panel-video.js`'s existing `render(c)` function using `UI.numberField` (same pattern as the SPEED field) plus a plain icon `<button>` with two SVG children toggled via the codebase's existing `.icon-hidden` class (the same technique `preview.js` already uses for its play/pause icon swap).

**Tech Stack:** Vanilla JS, existing `UI.numberField`/`UI.button` components. No backend changes.

## Global Constraints

**Requires Batch 1** (`ClipLayer.volume`/`muted`) **merged first.** Independent of Batches 2-5, but pairs naturally with Batch 4 (preview) landing first so the slider's effect is audible immediately.

- Volume UI range: 0–200% (matches `ClipLayer.volume`'s 0.0–2.0 model range, Batch 1).
- No inline `style="..."` — icon SVGs go directly in `index.html` markup (existing convention), any sizing/spacing via CSS classes only.
- Reuse `UI.numberField` exactly as the adjacent SPEED field uses it in `static/panel-video.js`'s `render(c)`.

> **Re-verified 2026-07-21 against current `main`:** `static/panel-video.js` and the `#panel-video`
> section of `static/index.html` are structurally unchanged from this plan's assumptions — the
> SPEED field, and the `video-delete`/`video-duplicate` handlers right after it, read exactly as
> quoted below (the only unrelated change in that file is `moveClip` having been renamed to
> `moveClipTo(clipId, newIndex)` for a drag-to-reorder feature, which doesn't affect this batch).
> Insert by matching the quoted code, not by trusting exact line numbers.

---

### Task 1: Add the VOLUME group markup

**Files:**
- Modify: `static/index.html` (inside `#panel-video`, currently lines 165-177)

- [ ] **Step 1: Insert the VOLUME group**

In `static/index.html`, after the existing SPEED group (currently lines 170-173) and before the Duplicate-clip button (currently line 175-177):

```html
        <div class="style-group-label">SPEED</div>
        <div class="style-group">
          <div id="video-speed-field"></div>
        </div>

        <div class="style-group-label">VOLUME</div>
        <div class="style-group">
          <div class="style-row">
            <div id="video-volume-field" class="col-6"></div>
            <button id="video-mute-btn" type="button" class="col-2 button button-icon" title="Mute clip audio">
              <svg class="icon-volume" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>
              <svg class="icon-volume-muted icon-hidden" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>
            </button>
          </div>
        </div>

        <div class="style-group">
          <button id="video-duplicate" class="col-8" type="button">Duplicate clip</button>
        </div>
```

Before committing, open [lucide.dev](https://lucide.dev) and verify the `volume-2`/`volume-x` `<path>` markup above matches exactly (per this project's icon convention) — copy-paste the authoritative paths if they differ from what's shown here.

- [ ] **Step 2: Commit**

```bash
git add static/index.html
git commit -m "feat: add VOLUME group markup to VIDEO panel"
```

---

### Task 2: Wire the VOLUME field and mute button

**Files:**
- Modify: `static/panel-video.js:16-71` (`render(c)`)

**Interfaces:**
- Consumes: `ClipLayer.volume: float`, `ClipLayer.muted: bool` (Batch 1); `Preview.load(project)` (existing, called after every other VIDEO-panel field change in this file).

- [ ] **Step 1: Write the volume field and mute-button wiring**

In `static/panel-video.js`, inside `render(c)`, right after the existing SPEED `UI.numberField` call (currently lines 60-67) and before `document.getElementById("video-delete").onclick = ...` (currently line 69):

```javascript
    UI.numberField(document.getElementById("video-volume-field"),
      { label: "VOLUME", unit: "%", value: Math.round((c.volume ?? 1) * 100), step: 5, min: 0, max: 200, decimals: 0, span: 6,
        onChange: async (v) => {
          c.volume = Math.max(0, Math.min(2, v / 100));
          await saveProject();
          Preview.load(project);
        } });

    const muteBtn = document.getElementById("video-mute-btn");
    const iconVolume = muteBtn.querySelector(".icon-volume");
    const iconMuted = muteBtn.querySelector(".icon-volume-muted");
    function updateMuteIcon() {
      iconVolume.classList.toggle("icon-hidden", c.muted);
      iconMuted.classList.toggle("icon-hidden", !c.muted);
      muteBtn.setAttribute("aria-pressed", String(!!c.muted));
    }
    updateMuteIcon();
    muteBtn.onclick = async () => {
      c.muted = !c.muted;
      updateMuteIcon();
      await saveProject();
      Preview.load(project);
    };
```

Note: every other field in this panel (trim, fill mode, speed) already calls `Preview.load(project)` after mutating the clip and saving — that reloads the stage from clip 0, which is the existing, accepted behavior for every VIDEO-panel edit in this codebase (not a regression this batch introduces).

- [ ] **Step 2: Run the full pytest suite (regression check — JS-only change)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add static/panel-video.js
git commit -m "feat: wire VOLUME field and mute button in VIDEO panel"
```

---

### Task 3: Manual live-verify on a throwaway project

**Files:** none (manual browser check only)

- [ ] **Step 1:** Open a throwaway project, select a clip with real audio in the VIDEO panel.
- [ ] **Step 2:** Drag/type the VOLUME field to 150% — confirm the field commits, the project autosaves (save indicator), and preview playback doesn't error (the audible difference is capped by the browser at 100%, per Batch 4's documented clamp — this step confirms no crash/console error, not perceived loudness).
- [ ] **Step 3:** Click the mute button — confirm the icon swaps from volume-2 to volume-x, the clip plays silently in preview, and re-clicking un-mutes it (icon swaps back, audio resumes).
- [ ] **Step 4:** Reload the page (or reopen the project) — confirm `volume`/`muted` persisted (field shows the same value, mute icon reflects the same state).
- [ ] **Step 5:** Report findings; fix before merging if anything fails.

---

## Batch 6 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes.
- [ ] Manual live-verify (Task 3) passed on a throwaway project.
- [ ] All changes committed.

Next: [Batch 7: AUDIO panel + music import](2026-07-21-audio-batch-7-audio-panel.md).
