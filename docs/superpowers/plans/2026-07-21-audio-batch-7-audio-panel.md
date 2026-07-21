# Audio Batch 7: AUDIO Panel + Music Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `#panel-audio` context-panel section (AUDIO entry in the left icon rail, `selected.type = "audio"`) lets the user import one background-music file (via the native file picker, now filterable to audio types), and edit/replace/remove it. Clicking the timeline AUDIO row also opens this panel.

**Architecture:** `app/media.py`'s `pick_file()` gains a `kind` parameter (`"video"` | `"audio"`) selecting the dialog's file-type filter and title, exposed through `/api/pick-file?kind=...` and `Api.pickFile(kind)`. A new `static/panel-audio.js` (`window.AudioPanel`) follows the exact `panel-video-box.js` add-picker/detail-view shape: an "ADD MUSIC" button when `project.music` is unset, or a detail view (name, volume, mute, replace, remove) when it is. Wired into `editor.js`'s existing `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS`/`showPanel` pattern exactly like every other context-panel section, plus one new `onSelectAudio` action passed to `Timeline.render` so clicking the AUDIO row opens the panel.

**Tech Stack:** Vanilla JS, existing `UI.numberField`/`UI.button` components, existing native-file-picker/probe flow.

## Global Constraints

**Requires Batch 1** (`MediaItem.kind`, `MusicTrack`/`Project.music`) **merged first.** Batch 5 (peaks route) is not required but pairs naturally — once music is imported here, Batch 5's waveform row picks it up automatically since it already reads `project.music`.

- Importing a music file: probe it (`Api.probeMedia`, existing), push a `MediaItem` with `kind: "audio"` into `project.media_library`, create the `MusicTrack` on `project.music`. If a `MusicTrack` already exists, "ADD MUSIC" isn't shown — "Replace" swaps `media_id` (and re-probes), "Remove" clears `project.music` (leaves the `MediaItem` in the library, mirroring how removing a video clip doesn't delete its `MediaItem` — see `VideoPanel.deleteClip`'s doc comment in `static/panel-video.js`).
- One music track only (v1) — no "add another" affordance once one exists.
- `pick_file`'s existing video-picker behavior (default `kind="video"`) must be unchanged — every existing call site (`Api.pickFile()` with no argument) keeps working exactly as before.

---

### Task 1: `pick_file` accepts an audio filter

**Files:**
- Modify: `app/media.py:64-76` (`pick_file`)
- Test: `tests/test_media.py`

