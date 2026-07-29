# AUDIO Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the timeline's main video row to `MAIN`, route the timeline AUDIO row click to a new dedicated AUDIO context panel, and move auto-caption + auto silence removal into that panel under one tab.

**Architecture:** Pure frontend relocation. A new `#panel-audio-track` context-panel section holds a single-tab `UI.tabBar` whose one pane contains two labelled groups: AUTO CAPTION (language row + Auto-caption button) and AUTO SILENCE (the existing auto-slice flow). The standalone `#panel-auto-slice` section and the CAPTIONS panel's language/auto-caption controls are moved into it; the AUTO SLICE icon-rail slot becomes AUDIO. No Python, no data-model, and no API changes.

**Tech Stack:** Vanilla ES5-style classic scripts (no bundler), `window.UI.*` presentational helpers, `window.*Panel.render()` module convention, CSS component files under `static/css/components/`.

## Global Constraints

- **No JS build step / bundler.** All new files are classic `<script>` tags added to `static/index.html`. Icon SVGs are hand-inlined [Lucide](https://lucide.dev) paths using the existing wrapper style: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`.
- **No inline `style="..."` attributes** in `static/index.html` or JS-rendered markup. All styling is classes in `static/css/components/**`.
- **Every `static/*.js` file opens with a one- or two-line comment** stating that file's purpose/role.
- **One feature per file.** New reusable logic goes in its own file, never appended to a multi-purpose one.
- **No backend change.** `app/**` and `tests/**` must not be modified by tasks 1–4. `CaptionTrack.language`, `POST /api/projects/{id}/transcribe`, and the `/auto-slice/*` routes stay exactly as they are.
- **No automated coverage exists for this layer** — the repo has no JavaScript test runner (`tests/` is pytest-only). Every task is verified manually in the browser preview, and Task 5 runs the full `pytest` suite to prove the backend is untouched.
- **Never verify against real project data.** The app's `beforeunload` keepalive-save flushes in-memory mutations to disk — always create a throwaway project from the picker before clicking around.
- **Preview server:** start with the `reels-editor` config in `.claude/launch.json` (`preview_start` with `{name: "reels-editor"}`), never with a raw Bash `uvicorn` call.

---

### Task 1: Rename the timeline main row label to MAIN

**Files:**
- Modify: `static/index.html:102`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. The id `label-video` and the row's `data-row="video"` are unchanged, so `Timeline.setRowVisible("video", …)` and `timeline.css`'s `#label-video { height: 56px; }` / `.timeline-row[data-row="video"]` selectors keep matching.

- [ ] **Step 1: Change the label text**

In `static/index.html`, find this line (line 102):

```html
            <div class="row-label" id="label-video">VIDEO</div>
```

Replace it with:

```html
            <div class="row-label" id="label-video">MAIN</div>
```

Change **only** the text node. Do not touch the `id`, the `class`, or the `data-row="video"` attribute on the matching `<div class="timeline-row" data-row="video">` further down — those are the keys `static/timeline.js` and `static/css/components/timeline.css` use.

- [ ] **Step 2: Verify in the browser**

Start the preview server with the `reels-editor` config from `.claude/launch.json`. Open the editor, create a **new throwaway project** from the picker, and import any video so the main row has content.

Expected: the timeline's row-label column reads `CAPTIONS` / `MAIN` / `AUDIO` top-to-bottom (rows that have no content stay collapsed). The main row still shows clip blocks with filmstrip thumbnails at the same 56px height as before. No console errors.

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: rename timeline VIDEO row label to MAIN"
```

---

### Task 2: New AUDIO panel holding the auto-slice flow, replacing the AUTO SLICE rail entry

**Files:**
- Create: `static/panel-audio-track.js`
- Modify: `static/index.html` (delete the `#panel-auto-slice` section, add `#panel-audio-track`, swap the script tag)
- Modify: `static/panel-nav.js` (`showPanel` list, `PANEL_NAV_ITEMS`, `openAutoSlicePanel` → `openAudioTrackPanel`, `PANEL_NAV_HANDLERS`)
- Modify: `static/editor.js:93` (`onSelectAudio`)

**Interfaces:**
- Consumes: `window.AutoSlicePanel.render()` (`static/panel-auto-slice.js`, unchanged), `window.UI.tabBar(container, tabs, activeValue, onSelect)`, and the call-time globals `ensureCaptionTrack()` (`static/panel-captions.js`), `selected`, `renderTimeline()`.
- Produces:
  - `window.AudioTrackPanel.render()` — no args, returns nothing. Shows the panel's main view (hiding any drill-down), ensures a caption track exists, and renders the panel's contents.
  - `openAudioTrackPanel()` — global in `static/panel-nav.js`; sets `selected = { type: "audio-track" }`, calls `showPanel("audio-track")`, `AudioTrackPanel.render()`, `renderTimeline()`.
  - The DOM ids `#panel-audio-track`, `#panel-audio-track-main`, `#audio-track-tab-bar`, `#audio-track-auto-body` — Tasks 3 and 4 append into `#audio-track-auto-body` and add a sibling drill-down inside `#panel-audio-track`.

- [ ] **Step 1: Move the auto-slice markup into a new AUDIO panel**

In `static/index.html`, delete the entire `#panel-auto-slice` section (lines 590–619, from `<div id="panel-auto-slice" class="context-panel" hidden>` through its closing `</div>`) and put this in its place. The three `auto-slice-*` view divs are moved **verbatim** — same ids, same classes, same inline SVG — so `static/panel-auto-slice.js` and `static/css/components/auto-slice-panel.css` keep working untouched:

```html
      <div id="panel-audio-track" class="context-panel" hidden>
        <div id="panel-audio-track-main">
          <div class="style-panel-header">AUDIO</div>

          <div id="audio-track-tab-bar"></div>

          <div id="audio-track-auto-body">
            <div class="style-group-label">AUTO SILENCE</div>

            <div id="auto-slice-idle" class="style-group">
              <p class="auto-slice-hint">Detect silence and filler words (um, uh…) and remove them from the timeline.</p>
              <p id="auto-slice-no-transcript-hint" class="auto-slice-hint" hidden>No transcript yet — only silence will be detected. Transcribe captions first (CAPTIONS panel) to also catch filler words.</p>
              <button id="auto-slice-detect-btn" type="button" class="panel-button col-8"><span class="icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/></svg></span><span class="label">Detect Silence &amp; Filler Words</span></button>
            </div>

            <div id="auto-slice-results" hidden>
              <div id="auto-slice-summary" class="auto-slice-summary"></div>
              <ul id="auto-slice-list" class="auto-slice-list"></ul>
              <div class="style-group">
                <button id="auto-slice-continue" type="button" class="panel-button col-8">Continue</button>
              </div>
              <div class="style-group">
                <button id="auto-slice-redetect" type="button" class="panel-button col-8">Re-detect</button>
              </div>
            </div>

            <div id="auto-slice-confirm" hidden>
              <p id="auto-slice-confirm-summary" class="auto-slice-hint"></p>
              <div class="style-group">
                <button id="auto-slice-confirm-apply" type="button" class="panel-button panel-button-danger col-8">Confirm &amp; Apply</button>
              </div>
              <div class="style-group">
                <button id="auto-slice-back" type="button" class="panel-button col-8">Back</button>
              </div>
            </div>
          </div>
        </div>
      </div>
```

The `#panel-audio` (ADD MUSIC) section immediately above it is **not** touched.

- [ ] **Step 2: Create the panel orchestrator**

Create `static/panel-audio-track.js`:

```js
// AUDIO context-panel section: the timeline's audio track. A single "Auto" tab holds the two
// audio-derived automations — AUTO CAPTION (language + transcribe) and AUTO SILENCE (detect
// silence/filler words and cut them out). Owns the tab bar and delegates rendering to
// panel-auto-slice.js. Exposes window.AudioTrackPanel.render().
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  // Lucide "sparkles".
  const TAB_ICON_AUTO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';

  // One tab today. The bar exists so adding a second tab later is a pure content change.
  const AUDIO_TRACK_TABS = [{ value: "auto", icon: TAB_ICON_AUTO, label: "Auto" }];
  const audioTrackTabPanes = { auto: [document.getElementById("audio-track-auto-body")] };
  let activeAudioTrackTab = "auto";

  function showAudioTrackTab(value) {
    activeAudioTrackTab = value;
    Object.entries(audioTrackTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
  }

  UI.tabBar(document.getElementById("audio-track-tab-bar"), AUDIO_TRACK_TABS, activeAudioTrackTab, showAudioTrackTab);
  showAudioTrackTab(activeAudioTrackTab);

  function render() {
    document.getElementById("panel-audio-track-main").hidden = false;
    ensureCaptionTrack();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
```

- [ ] **Step 3: Swap the script tag**

In `static/index.html`, replace line 919:

```html
<script src="/static/panel-auto-slice.js"></script>
```

with:

```html
<script src="/static/panel-auto-slice.js"></script>
<script src="/static/panel-audio-track.js"></script>
```

`panel-audio-track.js` must load **after** `panel-auto-slice.js` and after `ui-tab-bar.js`; both are already earlier in the file.

- [ ] **Step 4: Swap the icon-rail entry**

In `static/panel-nav.js`, replace the `auto-slice` entry in `PANEL_NAV_ITEMS` (lines 83–87) with an `AUTO` entry in the same slot — directly after the `audio` entry:

```js
  {
    value: "audio-track",
    label: "AUTO",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>`,
  },
