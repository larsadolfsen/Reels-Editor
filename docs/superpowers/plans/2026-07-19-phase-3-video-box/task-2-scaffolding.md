### Task 2: Frontend scaffolding (markup mount points + nav wiring)

**Status:** not started

**Depends on:** Task 1 (merged)

Per the project's established parallel-task rule, this task pre-creates every shared-file mount point (`static/index.html` markup, `static/editor.js` nav wiring) that Batch 2's tasks need, so those tasks each touch only their own new files with zero further edits to `index.html`/`editor.js`. Batch 2 tasks call into `window.VideoBoxPanel`/`window.LayersPanel`, which don't exist until Tasks 8/9 merge — the calls below are guarded (`if (window.X)`) so the app doesn't hard-crash if loaded mid-batch; full wiring lands in Task 10.

**Files:**
- Modify: `static/index.html`
- Modify: `static/editor.js`

**Interfaces:**
- Consumes: none (pure scaffolding).
- Produces: DOM ids `row-videobox`, `label-videobox`, `panel-video-box` (+ children `video-box-add`, `video-box-picker`, `video-box-picker-list`, `video-box-detail`, `video-box-name`, `video-box-in-field`, `video-box-out-field`, `video-box-start-field`, `video-box-x-field`, `video-box-y-field`, `video-box-width-field`, `video-box-height-field`, `video-box-delete`), `panel-layers` (+ child `layers-list`); script tags for `ui-video-box-drag.js`, `video-box-preview.js`, `panel-video-box.js`, `panel-layers.js`; `editor.js` functions `openVideoBoxPanel()`/`openLayersPanel()`; `PANEL_NAV_ITEMS`/`PANEL_NAV_HANDLERS` entries `"video-box"`/`"layers"`; `showPanel()`'s panel-type list includes `"video-box"`/`"layers"`.

- [ ] **Step 1: Add the VIDEO BOX timeline row markup**

In `static/index.html`, in `#timeline-labels`, add a new label between `#label-captions` and `#label-video`:

```html
            <div class="row-label" id="label-captions">CAPTIONS</div>
            <div class="row-label" id="label-videobox">VIDEO BOX</div>
            <div class="row-label" id="label-video">VIDEO</div>
```

In `#timeline-content`, add a matching row between the captions row and the video row:

```html
              <div class="timeline-row" data-row="captions">
                <div class="row-track" id="row-captions"></div>
              </div>
              <div class="timeline-row" data-row="videobox">
                <div class="row-track" id="row-videobox"></div>
              </div>
              <div class="timeline-row" data-row="video">
                <div class="row-track" id="row-video"></div>
              </div>
```

- [ ] **Step 2: Add the VIDEO BOX and LAYERS context-panel sections**

In `static/index.html`, add these two new `.context-panel` sections inside `#style-panel` (placed after the existing `#panel-projects` section, before `#panel-text`):

```html
      <div id="panel-video-box" class="context-panel" hidden>
        <div class="style-panel-header">VIDEO BOX</div>
        <div class="style-group">
          <button id="video-box-add" type="button"><span class="icon">+</span><span class="label">ADD VIDEO BOX</span></button>
        </div>
        <div id="video-box-picker" hidden>
          <ul id="video-box-picker-list" class="font-list"></ul>
        </div>
        <div id="video-box-detail" hidden>
          <div id="video-box-name" class="context-panel-name"></div>

          <div class="style-group-label">TRIM</div>
          <div class="style-group">
            <div class="style-row">
              <label id="video-box-in-field"></label>
              <label id="video-box-out-field"></label>
            </div>
          </div>

          <div class="style-group-label">TIME</div>
          <div class="style-group">
            <label id="video-box-start-field"></label>
          </div>

          <div class="style-group-label">SIZE &amp; POSITION</div>
          <div class="style-group">
            <div class="style-row">
              <label id="video-box-x-field"></label>
              <label id="video-box-y-field"></label>
            </div>
            <div class="style-row">
              <label id="video-box-width-field"></label>
              <label id="video-box-height-field"></label>
            </div>
          </div>

          <div class="style-group">
            <button id="video-box-delete" type="button">Delete video box</button>
          </div>
        </div>
      </div>

      <div id="panel-layers" class="context-panel" hidden>
        <div class="style-panel-header">LAYERS</div>
        <ul id="layers-list" class="layers-list"></ul>
      </div>
```

