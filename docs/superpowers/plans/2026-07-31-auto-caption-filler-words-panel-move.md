# Move Auto-caption into CAPTIONS panel's Auto tab; Filler words into a subpanel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AUTO CAPTION section (Language row + Auto-caption button) from the VIDEO panel's Auto tab into the CAPTIONS panel, renaming that panel's "Filler words" tab to "Auto"; then turn the always-inline filler-word list into a drill-down subpanel that's hidden until a transcript exists.

**Architecture:** Pure frontend DOM-wiring change — move markup blocks between two panels in `static/index.html`, rename the JS files that own that markup to reflect their new owning panel (matching this codebase's per-panel-per-feature file convention), and update the CAPTIONS panel's tab config. No backend or data-model changes. No new pure logic — this is DOM wiring, so there are no new unit tests; verification is a manual live-browser check per task, matching the precedent set by other DOM-only features in this codebase (e.g. `export-progress.js` has no test file).

**Tech Stack:** Vanilla JS (no build step), FastAPI dev server for live verification.

## Global Constraints

- No backend/data-model changes (see spec: "No backend or data-model changes — this is a pure frontend reorganization").
- AUTO CAPTION moves out of the VIDEO panel's Auto tab entirely — not duplicated (per user decision during brainstorming).
- The CAPTIONS panel's Auto tab icon changes from `slice` to `sparkles` — the same icon the VIDEO panel's own Auto tab already uses (`VIDEO_TAB_ICON_AUTO` in `static/panel-video.js`), for visual consistency between the two "Auto" tabs.
- The FILLER WORDS section (button + settings row) must stay hidden whenever `project.captions` is unset or has zero words — this mirrors the exact hidden-condition already used by `static/panel-auto-slice.js`'s `render()`: `!(project.captions && project.captions.words.length)`.
- Global objects reached into by these files (already established elsewhere, not introduced by this plan): `project`, `saveProject`, `renderTimeline`, `ensureCaptionTrack`, `renderCaptionPanel`, `AVAILABLE_LANGUAGES`, `AutoSlicePanel`, `AudioTrackPanel`, `FillerWords`, `UI`, `Api`.
- No `<script>` tag reordering in `index.html` — the renamed files keep their exact current script-tag positions (only the `src` filenames change) since no top-level code in them depends on load order beyond what already works today.

---

## Task 1: Move AUTO CAPTION into the CAPTIONS panel's renamed "Auto" tab

**Files:**
- Modify: `static/index.html`
- Rename+modify: `static/audio-panel-language.js` → `static/caption-panel-language.js`
- Rename+modify: `static/audio-panel-auto-caption.js` → `static/caption-panel-auto-caption.js`
- Modify: `static/panel-audio-track.js`
- Modify: `static/panel-captions.js`
- Modify: `static/panel-video.js` (comment only)

**Interfaces:**
- Consumes: `ensureCaptionTrack()`, `renderCaptionPanel()` (both from `static/panel-captions.js`); `project`, `saveProject()`, `renderTimeline()` (from `static/editor.js`); `AVAILABLE_LANGUAGES` (from `static/editor.js`); `UI.settingsRow`, `UI.subPanelHeader`, `UI.listRow`, `UI.icon` (from `static/ui-*.js`).
- Produces: `window.CaptionPanel.renderLanguage()` (new — the language settings-row renderer, called from `renderCaptionPanel()`); `window.AudioTrackPanel.render()` (unchanged signature, simplified body — still called by `static/panel-video.js`).

- [ ] **Step 1: Move the AUTO CAPTION markup out of `#video-auto-body` and remove `#video-audio-language`**

In `static/index.html`, find this block (the `#video-auto-body` div, currently holding both AUTO CAPTION and AUTO SILENCE):

```html
          <div id="video-auto-body">
            <div class="section-label-spacer text-eyebrow">AUTO CAPTION</div>

            <div class="style-group">
              <div id="audio-language-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <button id="audio-auto-caption-btn" class="col-8" data-button data-button-icon="pencil-sparkles" hidden>Auto-caption</button>
              <p id="audio-transcribe-error" class="context-panel-name col-8 caption-transcribe-error" hidden></p>
            </div>

            <div class="section-label-spacer text-eyebrow">AUTO SILENCE</div>

            <div id="auto-slice-idle" class="style-group">
              <p class="auto-slice-hint text-hint">Detect silence and filler words (um, uh…) and remove them from the timeline.</p>
              <p id="auto-slice-no-transcript-hint" class="auto-slice-hint text-hint" hidden>No transcript yet — only silence will be detected. Run Auto-caption above to also catch filler words.</p>
              <button id="auto-slice-detect-btn" class="col-8" data-button data-button-icon="pencil-sparkles" hidden>Detect Silence &amp; Filler Words</button>
            </div>
```

Replace it with (AUTO CAPTION block removed, hint text updated since Auto-caption is no longer "above" it):

```html
          <div id="video-auto-body">
            <div class="section-label-spacer text-eyebrow">AUTO SILENCE</div>

            <div id="auto-slice-idle" class="style-group">
              <p class="auto-slice-hint text-hint">Detect silence and filler words (um, uh…) and remove them from the timeline.</p>
              <p id="auto-slice-no-transcript-hint" class="auto-slice-hint text-hint" hidden>No transcript yet — only silence will be detected. Run Auto-caption in the CAPTIONS panel's Auto tab to also catch filler words.</p>
              <button id="auto-slice-detect-btn" class="col-8" data-button data-button-icon="pencil-sparkles" hidden>Detect Silence &amp; Filler Words</button>
            </div>
```

(The rest of `#video-auto-body` — `#auto-slice-results`, `#auto-slice-confirm`, and the closing `</div>` — is untouched.)

Then find and delete the now-orphaned `#video-audio-language` subpanel block, a sibling of `#video-main` inside `#panel-video`:

```html
        <div id="video-audio-language" hidden>
          <div id="audio-language-subpanel-header"></div>
          <ul id="audio-language-list" class="font-list"></ul>
        </div>
```

Delete those 4 lines entirely (the blank line before/after may remain — just don't leave two blank lines in a row).

- [ ] **Step 2: Rename the CAPTIONS panel's "Filler words" tab body to `#caption-auto-body` and prepend the AUTO CAPTION markup**

Find:

```html
          <div id="caption-filler-body">
            <div class="style-group">
              <button id="caption-filler-auto-remove-btn" class="col-8" data-button data-button-icon="slice" hidden>Auto-remove filler words</button>
            </div>

            <div class="section-label-spacer text-eyebrow">FILLER WORDS</div>
            <div class="style-group">
              <div class="style-row">
                <input id="caption-filler-word-input" type="text" class="col-6" placeholder="e.g. øh">
                <button id="caption-filler-word-add" class="col-2" data-button data-button-size="sm" data-button-icon="plus" title="Add filler word"></button>
              </div>
            </div>
            <ul id="caption-filler-words-list" class="font-list"></ul>
          </div>
```

Replace with (renamed id, AUTO CAPTION prepended with `caption-`-prefixed ids; FILLER WORDS content unchanged for now — Task 2 restructures it):

```html
          <div id="caption-auto-body">
            <div class="section-label-spacer text-eyebrow">AUTO CAPTION</div>

            <div class="style-group">
              <div id="caption-language-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <button id="caption-auto-caption-btn" class="col-8" data-button data-button-icon="pencil-sparkles" hidden>Auto-caption</button>
              <p id="caption-transcribe-error" class="context-panel-name col-8 caption-transcribe-error" hidden></p>
            </div>

            <div class="style-group">
              <button id="caption-filler-auto-remove-btn" class="col-8" data-button data-button-icon="slice" hidden>Auto-remove filler words</button>
            </div>

            <div class="section-label-spacer text-eyebrow">FILLER WORDS</div>
            <div class="style-group">
              <div class="style-row">
                <input id="caption-filler-word-input" type="text" class="col-6" placeholder="e.g. øh">
                <button id="caption-filler-word-add" class="col-2" data-button data-button-size="sm" data-button-icon="plus" title="Add filler word"></button>
              </div>
            </div>
            <ul id="caption-filler-words-list" class="font-list"></ul>
          </div>
```

- [ ] **Step 3: Fix the stale "AUDIO panel" reference in the Closed-captions tab's empty-transcript hint**

Find (in the `#caption-words-body` div, unrelated to the markup touched above but referencing Auto-caption's old location):

```html
            <p id="caption-words-empty-hint" class="auto-slice-hint text-hint">No transcript yet — run Auto-caption in the AUDIO panel.</p>
```

Replace with:

```html
            <p id="caption-words-empty-hint" class="auto-slice-hint text-hint">No transcript yet — run Auto-caption above.</p>
```

- [ ] **Step 4: Add the `#panel-captions-language` subpanel**

Find (the closing of `#panel-captions-main`, immediately before the `#panel-captions-background` subpanel):

```html
        </div>

        <div id="panel-captions-background" hidden>
```

Replace with:

```html
        </div>

        <div id="panel-captions-language" hidden>
          <div id="caption-language-subpanel-header"></div>
          <ul id="caption-language-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-background" hidden>
```

- [ ] **Step 5: Rename `static/audio-panel-language.js` to `static/caption-panel-language.js`**

```bash
git mv static/audio-panel-language.js static/caption-panel-language.js
```

Replace its entire contents with:

```js
// CAPTIONS panel's Auto tab: the language passed to faster-whisper when transcribing
// (CaptionTrack.language, "" = auto-detect). Settings-row + drill-down subpanel, same pattern as
// caption-panel-background.js. Exposes window.CaptionPanel.renderLanguage(). Reaches into
// editor.js's project/saveProject/ensureCaptionTrack/AVAILABLE_LANGUAGES globals.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let languageRowSetValue = null;

  function openLanguagePanel() {
    renderLanguageList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-language").hidden = false;
  }

  function closeLanguagePanel() {
    document.getElementById("panel-captions-language").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  function labelFor(code) {
    const found = AVAILABLE_LANGUAGES.find((l) => l.code === code);
    return found ? found.label : AVAILABLE_LANGUAGES[0].label;
  }

  async function selectLanguage(code) {
    const track = ensureCaptionTrack();
    track.language = code;
    await saveProject();
    renderLanguage();
    closeLanguagePanel();
  }

  function renderLanguageList() {
    const listEl = document.getElementById("caption-language-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    AVAILABLE_LANGUAGES.forEach((lang) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectLanguage(lang.code));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = lang.label;
      li.appendChild(nameEl);

      if (lang.code === track.language) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("caption-language-subpanel-header"), { title: "Language", onBack: closeLanguagePanel });

  function renderLanguage() {
    const track = ensureCaptionTrack();
    const label = labelFor(track.language);
    if (languageRowSetValue) {
      languageRowSetValue(label);
    } else {
      languageRowSetValue = UI.settingsRow(document.getElementById("caption-language-row"), {
        label: "Language", value: label,
        onClick: openLanguagePanel,
      });
    }
  }

  window.CaptionPanel.renderLanguage = renderLanguage;
})();
```

- [ ] **Step 6: Rename `static/audio-panel-auto-caption.js` to `static/caption-panel-auto-caption.js`**

```bash
git mv static/audio-panel-auto-caption.js static/caption-panel-auto-caption.js
```

Replace its entire contents with:

```js
// CAPTIONS panel's Auto tab: the Auto-caption button — runs transcription and merges the result
// into `project`. Exposes the global runAutoCaption(), also called by clip-sequence.js and
// editor.js when an audible clip is added (auto-caption-on-clip-add). Reaches into editor.js's
// project/renderTimeline and panel-captions.js's ensureCaptionTrack/renderCaptionPanel globals.

// The button's disabled/label state only has a visible effect when the CAPTIONS panel's Auto tab
// happens to be open; otherwise this just quietly updates captions/timeline once done, same
// "background enhancement, no loading UI" pattern as thumbnail/waveform/filmstrip fetches
// elsewhere in this app. Failures (e.g. 503 when the `ml` extra isn't installed) surface in
// #caption-transcribe-error.
async function runAutoCaption() {
  ensureCaptionTrack();
  const btn = document.getElementById("caption-auto-caption-btn");
  const label = btn.querySelector(".label");
  const errorEl = document.getElementById("caption-transcribe-error");
  errorEl.hidden = true;
  btn.disabled = true;
  label.textContent = "Transcribing…";
  try {
    const res = await fetch(`/api/projects/${project.id}/transcribe`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      errorEl.textContent = (body && body.detail) || `Transcription failed (${res.status}).`;
      errorEl.hidden = false;
      return;
    }
    project = await res.json();
    await renderCaptionPanel();   // repopulates the CAPTIONS transcript list, even while hidden
    AudioTrackPanel.render();     // refreshes VIDEO panel's AUTO SILENCE no-transcript hint
    renderTimeline();
  } catch {
    errorEl.textContent = "Transcription failed: could not reach the server.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
}

document.getElementById("caption-auto-caption-btn").addEventListener("click", runAutoCaption);
```

- [ ] **Step 7: Simplify `static/panel-audio-track.js` to AUTO SILENCE only**

Replace its entire contents with:

```js
// VIDEO panel's Auto tab content (timeline audio-track automation): sequences
// ensureCaptionTrack() and AutoSlicePanel.render() (the auto-slice flow, panel-auto-slice.js).
// AUTO CAPTION (Language row + Auto-caption button) moved into the CAPTIONS panel's own Auto tab
// 2026-07-31 — see static/caption-panel-language.js/caption-panel-auto-caption.js — so this tab
// now holds only AUTO SILENCE. Exposes window.AudioTrackPanel.render(), called by panel-video.js
// on every VIDEO-panel render.
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  function render() {
    ensureCaptionTrack();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
```

- [ ] **Step 8: Update the CAPTIONS panel's tab config to rename "Filler words" → "Auto" and wire the language renderer**

In `static/panel-captions.js`, find:

```js
const CAPTION_TAB_ICON_STYLE = UI.icon("paintbrush", { size: 18 });
const CAPTION_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
const CAPTION_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
const CAPTION_TAB_ICON_CLOSED_CAPTION = UI.icon("closed-captioning", { size: 18 });
const CAPTION_TAB_ICON_FILLER = UI.icon("slice", { size: 18 });

const CAPTION_TABS = [
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
  { value: "filler", icon: CAPTION_TAB_ICON_FILLER, label: "Filler words" },
  { value: "style", icon: CAPTION_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: CAPTION_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: CAPTION_TAB_ICON_BOX, label: "Box" },
];
// Each tab maps to one body; the array shape is kept because showCaptionTab iterates it.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  filler: [document.getElementById("caption-filler-body")],
};
```

Replace with:

```js
const CAPTION_TAB_ICON_STYLE = UI.icon("paintbrush", { size: 18 });
const CAPTION_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
const CAPTION_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
const CAPTION_TAB_ICON_CLOSED_CAPTION = UI.icon("closed-captioning", { size: 18 });
// Same icon as VIDEO panel's own Auto tab (static/panel-video.js's VIDEO_TAB_ICON_AUTO), for
// visual consistency between the two "Auto" tabs across panels.
const CAPTION_TAB_ICON_AUTO = UI.icon("sparkles", { size: 18 });

const CAPTION_TABS = [
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
  { value: "auto", icon: CAPTION_TAB_ICON_AUTO, label: "Auto" },
  { value: "style", icon: CAPTION_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: CAPTION_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: CAPTION_TAB_ICON_BOX, label: "Box" },
];
// Each tab maps to one body; the array shape is kept because showCaptionTab iterates it.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  auto: [document.getElementById("caption-auto-body")],
};
```

Then find:

```js
async function renderCaptionPanel() {
  // closeAll() hides every host subpage and un-hides #panel-captions-main.
  captionStyleHost.closeAll();

  ensureCaptionTrack();

  captionStyleTab.render();
  await captionDesignTab.render();
  renderCaptionBoxTab();
  CaptionPanel.renderFillerWords();
  CaptionPanel.renderWords();

  renderCaptionPreview();
}
```

Replace with:

```js
async function renderCaptionPanel() {
  // closeAll() hides every host subpage and un-hides #panel-captions-main.
  captionStyleHost.closeAll();

  ensureCaptionTrack();

  captionStyleTab.render();
  await captionDesignTab.render();
  renderCaptionBoxTab();
  CaptionPanel.renderLanguage();
  CaptionPanel.renderFillerWords();
  CaptionPanel.renderWords();

  renderCaptionPreview();
}
```

Finally, update the file's header comment (top of file) — find:

```js
// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab is one body (`#caption-font-body`)).
// Plain globals shared with caption-panel-*.js; reaches into editor.js's
// `project`/`saveProject`/`renderTimeline` globals. Transcription itself (the Auto-caption button
// and the Language row) lives in the AUDIO panel — see static/audio-panel-auto-caption.js.
```

Replace with:

```js
// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab is one body (`#caption-font-body`)).
// Plain globals shared with caption-panel-*.js; reaches into editor.js's
// `project`/`saveProject`/`renderTimeline` globals. Transcription itself (the Auto-caption button
// and the Language row) lives in this panel's own Auto tab as of 2026-07-31 — see
// static/caption-panel-auto-caption.js/caption-panel-language.js.
```

- [ ] **Step 9: Update `static/panel-video.js`'s header comment**

Find:

```js
// VIDEO context-panel section: trim/order/fill-mode/speed/delete for the selected clip, split
// into Design (FILL + SPEED), Time (TRIM + ORDER), and Auto (AUTO CAPTION + AUTO SILENCE, added
// 2026-07-30 replacing the standalone AUTO rail entry — content unchanged, just relocated and
// rendered via panel-audio-track.js's AudioTrackPanel.render()) tab panes via UI.tabBar (Design
// default). Exposes window.VideoPanel.render()/select()/deleteClip()/moveClipTo(), plus the shared
// clampTrim() helper (also used by panel-video-box.js).
```

Replace with:

```js
// VIDEO context-panel section: trim/order/fill-mode/speed/delete for the selected clip, split
// into Design (FILL + SPEED), Time (TRIM + ORDER), and Auto (AUTO SILENCE only as of 2026-07-31 —
// AUTO CAPTION moved to the CAPTIONS panel's own Auto tab, see panel-audio-track.js) tab panes via
// UI.tabBar (Design default). Exposes window.VideoPanel.render()/select()/deleteClip()/moveClipTo(),
// plus the shared clampTrim() helper (also used by panel-video-box.js).
```

- [ ] **Step 10: Update the `<script>` tags for the two renamed files**

In `static/index.html`, find:

```html
<script src="/static/panel-audio-track.js"></script>
<script src="/static/audio-panel-language.js"></script>
<script src="/static/audio-panel-auto-caption.js"></script>
```

Replace with:

```html
<script src="/static/panel-audio-track.js"></script>
<script src="/static/caption-panel-language.js"></script>
<script src="/static/caption-panel-auto-caption.js"></script>
```

- [ ] **Step 11: Verify live in the browser**

Start the dev server:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` on a throwaway project (never a real one — the app's unload handler autosaves). Then:

1. Select a video clip, open the VIDEO panel's Auto tab — confirm it shows **only** AUTO SILENCE (no AUTO CAPTION section, no console errors).
2. Open the CAPTIONS panel — confirm the second tab is now labeled "Auto" with a sparkles icon (matching VIDEO panel's Auto tab icon), and that clicking it shows AUTO CAPTION (Language row + Auto-caption button) above the still-inline FILLER WORDS list.
3. Click the Language row, pick a language, confirm it saves and the row updates, and the subpanel back-arrow returns to the Auto tab correctly.
4. Import a clip with audio, click "Auto-caption", confirm transcription runs and the transcript appears in the Closed-captions tab.
5. Check the browser console for errors throughout (`read_console_messages` if using the Browser pane tools).

- [ ] **Step 12: Commit**

```bash
git add static/index.html static/panel-audio-track.js static/panel-captions.js static/panel-video.js static/caption-panel-language.js static/caption-panel-auto-caption.js
git commit -m "$(cat <<'EOF'
Move AUTO CAPTION into CAPTIONS panel's renamed Auto tab

AUTO CAPTION (Language + Auto-caption button) no longer lives in the
VIDEO panel's Auto tab (which now holds only AUTO SILENCE) — it moves
into the CAPTIONS panel's own tab, renamed from "Filler words" to
"Auto" to reflect both automations now living there.
EOF
)"
```

---

## Task 2: Turn the filler-word list into a drill-down subpanel, hidden until a transcript exists

**Files:**
- Modify: `static/index.html`
- Modify: `static/caption-panel-filler-words.js`

**Interfaces:**
- Consumes: `project`, `saveProject()`, `renderTimeline()`, `renderCaptionPanel()`, `ensureCaptionTrack()` (unchanged, already available per Task 1); `UI.settingsRow`, `UI.subPanelHeader`, `UI.listRow`, `UI.icon`, `UI.button`; `Api.applyAutoSlice`; `FillerWords.detectRanges`/`FillerWords.normalizeWord`.
- Produces: `window.CaptionPanel.renderFillerWords()` (same exported name as before Task 1 — signature/callers unchanged, so `panel-captions.js`'s `renderCaptionPanel()` needs no further edits).

- [ ] **Step 1: Replace the inline FILLER WORDS markup with a settings row, wrapped in a hidden container**

In `static/index.html`, inside `#caption-auto-body` (from Task 1), find:

```html
            <div class="style-group">
              <button id="caption-filler-auto-remove-btn" class="col-8" data-button data-button-icon="slice" hidden>Auto-remove filler words</button>
            </div>

            <div class="section-label-spacer text-eyebrow">FILLER WORDS</div>
            <div class="style-group">
              <div class="style-row">
                <input id="caption-filler-word-input" type="text" class="col-6" placeholder="e.g. øh">
                <button id="caption-filler-word-add" class="col-2" data-button data-button-size="sm" data-button-icon="plus" title="Add filler word"></button>
              </div>
            </div>
            <ul id="caption-filler-words-list" class="font-list"></ul>
          </div>
```

Replace with:

```html
            <div id="caption-filler-section" hidden>
              <div class="style-group">
                <button id="caption-filler-auto-remove-btn" class="col-8" data-button data-button-icon="slice" hidden>Auto-remove filler words</button>
              </div>

              <div class="section-label-spacer text-eyebrow">FILLER WORDS</div>
              <div class="style-group">
                <div id="caption-filler-words-row" class="col-8"></div>
              </div>
            </div>
          </div>
```

- [ ] **Step 2: Add the `#panel-captions-filler` subpanel, holding the moved add-field + list**

Find (the `#panel-captions-language` block added in Task 1, immediately before `#panel-captions-background`):

```html
        <div id="panel-captions-language" hidden>
          <div id="caption-language-subpanel-header"></div>
          <ul id="caption-language-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-background" hidden>
```

Replace with:

```html
        <div id="panel-captions-language" hidden>
          <div id="caption-language-subpanel-header"></div>
          <ul id="caption-language-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-filler" hidden>
          <div id="caption-filler-subpanel-header"></div>
          <div class="style-group">
            <div class="style-row">
              <input id="caption-filler-word-input" type="text" class="col-6" placeholder="e.g. øh">
              <button id="caption-filler-word-add" class="col-2" data-button data-button-size="sm" data-button-icon="plus" title="Add filler word"></button>
            </div>
          </div>
          <ul id="caption-filler-words-list" class="font-list"></ul>
        </div>

        <div id="panel-captions-background" hidden>
```

- [ ] **Step 3: Rewrite `static/caption-panel-filler-words.js` — add the settings-row/subpanel and the transcript-gating**

Replace the file's entire contents with:

```js
// CAPTIONS panel's Auto tab: the project-wide filler-word list (Project.filler_words) that Auto
// Slice's filler detection matches against — add a new word, see/remove existing ones — plus a
// one-click "Auto-remove filler words" button that cuts every transcribed word matching that list
// straight out of the timeline (via FillerWords.detectRanges + the same /auto-slice/apply
// endpoint AUTO SLICE uses), no silence detection and no review step. Each list entry that
// actually occurs in the current transcript gets a warning icon next to it, so the user can tell
// at a glance which words the button would remove. The whole FILLER WORDS section (button +
// settings row) stays hidden until a transcript exists — matching this list against no transcript
// is meaningless. Not language-specific in storage (plain strings); user builds whatever list
// fits their transcript's language (e.g. Danish "øh"/"øhm"/"altså" instead of the English
// default). Exposes window.CaptionPanel.renderFillerWords(). Reaches into editor.js's
// project/saveProject/renderTimeline globals.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let fillerWordsRowSetValue = null;

  function openFillerPanel() {
    renderFillerWordsList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-filler").hidden = false;
  }

  function closeFillerPanel() {
    document.getElementById("panel-captions-filler").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
  }

  UI.subPanelHeader(document.getElementById("caption-filler-subpanel-header"), { title: "Filler words", onBack: closeFillerPanel });

  async function addFillerWord() {
    const input = document.getElementById("caption-filler-word-input");
    const value = input.value.trim().toLowerCase();
    input.value = "";
    if (!value) return;
    if (!project.filler_words.includes(value)) {
      project.filler_words.push(value);
      await saveProject();
    }
    renderFillerWordsList();
    renderFillerWordsRow();
  }

  async function removeFillerWord(word) {
    project.filler_words = project.filler_words.filter((w) => w !== word);
    await saveProject();
    renderFillerWordsList();
    renderFillerWordsRow();
  }

  // True when `word` (normalized the same way as detection) occurs anywhere in the current
  // transcript, so the FILLER WORDS list can flag which entries Auto-remove would actually cut.
  function wordFoundInTranscript(word) {
    const words = (project.captions && project.captions.words) || [];
    const normalized = FillerWords.normalizeWord(word);
    return words.some((w) => FillerWords.normalizeWord(w.text) === normalized);
  }

  function renderFillerWordsList() {
    const listEl = document.getElementById("caption-filler-words-list");
    listEl.innerHTML = "";
    (project.filler_words || []).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });

      const nameGroup = document.createElement("span");
      nameGroup.className = "font-list-row-name-group";

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = word;
      nameGroup.appendChild(nameEl);

      if (wordFoundInTranscript(word)) {
        // Decorative status icon, not a clickable control — no onClick, so it stays a plain
        // <span> rather than a UI.button, same convention as panel-media.js's
        // .clip-audio-muted-icon indicator.
        const warnIcon = document.createElement("span");
        warnIcon.className = "filler-word-warning-icon";
        warnIcon.title = "Found in transcript";
        warnIcon.innerHTML = UI.icon("message-circle-warning", { size: 14 });
        nameGroup.appendChild(warnIcon);
      }

      li.appendChild(nameGroup);

      const trashBtn = UI.button(li, {
        icon: "trash",
        size: "sm",
        onClick: () => removeFillerWord(word),
      });
      trashBtn.title = "Remove";

      listEl.appendChild(li);
    });
  }

  document.getElementById("caption-filler-word-add").addEventListener("click", addFillerWord);
  document.getElementById("caption-filler-word-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addFillerWord(); }
  });

  function renderFillerWordsRow() {
    const count = (project.filler_words || []).length;
    const value = `${count} word${count === 1 ? "" : "s"}`;
    if (fillerWordsRowSetValue) {
      fillerWordsRowSetValue(value);
    } else {
      fillerWordsRowSetValue = UI.settingsRow(document.getElementById("caption-filler-words-row"), {
        label: "Filler words", value,
        onClick: openFillerPanel,
      });
    }
  }

  async function autoRemoveFillerWords() {
    const track = ensureCaptionTrack();
    const ranges = FillerWords.detectRanges(track.words, project.filler_words);
    if (!ranges.length) return;
    const btn = document.getElementById("caption-filler-auto-remove-btn");
    btn.disabled = true;
    const updated = await Api.applyAutoSlice(project.id, ranges);
    btn.disabled = false;
    if (!updated) return;
    project = updated;
    renderTimeline();
    await renderCaptionPanel();
  }

  document.getElementById("caption-filler-auto-remove-btn").addEventListener("click", autoRemoveFillerWords);

  window.CaptionPanel.renderFillerWords = function renderFillerWords() {
    document.getElementById("caption-filler-section").hidden = !(project.captions && project.captions.words.length);
    renderFillerWordsRow();
    renderFillerWordsList();
  };
})();
```

- [ ] **Step 4: Verify live in the browser**

With the dev server still running (`.venv/Scripts/python -m uvicorn app.main:app --reload`), on a throwaway project:

1. Open the CAPTIONS panel's Auto tab with no transcript yet — confirm the FILLER WORDS section (button + "Filler words" row) is entirely hidden, only AUTO CAPTION shows.
2. Click Auto-caption on a clip with audio; once transcription finishes, confirm the FILLER WORDS section appears with the "Filler words" row showing the current word count (e.g. "7 words" if the project already has default filler words, else "0 words").
3. Click the "Filler words" row — confirm it opens a subpanel with the add-field and the word list (each word found in the transcript flagged with the warning icon), and the back arrow returns to the Auto tab.
4. Add a new word, confirm it appears in the list and the row's count updates immediately (both while the subpanel is open and after navigating back).
5. Remove a word, confirm the same.
6. Click "Auto-remove filler words", confirm it still cuts matching ranges from the timeline as before.
7. Check the browser console for errors throughout.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/caption-panel-filler-words.js
git commit -m "$(cat <<'EOF'
Turn CAPTIONS panel's filler-word list into a drill-down subpanel

The always-inline add-field + word list is now a settings-row +
subpanel (matching Background/Border's pattern), and the whole FILLER
WORDS section stays hidden until a transcript exists — matching a
filler-word list against no transcript was never meaningful.
EOF
)"
```

---

## Task 3: Update the codebase map in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (documentation only).

- [ ] **Step 1: Update the File structure tree**

In `CLAUDE.md`'s File structure section, find the entries for `audio-panel-auto-caption.js`, `audio-panel-language.js`, and `panel-audio-track.js` (all currently described as living under the VIDEO panel's Auto tab), and the `caption-panel-filler-words.js` entry. Rewrite them to reflect:

- `static/caption-panel-language.js` (renamed from `audio-panel-language.js`) — CAPTIONS panel's Auto tab: the transcription-language settings row + drill-down (`#panel-captions-language`), writing `CaptionTrack.language` via `ensureCaptionTrack()`. `window.CaptionPanel.renderLanguage()`.
- `static/caption-panel-auto-caption.js` (renamed from `audio-panel-auto-caption.js`) — CAPTIONS panel's Auto tab: the Auto-caption button + the global `runAutoCaption()`; also called by `clip-sequence.js`/`editor.js` when an audible clip is added.
- `static/panel-audio-track.js` — now VIDEO panel's Auto tab content is AUTO SILENCE only: sequences `ensureCaptionTrack()` and `AutoSlicePanel.render()` (`panel-auto-slice.js`). `window.AudioTrackPanel.render()`, called by `panel-video.js` on every VIDEO-panel render.
- `static/caption-panel-filler-words.js` — CAPTIONS panel's Auto tab: filler-word list, now a settings-row (`#caption-filler-words-row`) + drill-down subpanel (`#panel-captions-filler`) instead of always-inline; the whole FILLER WORDS section hidden until a transcript exists. `window.CaptionPanel.renderFillerWords()`.

Also update the `index.html` entry's prose describing `#panel-video`'s Auto tab (AUTO CAPTION removed) and `#panel-captions`'s tab list/mounts (tab renamed "Filler words"→"Auto", new `#caption-auto-body`/`#panel-captions-language`/`#panel-captions-filler` divs) to match — follow the file's existing prose style (inline, dated parenthetical notes) rather than restructuring the section.

- [ ] **Step 2: Update the Inventory section**

In the "Audio (per-clip volume/mute, background music, real waveforms)" inventory section, remove the bullet describing `audio-panel-language.js`/`audio-panel-auto-caption.js` as owning transcription, and add a note that transcription (Auto-caption button + Language row) moved to the CAPTIONS panel's own Auto tab as of 2026-07-31 — see the "Captions & transcription" section instead.

In the "Captions & transcription" inventory section, add entries for `caption-panel-language.js` and `caption-panel-auto-caption.js` (mirroring the File structure tree descriptions above), and update the `caption-panel-filler-words.js` bullet to describe the new settings-row + subpanel + transcript-gating behavior.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for the Auto-caption/filler-words panel move"
```