```

The `audio` entry above it (label `AUDIO`, opening `#panel-audio` for music import) is left exactly as it is. The new entry is labelled `AUTO`, **not** `AUDIO` — the rail already has an `AUDIO` entry and a duplicate label would be ambiguous. The panel it opens is still headed `AUDIO`, matching the timeline row.

- [ ] **Step 5: Update the panel show/hide list and handlers**

In `static/panel-nav.js`, in `showPanel()` (line 13), replace `"auto-slice"` with `"audio-track"` in the section-id array:

```js
  ["files", "video", "text", "captions", "video-box", "image-box", "settings", "export", "projects", "audio", "audio-track"].forEach((t) => {
```

Replace the whole `openAutoSlicePanel` function (lines 154–159) with:

```js
function openAudioTrackPanel() {
  selected = { type: "audio-track" };
  showPanel("audio-track");
  AudioTrackPanel.render();
  renderTimeline();
}
```

And in `PANEL_NAV_HANDLERS` (line 213), replace the `"auto-slice": openAutoSlicePanel` entry with `"audio-track": openAudioTrackPanel`:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, "image-box": openImageBoxPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel, "audio-track": openAudioTrackPanel };
```

Grep the whole `static/` directory for `auto-slice` afterwards: the only remaining hits must be inside `static/panel-auto-slice.js`, `static/css/components/auto-slice-panel.css`, and the `auto-slice-*` element ids in `static/index.html`. There must be **no** remaining reference to `openAutoSlicePanel` or `panel-auto-slice` as a panel id.

- [ ] **Step 6: Route the timeline AUDIO row click to the new panel**

In `static/editor.js`, change line 93 inside `renderTimeline()`:

```js
    { onAddClip: () => importMedia(), onSelectAudio: () => openAudioTrackPanel() });