- [ ] **Step 3: Add new script tags**

In `static/index.html`, add `<script src="/static/ui-video-box-drag.js"></script>` right after the existing `<script src="/static/ui-resize-handles.js"></script>` line, and add these three right before `<script src="/static/preview.js"></script>`:

```html
<script src="/static/video-box-preview.js"></script>
<script src="/static/panel-video-box.js"></script>
<script src="/static/panel-layers.js"></script>
```

- [ ] **Step 4: Add CSS link for the new LAYERS panel stylesheet**

Add `<link rel="stylesheet" href="/static/css/components/layers-panel.css">` and `<link rel="stylesheet" href="/static/css/components/video-box-panel.css">` to `static/index.html`'s `<head>`, after the existing `<link rel="stylesheet" href="/static/css/components/project-picker.css">` line. (The files themselves are created by Tasks 8/9 — linking a not-yet-existing stylesheet is harmless, the browser just 404s silently until it exists.)

- [ ] **Step 5: Add PANEL_NAV_ITEMS entries**

In `static/editor.js`, add two entries to the `PANEL_NAV_ITEMS` array (after the `"captions"` entry, before `"settings"`). These use plain `<rect>` primitives rather than copied Lucide paths, following the same approach already used by this file's own `"projects"` entry (four plain `<rect>`s) rather than a Lucide glyph:

```js
  {
    value: "video-box",
    label: "VIDEO BOX",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    value: "layers",
    label: "LAYERS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="1"/><rect x="7" y="7" width="14" height="14" rx="1"/></svg>`,
  },
```

- [ ] **Step 6: Add showPanel()'s type list entries and stub open functions**

In `static/editor.js`, update `showPanel()`'s hardcoded type array:

```js
function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}
```

Add these two functions right after the existing `openExportPanel()` function:

```js
function openVideoBoxPanel() {
  selected = { type: "video-box" };
  showPanel("video-box");
  if (window.VideoBoxPanel) VideoBoxPanel.render();
  renderTimeline();
}

function openLayersPanel() {
  selected = { type: "layers" };
  showPanel("layers");
  if (window.LayersPanel) LayersPanel.render();
  renderTimeline();
}
```

Add both to `PANEL_NAV_HANDLERS`:

```js
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel };
```

- [ ] **Step 7: Manual verification**

Start the dev server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000` in the browser. Confirm:
- The left icon rail shows new VIDEO BOX and LAYERS entries with visible icons.
- Clicking VIDEO BOX opens an (empty except for "+ ADD VIDEO BOX") right-hand panel; clicking LAYERS opens an empty right-hand panel. Neither throws a JS console error (the `if (window.X)` guards should prevent that even though the real panels aren't implemented yet).
- The timeline strip shows a new empty "VIDEO BOX" row between CAPTIONS and VIDEO.
- No existing panel (FILES/VIDEO/TEXT/CAPTIONS/SETTINGS/EXPORT/PROJECTS) regressed.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/editor.js
git commit -m "feat: scaffold VIDEO BOX/LAYERS panel mount points and nav wiring"
```

**Next session:** Batch 2 (Tasks 3–9) can now be dispatched simultaneously, each in its own git worktree per `superpowers:using-git-worktrees`. This should be subagent-driven (one subagent per task, dispatched together): "Implement Task 3 from `docs/superpowers/plans/2026-07-19-phase-3-video-box/task-3-ass-render-banding.md` — Tasks 1–2 are complete and merged." (repeat per task file 3–9).