**Interfaces:**
- Produces: `_filedialog_options(kind: str) -> tuple[str, list[tuple[str, str]]]` (pure, new — testable without tkinter), `pick_file(kind: str = "video") -> str | None` (kind now optional, defaults preserve today's behavior).

- [ ] **Step 1: Write the failing test for the pure options helper**

Add to `tests/test_media.py`:

```python
from app.media import _filedialog_options

def test_filedialog_options_video_default():
    title, filetypes = _filedialog_options("video")
    assert title == "Choose a clip"
    assert filetypes[0] == ("Video files", "*.mp4 *.mov *.mkv")

def test_filedialog_options_audio():
    title, filetypes = _filedialog_options("audio")
    assert title == "Choose a music file"
    assert filetypes[0] == ("Audio files", "*.mp3 *.wav *.m4a *.aac *.ogg *.flac")

def test_filedialog_options_unknown_kind_falls_back_to_video():
    title, filetypes = _filedialog_options("bogus")
    assert title == "Choose a clip"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -k filedialog_options -v`
Expected: FAIL — `_filedialog_options` doesn't exist yet.

- [ ] **Step 3: Extract the pure helper and use it in `pick_file`**

In `app/media.py`, replace `pick_file` (currently lines 64-76):

```python
def _filedialog_options(kind: str) -> tuple[str, list[tuple[str, str]]]:
    """Pure: dialog title + filetypes for the native file picker, by import kind.
    Unknown kind falls back to the video picker (today's only behavior, preserved)."""
    if kind == "audio":
        return "Choose a music file", [("Audio files", "*.mp3 *.wav *.m4a *.aac *.ogg *.flac"), ("All files", "*.*")]
    return "Choose a clip", [("Video files", "*.mp4 *.mov *.mkv"), ("All files", "*.*")]

def pick_file(kind: str = "video") -> str | None:
    # Must stay a sync `def` route: FastAPI dispatches sync handlers to a worker thread,
    # so this blocking Tk dialog runs off the main thread. Switching the /api/pick-file
    # route to `async def` would run this on the event loop and freeze the server.
    title, filetypes = _filedialog_options(kind)
    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(title=title, filetypes=filetypes)
    root.destroy()
    return path or None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -k filedialog_options -v`
Expected: PASS

- [ ] **Step 5: Run the full media test file**

Run: `.venv/Scripts/python -m pytest tests/test_media.py -v`
Expected: All PASS (no regressions).

- [ ] **Step 6: Update the file header comment**

In `app/media.py`, extend the header comment (currently line 1-2) to mention the kind parameter:

```python
# Media helpers: ffprobe duration probing, audio stream detection, safe local file serving, native file picker.
# Exposes ffprobe_cmd, probe_duration, has_audio_stream, media_response, run_export, pick_file
# (kind="video"|"audio" selects the dialog's file-type filter for video clips vs. music imports).
# Depends on ffprobe on PATH and tkinter.
```

- [ ] **Step 7: Commit**

```bash
git add app/media.py tests/test_media.py
git commit -m "feat: pick_file supports an audio file-type filter for music import"
```

---

### Task 2: `/api/pick-file` route accepts `kind`, `Api.pickFile(kind)`

**Files:**
- Modify: `app/main.py:79-81` (`pick_file` route)
- Modify: `static/api-pick-file.js`
- Test: `tests/test_main.py`

**Interfaces:**
- Produces: route `GET /api/pick-file?kind=video|audio` (default `video`); `window.Api.pickFile(kind = "video") -> Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_main.py`:

```python
def test_pick_file_route_passes_kind_through(monkeypatch):
    from app.main import pick_file as pick_file_route
    captured = {}
    def fake_pick_file(kind="video"):
        captured["kind"] = kind
        return "song.mp3"
    monkeypatch.setattr("app.main.media.pick_file", fake_pick_file)
    result = pick_file_route(kind="audio")
    assert result == {"path": "song.mp3"}
    assert captured["kind"] == "audio"

def test_pick_file_route_defaults_to_video_kind(monkeypatch):
    from app.main import pick_file as pick_file_route
    captured = {}
    def fake_pick_file(kind="video"):
        captured["kind"] = kind
        return None
    monkeypatch.setattr("app.main.media.pick_file", fake_pick_file)
    pick_file_route()
    assert captured["kind"] == "video"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k pick_file_route -v`
Expected: FAIL — the route doesn't accept/forward a `kind` parameter yet.

- [ ] **Step 3: Update the route**

In `app/main.py`, replace the `pick_file` route (currently lines 79-81):

```python
@app.get("/api/pick-file")
def pick_file(kind: str = "video") -> dict:
    return {"path": media.pick_file(kind)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python -m pytest tests/test_main.py -k pick_file_route -v`
Expected: PASS

- [ ] **Step 5: Update `Api.pickFile`**

In `static/api-pick-file.js`:

```javascript
// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.

// Opens a native OS file-open dialog on the server. kind="video" (default) filters to video
// files; kind="audio" filters to music files (mp3/wav/m4a/aac/ogg/flac) for the AUDIO panel's
// music import. Returns the chosen path, or null if cancelled.
window.Api.pickFile = async function pickFile(kind = "video") {
  const res = await fetch(`/api/pick-file?kind=${encodeURIComponent(kind)}`);
  const { path } = await res.json();
  return path;
};
```

- [ ] **Step 6: Run the full pytest suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS. (Every existing `Api.pickFile()` call site in `static/clip-sequence.js`/`static/panel-media.js` keeps working unchanged since `kind` defaults to `"video"`.)

- [ ] **Step 7: Commit**

```bash
git add app/main.py static/api-pick-file.js tests/test_main.py
git commit -m "feat: pick-file route and Api.pickFile support a kind filter"
```

---

### Task 3: `#panel-audio` markup + panel-nav entry

**Files:**
- Modify: `static/index.html` (add `#panel-audio` section near `#panel-video-box`; add `"audio"` to `showPanel`'s panel-id list — this lives in `static/editor.js`, see Task 4)

- [ ] **Step 1: Add the `#panel-audio` section**

In `static/index.html`, after the closing `</div>` of `#panel-video-box` (currently ends at line 433):

```html
      <div id="panel-audio" class="context-panel" hidden>
        <div class="style-panel-header">AUDIO</div>
        <div id="audio-empty-state" class="style-group">
          <button id="audio-add-music" type="button" class="col-8"><span class="icon">+</span><span class="label">ADD MUSIC</span></button>
        </div>
        <div id="audio-detail" hidden>
          <div id="audio-music-name" class="context-panel-name"></div>

          <div class="style-group-label">VOLUME</div>
          <div class="style-group">
            <div class="style-row">
              <div id="audio-volume-field" class="col-6"></div>
              <button id="audio-mute-btn" type="button" class="col-2 button button-icon" title="Mute music">
                <svg class="icon-volume" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>
                <svg class="icon-volume-muted icon-hidden" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>
              </button>
            </div>
          </div>

          <div class="style-group">
            <button id="audio-replace" class="col-8" type="button">Replace music</button>
          </div>
          <div class="style-group">
            <button id="audio-remove" class="col-8" type="button">Remove music</button>
          </div>
        </div>
      </div>
```

(Same Lucide `volume-2`/`volume-x` paths as Batch 6 — verify against lucide.dev before committing, same as noted there.)

- [ ] **Step 2: Commit**

```bash
git add static/index.html
git commit -m "feat: add #panel-audio markup"
```

---

### Task 4: `static/panel-audio.js` + wire into `editor.js`'s panel-nav

**Files:**
- Create: `static/panel-audio.js`
- Modify: `static/index.html` (script tag)
- Modify: `static/editor.js` (`PANEL_NAV_ITEMS`, `PANEL_NAV_HANDLERS`, `showPanel`, `renderTimeline`)
- Modify: `static/timeline.js` (wire an `onSelectAudio` click on the AUDIO row)

**Interfaces:**
- Consumes: `Api.pickFile("audio")`, `Api.probeMedia(path)` (existing), `saveProject()`/`Preview.load(project)`/`renderTimeline()` (existing globals in `editor.js`, same as every other panel-*.js file).
- Produces: `window.AudioPanel.render()`.

- [ ] **Step 1: Create `static/panel-audio.js`**

```javascript
// AUDIO context-panel section: import a single background-music MediaItem (kind="audio") onto
// Project.music, edit its volume/mute, replace or remove it. Exposes window.AudioPanel.render().
// One music track only (v1) — mirrors panel-video-box.js's add-picker/detail-view shape but with
// no picker list (a single "ADD MUSIC" button goes straight through the native file picker,
// since there's no existing media-library browsing step for music the way video boxes reuse
// already-imported clips).
window.AudioPanel = window.AudioPanel || {};

(() => {
  async function importMusicFile() {
    const path = await Api.pickFile("audio");
    if (!path) return null;
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) { alert("probe failed"); return null; }
    const { duration, has_audio } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind: "audio" });
    return mediaId;
  }

  async function addMusic() {
    const mediaId = await importMusicFile();
    if (!mediaId) return;
    project.music = { id: crypto.randomUUID().replaceAll("-", ""), media_id: mediaId, volume: 0.3, muted: false };
    await saveProject();
    renderTimeline();
    render();
  }

  async function replaceMusic() {
    const mediaId = await importMusicFile();
    if (!mediaId) return;
    project.music.media_id = mediaId;
    await saveProject();
    renderTimeline();
    render();
  }

  async function removeMusic() {
    project.music = null;
    await saveProject();
    renderTimeline();
    render();
  }

  function render() {
    const music = project.music;
    document.getElementById("audio-empty-state").hidden = !!music;
    document.getElementById("audio-detail").hidden = !music;
    document.getElementById("audio-add-music").onclick = addMusic;
    if (!music) return;

    const media = project.media_library.find((m) => m.id === music.media_id);
    document.getElementById("audio-music-name").textContent =
      (media && (media.name || media.file_path.split(/[\\/]/).pop())) || "Unknown file";

    UI.numberField(document.getElementById("audio-volume-field"),
      { label: "VOLUME", unit: "%", value: Math.round(music.volume * 100), step: 5, min: 0, max: 200, decimals: 0, span: 6,
        onChange: async (v) => {
          music.volume = Math.max(0, Math.min(2, v / 100));
          await saveProject();
        } });

    const muteBtn = document.getElementById("audio-mute-btn");
    const iconVolume = muteBtn.querySelector(".icon-volume");
    const iconMuted = muteBtn.querySelector(".icon-volume-muted");
    function updateMuteIcon() {
      iconVolume.classList.toggle("icon-hidden", music.muted);
      iconMuted.classList.toggle("icon-hidden", !music.muted);
      muteBtn.setAttribute("aria-pressed", String(!!music.muted));
    }
    updateMuteIcon();
    muteBtn.onclick = async () => {
      music.muted = !music.muted;
      updateMuteIcon();
      await saveProject();
    };

    document.getElementById("audio-replace").onclick = replaceMusic;
    document.getElementById("audio-remove").onclick = removeMusic;
  }

  window.AudioPanel.render = render;
})();
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, insert alongside the other `panel-*.js` tags (e.g. after `<script src="/static/panel-video-box.js"></script>`, currently line 655):

```html
<script src="/static/panel-audio.js"></script>
```

- [ ] **Step 3: Add the AUDIO entry to `PANEL_NAV_ITEMS`**

In `static/editor.js`, add to the `PANEL_NAV_ITEMS` array (currently lines 130-171), e.g. after the `"video-box"` entry:

```javascript
  {
    value: "audio",
    label: "AUDIO",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  },
```

(Lucide `music` icon — verify the path against lucide.dev before committing, same convention as the volume icons.)

- [ ] **Step 4: Add `openAudioPanel` and register it**

In `static/editor.js`, add a new function near `openVideoBoxPanel` (currently lines 206-211):

```javascript
function openAudioPanel() {
  selected = { type: "audio" };
  showPanel("audio");
  AudioPanel.render();
  renderTimeline();
}
```

Update `PANEL_NAV_HANDLERS` (currently line 281):

```javascript
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel };
```

- [ ] **Step 5: Add `"audio"` to `showPanel`'s panel-id list**

In `static/editor.js`, `showPanel(type)` (currently lines 79-86):

```javascript
function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects", "audio"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

- [ ] **Step 6: Pass `onSelectAudio` into `Timeline.render` and wire the AUDIO row's click**

In `static/editor.js`, `renderTimeline()` (currently lines 73-77):

```javascript
function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect,
    { onAddClip: () => addClip(), onAddText: () => addTextBlockAndEdit(), onSelectAudio: () => openAudioPanel() });
}
```

In `static/timeline.js`, `render(project, timelineTime, selected, onSelect, actions = {})` (currently lines 155-216), add a one-time click listener on the AUDIO row's track, right after the existing `renderAudioTrack`/`TimelineAudioRow.render` call:

```javascript
    TimelineAudioRow.render(project, PX_PER_SEC, () => renderTimeline());
    const audioTrack = document.getElementById("row-audio");
    if (!audioTrack.dataset.selectBound) {
      audioTrack.dataset.selectBound = "1";
      audioTrack.addEventListener("click", () => actions.onSelectAudio && actions.onSelectAudio());
    }
```

(`dataset.selectBound` follows the exact same one-time-listener guard already used for `#timeline-scroll`'s scroll listener at `static/timeline.js:170-173` — `render()` runs on every project change, so the listener must only attach once.)

- [ ] **Step 7: Run the full pytest suite (regression check — JS-only change)**

Run: `.venv/Scripts/python -m pytest -q`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add static/panel-audio.js static/index.html static/editor.js static/timeline.js
git commit -m "feat: add AUDIO context-panel section with music import"
```

---

### Task 5: Update the codebase map

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the AUDIO panel to the map**

In `CLAUDE.md`'s file-structure tree and inventory sections, add one-line entries for `static/panel-audio.js`, `static/preview-audio.js` (Batch 4), `static/timeline-audio-row.js`/`static/api-get-media-peaks.js` (Batch 5), `app/waveform.py` (Batch 5), matching the terse style of neighboring entries (e.g. `panel-video-box.js`'s existing one-liner). Note the `#panel-audio` context-panel section in the `index.html` file-structure comment, alongside the other `#panel-*` sections already listed there (`#panel-video-box`, `#panel-layers`, etc.), and the new AUDIO entry in `#panel-nav`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add audio subsystem files to codebase map"
```

---

### Task 6: Manual live-verify on a throwaway project

**Files:** none (manual browser check only)

- [ ] **Step 1:** Open a throwaway project. Click the AUDIO entry in the left icon rail — confirm the panel opens showing "ADD MUSIC".
- [ ] **Step 2:** Click "ADD MUSIC", pick a real audio file from disk (mp3/wav/etc.) via the native dialog — confirm the dialog's file-type filter shows audio extensions, not video. Confirm the panel switches to the detail view showing the file's name.
- [ ] **Step 3:** Click the AUDIO row in the timeline (with some other panel open, e.g. FILES) — confirm it switches to the AUDIO panel.
- [ ] **Step 4:** Adjust VOLUME, toggle mute — confirm preview playback (Batch 4) reflects both immediately, and the timeline waveform (Batch 5, if merged) still renders.
- [ ] **Step 5:** Click "Replace music", pick a different audio file — confirm the detail view updates to the new file's name and playback uses the new file.
- [ ] **Step 6:** Click "Remove music" — confirm the panel reverts to "ADD MUSIC", `project.music` is `null`, and preview/timeline no longer reference music.
- [ ] **Step 7:** Reload the page — confirm the music track (or its absence) persisted correctly.
- [ ] **Step 8:** Report findings; fix before merging if anything fails.

---

## Batch 7 Definition of Done

- [ ] `.venv/Scripts/python -m pytest -q` passes (full suite).
- [ ] Manual live-verify (Task 6) passed on a throwaway project.
- [ ] `CLAUDE.md` reflects every file this batch (and Batches 4-5) added.
- [ ] All changes committed.

This is the last batch of the audio subsystem — after this, the "Audio" backlog item is complete end-to-end (data model, export, preview, real waveforms, and both new panels).