```

Leave `static/panel-media.js:165`'s `openAudioPanel()` call alone — that is the FILES panel's audio-row plus icon setting `Project.music`, and it must still open the music panel.

- [ ] **Step 7: Verify in the browser**

Restart/reload the preview. Create a **new throwaway project**, import a video with audio, and add it to the timeline.

Expected:
1. The icon rail shows `… IMAGE / AUDIO / AUTO / SETTINGS / EXPORT` — `AUTO SLICE` is gone.
2. Clicking the rail's `AUTO` opens a panel headed `AUDIO` with one tab button and an `AUTO SILENCE` group containing the "Detect Silence & Filler Words" button.
3. Clicking the timeline's AUDIO row opens that same panel — **not** the music panel.
4. Clicking the rail's `AUDIO` still opens the music panel with its `+ ADD MUSIC` button, and importing music still works.
5. `Detect Silence & Filler Words` → results list with checkboxes → `Continue` → `Confirm & Apply` still cuts ranges out of the timeline.
6. No console errors on load or on any of the above.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/panel-audio-track.js static/panel-nav.js static/editor.js
git commit -m "feat: dedicated AUDIO panel for the timeline audio row

Moves the auto-slice flow into a new #panel-audio-track section under a
single Auto tab, replaces the AUTO SLICE icon-rail entry with AUDIO, and
routes the timeline AUDIO row click there instead of to music import."
```

---

### Task 3: Move the transcription Language row into the AUDIO panel

**Files:**
- Create: `static/audio-panel-language.js`
- Delete: `static/caption-panel-language.js`
- Modify: `static/index.html` (move the language row + drill-down markup, swap the script tag)
- Modify: `static/panel-captions.js` (drop the language render + drill-down hide)
- Modify: `static/panel-audio-track.js` (call the new renderer)

**Interfaces:**
- Consumes: `window.AudioTrackPanel.render()` from Task 2, plus the call-time globals `AVAILABLE_LANGUAGES` (`static/editor.js:10`), `ensureCaptionTrack()` (`static/panel-captions.js`), `saveProject()`, and the helpers `UI.settingsRow`, `UI.subPanelHeader`, `UI.listRow`.
- Produces: `window.AudioTrackPanel.renderLanguage()` — no args, returns nothing. Creates the settings row on first call and updates its value text on later calls. Adds the DOM ids `#audio-language-row`, `#panel-audio-track-language`, `#audio-language-subpanel-header`, `#audio-language-list`.

- [ ] **Step 1: Add the language markup to the AUDIO panel**

In `static/index.html`, inside `#audio-track-auto-body`, insert an `AUTO CAPTION` group **above** the existing `AUTO SILENCE` label:

```html
          <div id="audio-track-auto-body">
            <div class="style-group-label">AUTO CAPTION</div>

            <div class="style-group">
              <div id="audio-language-row" class="col-8"></div>
            </div>

            <div class="style-group-label">AUTO SILENCE</div>
```

Then add the drill-down subpanel as a sibling of `#panel-audio-track-main`, immediately before `#panel-audio-track`'s closing `</div>`:

```html
        <div id="panel-audio-track-language" hidden>
          <div id="audio-language-subpanel-header"></div>
          <ul id="audio-language-list" class="font-list"></ul>
        </div>
```

- [ ] **Step 2: Remove the language markup from the CAPTIONS panel**

In `static/index.html`, delete this block from inside `#caption-words-body` (lines 341–343):

```html
            <div class="style-group">
              <div id="caption-language-row" class="col-8"></div>
            </div>
```

And delete the drill-down subpanel (lines 419–422):

```html
        <div id="panel-captions-language" hidden>
          <div id="caption-language-subpanel-header"></div>
          <ul id="caption-language-list" class="font-list"></ul>
        </div>
```

- [ ] **Step 3: Create the new language module**

Create `static/audio-panel-language.js` — the same settings-row + drill-down implementation as the deleted `caption-panel-language.js`, still writing `CaptionTrack.language` (the data model is unchanged; only the panel it renders into moved):

```js
// AUDIO panel, Auto tab: the language passed to faster-whisper when transcribing
// (CaptionTrack.language, "" = auto-detect). Settings-row + drill-down subpanel, same pattern as
// caption-panel-font-family.js. Exposes window.AudioTrackPanel.renderLanguage(). Reaches into
// editor.js's project/saveProject/ensureCaptionTrack/AVAILABLE_LANGUAGES globals.
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  let languageRowSetValue = null;

  function openLanguagePanel() {
    renderLanguageList();
    document.getElementById("panel-audio-track-main").hidden = true;
    document.getElementById("panel-audio-track-language").hidden = false;
  }

  function closeLanguagePanel() {
    document.getElementById("panel-audio-track-language").hidden = true;
    document.getElementById("panel-audio-track-main").hidden = false;
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
    const listEl = document.getElementById("audio-language-list");
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

  UI.subPanelHeader(document.getElementById("audio-language-subpanel-header"), { title: "Language", onBack: closeLanguagePanel });

  function renderLanguage() {
    const track = ensureCaptionTrack();
    const label = labelFor(track.language);
    if (languageRowSetValue) {
      languageRowSetValue(label);
    } else {
      languageRowSetValue = UI.settingsRow(document.getElementById("audio-language-row"), {
        label: "Language", value: label,
        onClick: openLanguagePanel,
      });
    }
  }

  window.AudioTrackPanel.renderLanguage = renderLanguage;
})();
```

Then delete `static/caption-panel-language.js`.

- [ ] **Step 4: Swap the script tags**

In `static/index.html`, delete line 882:

```html
<script src="/static/caption-panel-language.js"></script>
```

and add the replacement immediately after the `panel-audio-track.js` tag added in Task 2:

```html
<script src="/static/panel-audio-track.js"></script>
<script src="/static/audio-panel-language.js"></script>
```

Both files use the `window.AudioTrackPanel = window.AudioTrackPanel || {}` guard, so either load order is safe — but `audio-panel-language.js` runs `UI.subPanelHeader` at module level and so must load after `ui-sub-panel-header.js`, which is already earlier in the file.

- [ ] **Step 5: Drop the language wiring from the CAPTIONS panel**

In `static/panel-captions.js`'s `renderCaptionPanel()`, delete line 59:

```js
  document.getElementById("panel-captions-language").hidden = true;
```

and delete line 65:

```js
  CaptionPanel.renderLanguage();
```

Leave every other line of `renderCaptionPanel()` alone.

- [ ] **Step 6: Render the language row from the AUDIO panel**

In `static/panel-audio-track.js`, add the call to `render()`, and reset the drill-down so re-opening the panel never lands on a stale sub-view:

```js
  function render() {
    document.getElementById("panel-audio-track-language").hidden = true;
    document.getElementById("panel-audio-track-main").hidden = false;
    ensureCaptionTrack();
    AudioTrackPanel.renderLanguage();
    AutoSlicePanel.render();
  }
```

- [ ] **Step 7: Verify in the browser**

Reload the preview. Create a **new throwaway project** and import a video.

Expected:
1. The AUDIO panel shows `AUTO CAPTION` → a `Language` settings row → `AUTO SILENCE` → the detect button.
2. Clicking the `Language` row opens the drill-down list with a back arrow; the main view is hidden.
3. Picking a language returns to the main view with the row's value updated, and the save indicator flashes `Saving… / Saved`.
4. Re-opening the panel (rail `AUDIO`, then another panel, then `AUDIO` again) always shows the main view, never the language list.
5. The CAPTIONS panel's Closed-captions tab no longer shows a Language row, still shows the `Auto-caption` button and the transcript section, and opens with no console errors.
6. Grep `static/` for `caption-language` and `panel-captions-language`: zero hits.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/audio-panel-language.js static/panel-audio-track.js static/panel-captions.js
git rm static/caption-panel-language.js
git commit -m "feat: move transcription Language row into the AUDIO panel"
```

---

### Task 4: Move the Auto-caption button into the AUDIO panel

**Files:**
- Create: `static/audio-panel-auto-caption.js`
- Modify: `static/index.html` (move the button + error line, add the script tag)
- Modify: `static/panel-captions.js` (remove `runAutoCaption` and its listener and the error reset)
- Modify: `static/panel-auto-slice.js` (update the no-transcript hint's wording)

**Interfaces:**
- Consumes: `window.AudioTrackPanel.render()` (Task 2), and the call-time globals `project`, `ensureCaptionTrack()`, `renderCaptionPanel()`, `renderTimeline()`.
- Produces: the global `async function runAutoCaption()` — no args, returns a promise resolving to nothing. Same name and signature as the version being deleted from `panel-captions.js`, so `static/clip-sequence.js:91` and `static/editor.js:308` keep working with no change. Adds the DOM ids `#audio-auto-caption-btn`, `#audio-transcribe-error`.

- [ ] **Step 1: Add the button markup to the AUDIO panel**

In `static/index.html`, inside `#audio-track-auto-body`, add the button and error line directly below the `#audio-language-row` group added in Task 3:

```html
            <div class="style-group-label">AUTO CAPTION</div>

            <div class="style-group">
              <div id="audio-language-row" class="col-8"></div>
            </div>

            <div class="style-group">
              <button id="audio-auto-caption-btn" class="panel-button col-8" type="button"><span class="icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/></svg></span><span class="label">Auto-caption</span></button>
              <p id="audio-transcribe-error" class="context-panel-name col-8 caption-transcribe-error" hidden></p>
            </div>

            <div class="style-group-label">AUTO SILENCE</div>
```

The error paragraph keeps the existing `caption-transcribe-error` CSS class — that class lives in `static/css/components/style-panel.css` and is not scoped to `#panel-captions`, so it styles the element in its new home unchanged.

- [ ] **Step 2: Remove the button markup from the CAPTIONS panel**

In `static/index.html`, delete this whole block from inside `#caption-words-body` (the `#caption-auto-btn` group, lines 345–348 before Task 3's edits shifted them):

```html
            <div class="style-group">
              <button id="caption-auto-btn" class="panel-button col-8" type="button">…</button>
              <p id="caption-transcribe-error" class="context-panel-name col-8 caption-transcribe-error" hidden></p>
            </div>
```

`#caption-words-body` must be left holding only `#caption-transcript-section` (the `TRANSCRIPT` label + `#caption-words-list`).

- [ ] **Step 3: Create the auto-caption module**

Create `static/audio-panel-auto-caption.js` — the `runAutoCaption()` body moved out of `panel-captions.js`, with the error element id updated and an extra `AudioTrackPanel.render()` so the panel it now lives in refreshes too:

```js
// AUDIO panel, Auto tab: the Auto-caption button — runs transcription and merges the result into
// `project`. Exposes the global runAutoCaption(), also called by clip-sequence.js and editor.js
// when an audible clip is added (auto-caption-on-clip-add). Reaches into editor.js's
// project/renderTimeline and panel-captions.js's ensureCaptionTrack/renderCaptionPanel globals.

// The button's disabled/label state only has a visible effect when the AUDIO panel happens to be
// open; otherwise this just quietly updates captions/timeline once done, same "background
// enhancement, no loading UI" pattern as thumbnail/waveform/filmstrip fetches elsewhere in this
// app. Failures (e.g. 503 when the `ml` extra isn't installed) surface in #audio-transcribe-error.
async function runAutoCaption() {
  ensureCaptionTrack();
  const btn = document.getElementById("audio-auto-caption-btn");
  const label = btn.querySelector(".label");
  const errorEl = document.getElementById("audio-transcribe-error");
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
    AudioTrackPanel.render();     // refreshes this panel's no-transcript hint
    renderTimeline();
  } catch {
    errorEl.textContent = "Transcription failed: could not reach the server.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
}

document.getElementById("audio-auto-caption-btn").addEventListener("click", runAutoCaption);
```

- [ ] **Step 4: Add the script tag**

In `static/index.html`, add the new tag after `audio-panel-language.js`:

```html
<script src="/static/audio-panel-language.js"></script>
<script src="/static/audio-panel-auto-caption.js"></script>
```

It must load **after** `panel-audio-track.js` (it calls `AudioTrackPanel.render()`) and **before** `editor.js` (whose cold-start IIFE can reach `runAutoCaption`). Both hold with this placement.

- [ ] **Step 5: Remove the auto-caption wiring from the CAPTIONS panel**

In `static/panel-captions.js`:

Delete line 63 from `renderCaptionPanel()`:

```js
  document.getElementById("caption-transcribe-error").hidden = true;
```

Delete the entire `runAutoCaption()` function (lines 114–147, including its leading comment block) and the listener on line 149:

```js
document.getElementById("caption-auto-btn").addEventListener("click", runAutoCaption);
```

Then update the file's header comment — it currently claims ownership of `the #caption-auto-btn transcribe listener`, which is no longer true:

```js
// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab groups the FONT + HIGHLIGHT bodies together).
// Plain globals shared with caption-panel-*.js; reaches into editor.js's
// `project`/`saveProject`/`renderTimeline` globals. Transcription itself (the Auto-caption button
// and the Language row) lives in the AUDIO panel — see static/audio-panel-auto-caption.js.
```

- [ ] **Step 6: Update the auto-slice hint wording**

In `static/index.html`, the `#auto-slice-no-transcript-hint` paragraph still points at the CAPTIONS panel, but Auto-caption now sits directly above it in the same tab. Replace its text:

```html
              <p id="auto-slice-no-transcript-hint" class="auto-slice-hint" hidden>No transcript yet — only silence will be detected. Run Auto-caption above to also catch filler words.</p>
```

`static/panel-auto-slice.js` only toggles this element's `hidden` flag, so no JS change is needed there — but update its own header comment's mention of the flow only if it names the CAPTIONS panel (it does not; leave the file otherwise untouched).

- [ ] **Step 7: Verify in the browser**

Reload the preview. Create a **new throwaway project** and import a video that has speech.

Expected:
1. The AUDIO panel reads `AUTO CAPTION` → Language row → `Auto-caption` button → `AUTO SILENCE` → hint → detect button, top to bottom.
2. Clicking `Auto-caption` disables the button and swaps its label to `Transcribing…`, then re-enables it. On success, the timeline CAPTIONS row fills with word blocks and the CAPTIONS panel's Closed-captions tab lists the transcript.
3. If transcription fails (e.g. the `ml` extra is not installed, giving a 503), the red error text appears under the button inside the AUDIO panel — not in CAPTIONS.
4. After transcribing, the AUDIO panel's `No transcript yet…` hint is gone; `Detect Silence & Filler Words` now returns both `SILENCE` and `FILLER` rows.
5. Adding another audible clip to the timeline still auto-transcribes (the `clip-sequence.js` / `editor.js` call sites) with no console error about a missing element.
6. The CAPTIONS panel's Closed-captions tab shows only the `TRANSCRIPT` label and word list.
7. Grep `static/` for `caption-auto-btn` and `caption-transcribe-error`: the only hit is the `caption-transcribe-error` **CSS class** in `static/css/components/style-panel.css` and on the moved `#audio-transcribe-error` element. No id references remain.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/audio-panel-auto-caption.js static/panel-captions.js
git commit -m "feat: move the Auto-caption button into the AUDIO panel"
```

---

### Task 5: Update the codebase map and run the full test suite

**Files:**
- Modify: `CLAUDE.md` (File structure tree + Inventory)

**Interfaces:**
- Consumes: the finished state of Tasks 1–4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the File structure tree**

In `CLAUDE.md`'s `static/` tree, make these edits:

- Add `panel-audio-track.js` — `# AUDIO context-panel section (added 2026-07-29, audio panel): the timeline's audio track — one "Auto" tab (UI.tabBar) holding AUTO CAPTION (language row + Auto-caption button) and AUTO SILENCE (the auto-slice flow); window.AudioTrackPanel.render(). Opened by the icon rail's AUTO entry (which replaced AUTO SLICE) and by clicking the timeline's AUDIO row — distinct from the rail's AUDIO entry, which still opens #panel-audio for music import.`
- Add `audio-panel-language.js` — `# AUDIO panel Auto tab: transcription-language settings row + drill-down, writing CaptionTrack.language (moved from caption-panel-language.js 2026-07-29); window.AudioTrackPanel.renderLanguage()`
- Add `audio-panel-auto-caption.js` — `# AUDIO panel Auto tab: the Auto-caption button + the global runAutoCaption() (moved out of panel-captions.js 2026-07-29); also called by clip-sequence.js/editor.js on audible-clip add`
- Remove the `caption-panel-language.js` line.
- Update the `panel-auto-slice.js` line to note its markup now lives inside `#panel-audio-track`, not a standalone `#panel-auto-slice` section, and that it is reached through the AUDIO panel.
- Update the `index.html` entry: the `#panel-auto-slice` section is gone, `#panel-audio-track` is new, and `#panel-audio` (ADD MUSIC) is unchanged.
- Update the `timeline.js` entry: the main clip row's label reads `MAIN` (the row key/id stay `video`/`label-video`).
- Update the `panel-nav.js` entry: the `auto-slice` rail entry is now `audio-track` (label `AUTO`) opening `#panel-audio-track` via `openAudioTrackPanel()`.
- Update the `panel-captions.js` entry: it no longer owns `runAutoCaption` or the Language row.

- [ ] **Step 2: Update the Inventory**

In `CLAUDE.md`'s Inventory, under **Captions & transcription**, move the language/auto-caption bullets to reflect their new homes and add a short paragraph to the **Audio** section describing the AUDIO panel:

> **AUDIO panel (timeline audio track).** Added 2026-07-29. `static/panel-audio-track.js` owns `#panel-audio-track` — a single `Auto` tab (`UI.tabBar`) holding the two audio-derived automations: AUTO CAPTION (`static/audio-panel-language.js`'s language settings row + `static/audio-panel-auto-caption.js`'s `runAutoCaption()`) and AUTO SILENCE (`static/panel-auto-slice.js`'s detect → approve → apply flow, whose markup moved here from the removed standalone `#panel-auto-slice` section). Reached from the icon rail's `AUTO` entry (which replaced `AUTO SLICE`) and by clicking the timeline's AUDIO row (`static/editor.js`'s `onSelectAudio`). Distinct from the rail's `AUDIO` entry, which still opens `#panel-audio` for background-music import — the new entry is labelled `AUTO` precisely to avoid a duplicate `AUDIO` label in the rail.

- [ ] **Step 3: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`

Expected: PASS, with the same test count as before this branch — no Python was touched, so any failure here is a pre-existing condition on `main` and must be reported, not "fixed" by editing tests.

- [ ] **Step 4: Full manual smoke pass**

With the preview running and a **new throwaway project**, confirm end to end:

1. Timeline main row label reads `MAIN`.
2. Rail: `AUTO SLICE` is gone; `AUTO` is present and opens the new panel.
3. Timeline AUDIO row click opens the new panel, not music import.
4. Rail `AUDIO` still opens music import; adding, muting, and removing music all still work.
5. Language row → drill-down → select → back, and the choice persists across a page reload.
6. `Auto-caption` transcribes; the CAPTIONS transcript list fills; the timeline CAPTIONS row appears.
7. `Detect Silence & Filler Words` → `Continue` → `Confirm & Apply` cuts ranges from the timeline.
8. Every CAPTIONS tab (Closed captions / Filler words / Style / Design / Box) renders with no console errors.
9. Undo (Ctrl+Z) after an apply still restores, and `reRenderAfterRestore` re-opens the AUDIO panel rather than falling back to FILES.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for the AUDIO panel"
```
