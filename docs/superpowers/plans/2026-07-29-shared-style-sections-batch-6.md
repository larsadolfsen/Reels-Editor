# Batch 6 — Style tab & cleanup

> Part of `docs/superpowers/plans/2026-07-29-shared-style-sections.md`. Read the master plan's **Global Constraints**, **Interface contract**, **Script load order** and **Verification procedure** first — they apply to every task here.

**Deliverable:** `static/style-section-preset-library.js` and `static/style-tab-style.js`; both panels' Style tabs rewired onto them; `static/text-panel-style.js` and `static/caption-panel-style.js` deleted; the whole refactor's final sweep (19 files gone, 21 script tags present in the master plan's order, no dead ids in `index.html`); `CLAUDE.md` file-structure tree and inventory brought current.

**Why this batch:** it is the last one, so it carries two jobs. First, the Style tab — the only remaining duplicated pair, and the one that carries a real user-visible bug (below). Second, it is the batch that has to leave the repo consistent: nothing half-deleted, no orphan markup, and a codebase map that describes the shared-section architecture instead of the per-panel duplication it replaced.

**This batch fixes a real bug.** `static/text-panel-style.js:19-30`'s `styleFieldsOf` includes the `highlight` field. `static/caption-panel-style.js:15-27`'s hand-copy of the same function omits it while keeping `highlight_color`, `highlight_mode` and `highlight_border_radius`:

```js
// caption-panel-style.js:21 — note what is NOT in this list
x, y, highlight_color, highlight_mode, highlight_border_radius } = preset;
```

So saving a caption style with MARKER on and re-applying it comes back with MARKER **off**. Batch 1's shared `StyleFields.styleFieldsOf` includes `highlight`, and this batch is where both panels start using it. Task 4 Step 4 is the browser step that proves the fix; do not skip it.

> **Batches 2–5 were not yet written when this file was authored.** The mount-point and panel-wiring pattern below is derived from the master plan's Interface contract and Script load order sections, not from those batch files. Two consequences for the implementer:
>
> 1. Where this batch says "add the build lines next to the existing target/tab wiring", Batches 2–5 will already have created a style target in `panel-text.js` / `panel-captions.js`. **Reuse that target variable**; do not build a second one. Each step below gives both the reuse form and the standalone fallback.
> 2. Task 5's sweep asserts that Batches 2–5 finished their own deletions. A hit there is a bug in the batch that owned that id, not in this one — the step says which batch owns each group.

---

## Task 1: The shared preset-library section

**Files:**
- Create: `static/style-section-preset-library.js`
- Modify: `static/index.html` (one script tag)

**Interfaces:**
- Consumes: `StyleFields.styleFieldsOf` (Batch 1, `static/style-fields.js`); the style target's `getPreset()`, `setPresetField()`, `clearFormatRuns()`, `rerenderPanel()` (Batch 1); `UI.stylePresetCard` (`static/ui-style-preset-card.js`), `UI.styleSaveForm` (`static/ui-style-save-form.js`); `Api.listPresets` / `Api.savePreset` / `Api.deletePreset`.
- Produces: `window.StyleSection.presetLibrary(container, target, options) -> { render() }` — `render()` is **async**, per the master plan's "render() may be async and callers ignore the returned promise". Task 2's `style-tab-style.js` calls it.

**Behaviour that must be preserved exactly** (all of it is in the two files being replaced):

- The card grid is sorted by `usage_count` descending.
- "+ Save current style" hides itself and opens the inline `UI.styleSaveForm` ("save mode"). While save mode is on, every card's click handler is `overwriteSavedPreset` instead of `applySavedPreset`; overwrite replaces the saved preset's style fields in place, keeping `id` / `name` / `usage_count`. Saving or cancelling leaves save mode.
- Applying bumps `saved.usage_count` by one and re-POSTs the preset to the global library.
- The per-card trash button calls `Api.deletePreset` with **no confirmation step** and re-renders immediately. `UI.stylePresetCard` already calls `e.stopPropagation()` in its own `onDelete` handler (`ui-style-preset-card.js:52-55`), so a trash click never also applies the style — do not add a second guard.

**Two things that are genuinely new, and why:**

1. **`target.clearFormatRuns()` replaces the per-panel branch.** `text-panel-style.js:64` does `block.formatting_runs = []` on apply ("a saved preset is reset to this whole look, not a partial patch"); `caption-panel-style.js` has no block and so has no equivalent line. `clearFormatRuns()` is defined as a no-op on the caption target (Batch 1, `style-target-caption.js`), so the shared section calls it unconditionally and needs **no `if (target.kind === "text")` branch**. This is the single reason one file can serve both panels here.
2. **The "+ Save current style" listener moves into the factory.** Today it is attached at load time — `text-panel-style.js:94`, `document.getElementById("text-style-save").addEventListener("click", enterSaveMode)`. Sections own their markup and are **built once, rendered many times**, so the listener is attached in the factory, exactly once, and `render()` only flips `hidden` flags and repaints the list. Do not attach listeners from `render()`.

- [ ] **Step 1: Write the section**

Create `static/style-section-preset-library.js`:

```js
// Shared saved-style preset library section, used by both the TEXT and CAPTIONS Style tabs:
// the "+ Save current style" button, the inline save form, the card grid, save-mode overwrite,
// and per-card delete. Built once per panel; render() refetches the library and repaints.
window.StyleSection = window.StyleSection || {};

// presetLibrary(container, target, options) -> { render() }. `options` is unused today; the
// master plan's contract still passes an object so every section has one signature.
window.StyleSection.presetLibrary = function presetLibrary(container, target, options) {
  // ---- markup, built once ------------------------------------------------
  const saveGroup = document.createElement("div");
  saveGroup.className = "style-group";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "panel-button col-8";
  saveBtn.textContent = "+ Save current style";
  saveGroup.appendChild(saveBtn);

  const formEl = document.createElement("div");
  formEl.className = "style-group";
  formEl.hidden = true;

  const listGroup = document.createElement("div");
  listGroup.className = "style-group";
  const listEl = document.createElement("ul");
  listEl.className = "font-list col-8";
  listGroup.appendChild(listEl);

  container.appendChild(saveGroup);
  container.appendChild(formEl);
  container.appendChild(listGroup);

  // ---- state -------------------------------------------------------------
  // True while the inline save form is open: cards become overwrite targets instead of
  // apply targets. Same flag the two replaced files each kept module-locally.
  let saveMode = false;

  // Applying a saved style writes ~30 fields at once. The target contract has no bulk write
  // and no bare save() — every write path is setField/setPresetField, which each save and
  // re-render. So assign the fields onto the live preset (target.getPreset() is the contract's
  // own accessor for it) and route ONE field back through setPresetField, which commits the
  // save and the preview re-render exactly once instead of firing thirty of each.
  const COMMIT_FIELD = "font";

  function applyStyleFields(fields) {
    Object.assign(target.getPreset(), fields);
    target.setPresetField(COMMIT_FIELD, fields[COMMIT_FIELD]);
  }

  async function saveNewPreset(name) {
    const saved = {
      ...StyleFields.styleFieldsOf(target.getPreset()),
      id: crypto.randomUUID().replaceAll("-", ""),
      name,
      usage_count: 0,
    };
    await Api.savePreset(saved);
    saveMode = false;
    await render();
  }

  // Save-mode card click: overwrite that saved style's look, keeping id/name/usage_count.
  async function overwriteSavedPreset(saved) {
    Object.assign(saved, StyleFields.styleFieldsOf(target.getPreset()));
    await Api.savePreset(saved);
    saveMode = false;
    await render();
  }

  // No confirmation step, matching the pre-existing behaviour.
  async function deleteSavedPreset(saved) {
    await Api.deletePreset(saved.id);
    await render();
  }

  async function applySavedPreset(saved) {
    // Clear BEFORE the write: applyStyleFields' setPresetField call is what triggers the save,
    // so the emptied runs have to already be on the block or they would not be persisted until
    // some later save. No-op on the caption target, which has no runs — hence no branch here.
    target.clearFormatRuns();
    applyStyleFields(StyleFields.styleFieldsOf(saved));
    saved.usage_count = (saved.usage_count || 0) + 1;
    await Api.savePreset(saved);
    // Re-renders the whole panel, which re-calls this section's render() and so refreshes the
    // card grid from the server — the job the old loadSavedPresets() call did by hand.
    target.rerenderPanel();
  }

  function exitSaveMode() {
    saveMode = false;
    render();
  }

  async function render() {
    // Fetched first, before the form is shown, preserving the replaced files' ordering — the
    // save form calls input.focus() on build, and that must stay the last thing that happens.
    const savedPresets = await Api.listPresets();

    saveBtn.hidden = saveMode;
    formEl.hidden = !saveMode;
    formEl.innerHTML = "";
    if (saveMode) UI.styleSaveForm(formEl, { onSave: saveNewPreset, onCancel: exitSaveMode });

    const sorted = [...savedPresets].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    listEl.innerHTML = "";
    sorted.forEach((saved) => listEl.appendChild(UI.stylePresetCard(saved, {
      onClick: saveMode ? overwriteSavedPreset : applySavedPreset,
      onDelete: deleteSavedPreset,
    })));
  }

  // Attached once here in the factory, not at load time and not from render(): sections are
  // built once and rendered many times, so a render()-time listener would stack up duplicates.
  saveBtn.addEventListener("click", () => { saveMode = true; render(); });

  return { render };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, in the block of new `style-*` tags Batch 1 opened after `<script src="/static/ui-project-picker.js"></script>`, add — immediately after `<script src="/static/style-section-position.js"></script>` (Batch 5's last section tag):

```html
<script src="/static/style-section-preset-library.js"></script>
```

Task 5 re-checks the whole block's order against the master plan; getting it exactly right here is not critical, getting it *present* is.

- [ ] **Step 3: Verify it loads**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`, open a **throwaway** project (never a real one — the unload keepalive-save flushes in-memory state to disk), and in the browser console:

```js
typeof StyleSection.presetLibrary
```

Expected: `"function"`. No console errors. Both panels are unchanged — nothing calls the new section yet.

- [ ] **Step 4: Commit**

```bash
git add static/style-section-preset-library.js static/index.html
git commit -m "feat: shared saved-style preset library section"
```

---

## Task 2: The Style tab composer

**Files:**
- Create: `static/style-tab-style.js`
- Modify: `static/index.html` (one script tag)

**Interfaces:**
- Consumes: `StyleSection.presetLibrary` (Task 1).
- Produces: `window.StyleTab.styleLibrary(container, target, options) -> { render() }`. Tasks 3 and 4 call it, one per panel.

The Style tab holds exactly one section, so this composer is thin. It exists anyway for the reason the master plan gives for the composer layer: it is the single place the Style tab's contents and order are defined, so the two panels cannot enumerate it differently.

- [ ] **Step 1: Write the composer**

Create `static/style-tab-style.js`:

```js
// Style tab composer: renders the shared saved-style preset library into a panel's Style tab
// body. Called by both panel-text.js and panel-captions.js, so the two tabs cannot diverge.
window.StyleTab = window.StyleTab || {};

// styleLibrary(container, target, options) -> { render() }. render() is async (the library
// section awaits Api.listPresets); callers ignore the returned promise, as the panels do today.
window.StyleTab.styleLibrary = function styleLibrary(container, target, options) {
  const library = StyleSection.presetLibrary(container, target, {});
  return {
    render() { return library.render(); },
  };
};
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, immediately after `<script src="/static/style-tab-box.js"></script>` (Batch 5's composer tag), add:

```html
<script src="/static/style-tab-style.js"></script>
```

- [ ] **Step 3: Verify it loads**

Reload `http://127.0.0.1:8000` and in the console:

```js
typeof StyleTab.styleLibrary
```

Expected: `"function"`. No console errors, both panels unchanged.

- [ ] **Step 4: Commit**

```bash
git add static/style-tab-style.js static/index.html
git commit -m "feat: Style tab composer"
```

---

## Task 3: Rewire the TEXT panel's Style tab

**Files:**
- Modify: `static/index.html` (`#text-style-body` becomes a mount point; drop one script tag)
- Modify: `static/panel-text.js` (build the tab once, render it per panel render)
- Modify: `static/editor.js` (drop the now-dead `TextPanel.loadSavedPresets()` startup call)
- Delete: `static/text-panel-style.js`

**Interfaces:**
- Consumes: `StyleTab.styleLibrary` (Task 2), `StyleTarget.forTextBlock` (Batch 1).
- Produces: nothing new. `window.TextPanel.renderStyle` and `window.TextPanel.loadSavedPresets` both disappear.

**`TextPanel.loadSavedPresets` call sites — grepped before deleting the file.** There is exactly one, `static/editor.js:208`:

```js
  await TextPanel.loadSavedPresets();
```

It is **dead code and is deleted rather than repointed.** `loadSavedPresets()` only assigns the module-local `savedPresets` variable (`text-panel-style.js:90-92`), and the only reader of that variable is `renderStyle()`, which overwrites it with a fresh `await Api.listPresets()` on its very first line (`text-panel-style.js:73`) before reading it at line 81. So the startup fetch is never observed. The shared section fetches inside `render()` for the same reason, so nothing replaces it. `caption-panel-style.js:90` has the same dead load-time `loadSavedPresets()` call — it is module-local, never exported, and disappears with the file in Task 4.

- [ ] **Step 1: Turn `#text-style-body` into a mount point**

In `static/index.html`, find (currently around line 632):

```html
        <div id="text-style-body">
          <div class="style-group">
            <button id="text-style-save" class="panel-button col-8" type="button">+ Save current style</button>
          </div>
          <div id="text-style-form" class="style-group" hidden></div>
          <div class="style-group">
            <ul id="text-style-list" class="font-list col-8"></ul>
          </div>
        </div>
```

Replace with:

```html
        <div id="text-style-body"></div>
```

`#text-style-body` itself stays — `panel-text.js`'s `textTabPanes.style` looks it up to show/hide the tab pane.

- [ ] **Step 2: Build the tab once in `panel-text.js`**

In `static/panel-text.js`, find the tab wiring near the bottom:

```js
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);
```

Immediately after `showTextTab(activeTextTab);`, add the Style tab build.

**If Batches 2–5 already created a text style target here** (a `const textTarget = StyleTarget.forTextBlock();` line or similar), reuse it:

```js
// Style tab: built once against the same text style target the Design/Box tabs use, then
// re-rendered on every renderTextPanel() call. Sections are built once, rendered many times.
const textStyleTab = StyleTab.styleLibrary(document.getElementById("text-style-body"), textTarget, {});
```

**If no such variable exists**, build one here instead:

```js
// Style tab: built once, re-rendered on every renderTextPanel() call. Building the target at
// load time is safe — forTextBlock() resolves currentTextBlock()/the preset lazily, per call.
const textTarget = StyleTarget.forTextBlock();
const textStyleTab = StyleTab.styleLibrary(document.getElementById("text-style-body"), textTarget, {});
```

- [ ] **Step 3: Render it from `renderTextPanel()`**

In `static/panel-text.js`'s `renderTextPanel()`, find:

```js
  TextPanel.renderStyle();
```

Replace with:

```js
  textStyleTab.render();
```

Unawaited, exactly as `TextPanel.renderStyle()` was — `renderTextPanel` ignores the returned promise.

- [ ] **Step 4: Drop the dead startup fetch**

In `static/editor.js`, inside the startup IIFE (currently line 208), delete this line entirely:

```js
  await TextPanel.loadSavedPresets();
```

Leaving the surrounding lines as:

```js
(async () => {
  setSafeZonesVisible(localStorage.getItem("safeZonesVisible") === "1");
  const storedTheme = localStorage.getItem("theme");
  setTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));

  window.addEventListener("beforeunload", () => {
```

- [ ] **Step 5: Delete the old file and its script tag**

```bash
git rm static/text-panel-style.js
```

In `static/index.html`, delete the line:

```html
<script src="/static/text-panel-style.js"></script>
```

- [ ] **Step 6: Verify the TEXT Style tab in the browser**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway** project with one clip and one text block:

1. Open the TEXT panel → **Style** tab. Expected: "+ Save current style" plus the saved-style cards, laid out exactly as before this batch.
2. Set something distinctive on the Design tab (colour `#FF0000`, size 45), return to Style, click "+ Save current style", type `batch6-text`, Save. Expected: the form closes, the button reappears, a `batch6-text` card shows a red "Sample Text" preview.
3. Change the colour to white. Click the `batch6-text` card. Expected: the stage text goes red again and the Design tab shows `#FF0000`.
4. **FormatRun clearing:** select two words of the heading on the stage, set them to yellow (Design → Color). Return to Style, click `batch6-text`. Expected: the yellow per-range override is gone and the whole block is red — this is `target.clearFormatRuns()`.
5. **Save mode overwrite:** click "+ Save current style" to open the form, then click the `batch6-text` card instead of typing a name. Expected: the form closes and the card now previews the *current* style; no second card appears.
6. **Delete:** hover the `batch6-text` card, click the trash icon. Expected: it disappears immediately, no confirmation dialog, and the style is **not** applied to the block.
7. Reload the page, open the TEXT panel → Style. Expected: the card list matches step 6, and the block's style persisted.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/panel-text.js static/editor.js
git rm --cached static/text-panel-style.js 2>/dev/null; git add -A static/text-panel-style.js
git commit -m "refactor: TEXT Style tab onto the shared preset-library section"
```

(If `git rm` in Step 5 already staged the deletion, the middle line is a no-op — `git status` should show `deleted: static/text-panel-style.js` either way before you commit.)

---

## Task 4: Rewire the CAPTIONS panel's Style tab — and prove the MARKER bug is fixed

**Files:**
- Modify: `static/index.html` (`#caption-style-body` becomes a mount point; drop one script tag)
- Modify: `static/panel-captions.js`
- Delete: `static/caption-panel-style.js`

**Interfaces:**
- Consumes: `StyleTab.styleLibrary` (Task 2), `StyleTarget.forCaptionTrack` (Batch 1).
- Produces: nothing new. `window.CaptionPanel.renderStyle` disappears. `CaptionPanel.loadSavedPresets` never existed — `caption-panel-style.js:30` defined it module-locally and only its own line 90 called it, so there is nothing to repoint.

- [ ] **Step 1: Turn `#caption-style-body` into a mount point**

In `static/index.html`, find (currently around line 213):

```html
          <div id="caption-style-body">
            <div class="style-group">
              <button id="caption-style-save" class="panel-button col-8" type="button">+ Save current style</button>
            </div>
            <div id="caption-style-form" class="style-group" hidden></div>
            <div class="style-group">
              <ul id="caption-style-list" class="font-list col-8"></ul>
            </div>
          </div>
```

Replace with:

```html
          <div id="caption-style-body"></div>
```

`#caption-style-body` stays — `panel-captions.js`'s `captionTabPanes.style` looks it up.

- [ ] **Step 2: Build the tab once in `panel-captions.js`**

In `static/panel-captions.js`, find:

```js
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);
```

Immediately after `showCaptionTab(activeCaptionTab);`, add — **reusing** the caption target Batches 2–5 created if one exists:

```js
// Style tab: built once against the same caption style target the Design/Box tabs use, then
// re-rendered on every renderCaptionPanel() call. Same file as the TEXT panel's Style tab.
const captionStyleTab = StyleTab.styleLibrary(document.getElementById("caption-style-body"), captionTarget, {});
```

**If no such variable exists**, build one:

```js
// Style tab: built once, re-rendered on every renderCaptionPanel() call. Building the target
// at load time is safe — forCaptionTrack() resolves the track and preset lazily, per call.
const captionTarget = StyleTarget.forCaptionTrack();
const captionStyleTab = StyleTab.styleLibrary(document.getElementById("caption-style-body"), captionTarget, {});
```

- [ ] **Step 3: Render it from `renderCaptionPanel()`**

In `static/panel-captions.js`'s `renderCaptionPanel()`, find:

```js
  CaptionPanel.renderStyle();
```

Replace with:

```js
  captionStyleTab.render();
```

- [ ] **Step 4: Delete the old file and its script tag**

```bash
git rm static/caption-panel-style.js
```

In `static/index.html`, delete the line:

```html
<script src="/static/caption-panel-style.js"></script>
```

- [ ] **Step 5: Verify the CAPTIONS Style tab in the browser**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway** project with one clip and caption words (auto-caption, or hand-add a word in the Closed captions tab):

1. CAPTIONS panel → **Style** tab. Expected: "+ Save current style" plus the card grid, identical in layout to the TEXT panel's Style tab.
2. Save / apply / overwrite / delete: repeat Task 3 Step 6's items 2, 3, 5 and 6 against the caption track (name the style `batch6-caption`). Expected: identical behaviour.
3. Applying a style must **not** throw. `target.clearFormatRuns()` runs here too and is a no-op on the caption target — an error in the console means the caption target's `clearFormatRuns` was implemented wrong in Batch 1.

- [ ] **Step 6: PROVE THE MARKER BUG IS FIXED**

This is the regression this batch exists to close. Still on the throwaway project, CAPTIONS panel:

1. Go to **Design** → open the **Highlight** drill-down row (Batch 4 moved CAPTIONS' MARKER/MODE inside it) → set **MARKER** to **ON**. Confirm the stage caption gains a highlight background.
2. Go to **Style** → "+ Save current style" → name it `marker-on` → **Save**.
3. Back to **Design** → **Highlight** → set **MARKER** to **OFF**. Confirm the highlight background disappears from the stage caption.
4. Go to **Style** → click the `marker-on` card.
5. **Expected:** the highlight background comes back on the stage caption, **and** Design → Highlight shows **MARKER: ON**.
6. Reload the page and re-check Design → Highlight. Expected: still **ON**.

**Before this batch, step 5 failed** — `caption-panel-style.js`'s `styleFieldsOf` never copied `highlight`, so the saved style carried the colour and radius but not the on/off flag, and MARKER came back off. If you want to see the old behaviour first, run steps 1–5 on the commit before this task; it is not required.

Then repeat once on the **TEXT** panel (Design → Highlight → toggle on, save a style, toggle off, re-apply) to confirm the shared list did not regress the side that was already correct.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/panel-captions.js
git commit -m "fix: CAPTIONS Style tab onto the shared section, restoring the dropped highlight flag"
```

---

## Task 5: Final sweep — files, script tags, dead ids

**Files:**
- Modify: `static/index.html` (script-tag block reordered to the master plan's order; any stray tag or orphan markup removed)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task's output is the assertions below holding.

This is the whole refactor's consistency check, not just this batch's. Each grep below names the batch that owns a failure.

- [ ] **Step 1: Assert all 19 old files are gone**

```bash
ls static/text-panel-*.js static/caption-panel-*.js
```

Expected: **exactly four** files — `static/text-panel-time.js`, `static/caption-panel-filler-words.js`, `static/caption-panel-language.js`, `static/caption-panel-words.js`. These are the master plan's "Unchanged" list: genuinely single-panel, no counterpart to share with.

Then assert the count directly:

```bash
git ls-files 'static/text-panel-*.js' 'static/caption-panel-*.js' | wc -l
```

Expected: `4`.

- [ ] **Step 2: Assert no JS still references the deleted namespaces**

```bash
grep -rn "TextPanel\.\|CaptionPanel\." static/*.js
```

Expected: hits only for the four surviving files' own exports — `TextPanel.renderTime`, `CaptionPanel.renderWords`, `CaptionPanel.renderLanguage`, `CaptionPanel.renderFillerWords` — plus the `window.TextPanel = window.TextPanel || {}` / `window.CaptionPanel = ...` guards in those same files and their call sites in `panel-text.js` / `panel-captions.js`. Any hit naming `renderFontFamily`, `renderFontWeight`, `renderFontStyle`, `renderOutline`, `renderShadow`, `renderHighlight`, `renderCase`, `renderStyle`, `renderAlign`, `renderPosition`, `renderBox` or `loadSavedPresets` is a leftover call into a deleted file — fix it in the batch that owned that file.

```bash
grep -rn "renderBoxPanel" static/
```

Expected: no output. `renderBoxPanel()` left `panel-text.js` in Batch 5.

- [ ] **Step 3: Assert all 21 new script tags are present, in the master plan's order**

```bash
grep -n 'font-size-scale\.js\|format-run-write\.js\|style-fields\.js\|style-target-\|style-panel-host\.js\|style-section-\|style-tab-' static/index.html
```

Expected: **21 lines**, contiguous, in exactly this order (the master plan's "Script load order" block):

```html
<script src="/static/font-size-scale.js"></script>
<script src="/static/format-run-write.js"></script>
<script src="/static/style-fields.js"></script>
<script src="/static/style-target-text.js"></script>
<script src="/static/style-target-caption.js"></script>
<script src="/static/style-panel-host.js"></script>
<script src="/static/style-section-font-family.js"></script>
<script src="/static/style-section-font-weight.js"></script>
<script src="/static/style-section-size.js"></script>
<script src="/static/style-section-emphasis.js"></script>
<script src="/static/style-section-color.js"></script>
<script src="/static/style-section-outline.js"></script>
<script src="/static/style-section-shadow.js"></script>
<script src="/static/style-section-highlight.js"></script>
<script src="/static/style-section-box.js"></script>
<script src="/static/style-section-align.js"></script>
<script src="/static/style-section-position.js"></script>
<script src="/static/style-section-preset-library.js"></script>
<script src="/static/style-tab-design.js"></script>
<script src="/static/style-tab-box.js"></script>
<script src="/static/style-tab-style.js"></script>
```

If a batch appended its tags out of order, **reorder the block now** to match exactly. This is safe: every file in the block registers into `window.StyleSection` / `StyleTab` / `StyleTarget` at load and touches no DOM at load time, so order among them does not matter functionally — it matters for the map being truthful. The block sits after `<script src="/static/ui-project-picker.js"></script>` and before `panel-text.js` / `panel-captions.js`, per the master plan.

Note the block sits *above* `api-list-presets.js` / `api-save-preset.js` / `api-delete-preset.js` in the file. That is fine and deliberate: sections only touch `Api.*` inside `render()` / event handlers, never at load.

- [ ] **Step 4: Assert the 19 deleted script tags are gone**

```bash
grep -n 'text-panel-\|caption-panel-' static/index.html
```

Expected: **exactly four** lines — `text-panel-time.js`, `caption-panel-words.js`, `caption-panel-language.js`, `caption-panel-filler-words.js`.

- [ ] **Step 5: Assert no dead ids remain in `index.html`**

Every id below belonged to markup that a deleted file wired. Run this from the repo root:

```bash
for id in \
  text-font-row panel-text-font text-font-subpanel-header text-font-list \
  text-weight-row panel-text-weight text-weight-subpanel-header text-weight-list \
  text-size-row text-size-step-down text-size-step-up text-size-field \
  text-italic text-underline text-case-group \
  text-color-row panel-text-color text-color-subpanel-header text-color-color-field \
  text-outline-row panel-text-outline text-outline-subpanel-header text-outline-color-field text-outline-px-field \
  text-shadow-row panel-text-shadow text-shadow-subpanel-header text-shadow-toggle-group \
  text-shadow-color-field text-shadow-offset-x-field text-shadow-offset-y-field text-shadow-blur-field \
  text-highlight-row panel-text-highlight text-highlight-subpanel-header text-highlight-toggle-group \
  text-highlight-color-field text-highlight-radius-field \
  text-style-save text-style-form text-style-list \
  text-box-size-mode-group text-box-width-field text-box-height-field text-box-width-height-divider \
  text-box-background-color-field text-box-background-opacity-field text-box-background-border-divider \
  text-box-border-width-field text-box-border-radius-field text-box-border-color-field text-box-border-position-divider \
  text-align-group position-row-group position-col-group text-offset-x-field text-offset-y-field \
  caption-font-row panel-captions-font caption-font-subpanel-header caption-font-list \
  caption-weight-row panel-captions-weight caption-weight-subpanel-header caption-weight-list \
  caption-size-row caption-size-step-down caption-size-step-up caption-size-field \
  caption-italic caption-underline caption-case-group \
  caption-color-row panel-captions-color caption-color-subpanel-header caption-color-color-field \
  caption-outline-row panel-captions-outline caption-outline-subpanel-header caption-outline-color-field caption-outline-px-field \
  caption-shadow-row panel-captions-shadow caption-shadow-subpanel-header caption-shadow-toggle-group \
  caption-shadow-color-field caption-shadow-offset-x-field caption-shadow-offset-y-field caption-shadow-blur-field \
  caption-highlight-body caption-highlight-marker-group caption-highlight-mode-group \
  caption-highlight-color-field caption-highlight-border-radius-field \
  caption-style-save caption-style-form caption-style-list \
  caption-box-width-field caption-box-height-field caption-box-width-height-divider \
  caption-box-background-color-field caption-box-background-opacity-field caption-box-background-border-divider \
  caption-box-border-width-field caption-box-border-radius-field caption-box-border-color-field caption-box-border-position-divider \
  caption-align-group caption-position-row-group caption-position-col-group caption-offset-x-field caption-offset-y-field \
; do
  grep -q "id=\"$id\"" static/index.html && echo "STILL PRESENT: $id"
done
```

**Expected: no output.** Every line printed is markup whose owning JS is gone. Which batch owns it:

| Prefix group | Owning batch |
|---|---|
| `*-font-*`, `*-weight-*`, `panel-{text,captions}-{font,weight}` | 2 |
| `*-size-*`, `*-italic`, `*-underline`, `*-case-group`, `*-color-*`, `panel-{text,captions}-color` | 3 |
| `*-outline-*`, `*-shadow-*`, `*-highlight-*`, `caption-highlight-body` | 4 |
| `*-box-*`, `*-align-group`, `position-*-group`, `caption-position-*-group`, `*-offset-{x,y}-field` | 5 |
| `*-style-{save,form,list}` | 6 (this batch, Tasks 3–4) |

`caption-highlight-body` is the one to watch: it is also a tab-pane key in `panel-captions.js`'s `captionTabPanes.design` array. If the id survives, that array still references it and Batch 4 was incomplete.

- [ ] **Step 6: Assert the divider wiring is gone**

```bash
grep -n 'divider' static/panel-text.js static/panel-captions.js
```

Expected: no output. The six `UI.divider(document.getElementById("...-box-...-divider"))` calls belonged to the Box tabs and left in Batch 5, with `style-section-box.js` building its own dividers.

- [ ] **Step 7: Confirm the app is clean in the browser**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open a throwaway project, open the TEXT panel and click through Style / Design / Box / Time, then the CAPTIONS panel and click through Closed captions / Filler words / Style / Design / Box. Expected: **zero** console errors or warnings, no empty tab panes, and no missing controls.

- [ ] **Step 8: Commit**

```bash
git add static/index.html
git commit -m "chore: script-tag order and dead-markup sweep for the shared style sections"
```

(If Steps 3–6 all came back clean and you changed nothing, there is nothing to commit — skip this step and say so.)

---

## Task 6: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (file-structure tree + inventory)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Documentation only — but the project convention is that the map is updated in the same commit as the move, and this is the commit that finishes the move.

Line numbers below are as of the pre-refactor `HEAD`; earlier batches shift them. **Anchor on the quoted text, not the number.**

- [ ] **Step 1: Replace the deleted files in the `static/` file-structure tree**

In the `static/` block of the tree, **delete these 19 lines** (currently 121–126, 128–130, 132–141 — note that lines 127 `text-case.js`, 131 `text-panel-time.js` and 142 `caption-panel-words.js` stay):

```
  text-panel-font-family.js  # TEXT panel Design tab: font-family row + drill-down
  text-panel-font-weight.js  # ...
  text-panel-font-style.js   # ...
  text-panel-outline.js      # ...
  text-panel-shadow.js       # ...
  text-panel-highlight.js    # ...
  text-panel-case.js         # ...
  text-panel-align.js        # TEXT panel Box tab: TEXT ALIGN button group
  text-panel-position.js     # ...
  text-panel-style.js        # ...
  caption-panel-style.js     # ...
  caption-panel-case.js      # ...
  caption-panel-font-family.js  # ...
  caption-panel-font-weight.js  # ...
  caption-panel-font-style.js   # ...
  caption-panel-outline.js      # ...
  caption-panel-shadow.js       # ...
  caption-panel-box.js          # ...
  caption-panel-highlight.js    # ...
```

(Delete the full lines, comments included — they are abbreviated here only to keep this plan readable.)

**Insert this block** where `text-panel-font-family.js` was, i.e. immediately after the `api-delete-preset.js` line:

```markdown
  font-size-scale.js         # pure: FontSizeScale.{FONT_SIZE_PRESETS, stepFontSizePreset} — the one font-size step scale [12…96] both panels' SIZE steppers use (added 2026-07-29, shared style sections); node-testable via a guarded module.exports
  format-run-write.js        # pure: FormatRunWrite.upsertFormatRun(block, start, end, field, value) — the per-range FormatRun upsert behind TEXT's selection-aware writes
  style-fields.js            # pure: StyleFields.{STYLE_FIELD_NAMES, styleFieldsOf} — the one saved-style field list; includes `highlight`, which the old caption-side copy silently dropped
  style-target-text.js       # StyleTarget.forTextBlock(deps?) — the adapter every shared section writes through on the TEXT panel; setField upserts a FormatRun when a stage selection on the current block is active, else writes the base preset
  style-target-caption.js    # StyleTarget.forCaptionTrack(deps?) — same object shape, but every write is whole-preset (a caption track has no per-range overrides); clearFormatRuns() is a no-op, which is what lets one section serve both panels branch-free
  style-panel-host.js        # StylePanelHost(mainEl, drillEl) — generic drill-down subpage manager (builds each subpage's UI.subPanelHeader itself), replacing seven hand-copied openXPanel/closeXPanel pairs
  style-section-font-family.js  # shared section: Font Family row + font-list subpage
  style-section-font-weight.js  # shared section: Weight row + weight-list subpage; its render() is async (awaits Api.listFontWeights)
  style-section-size.js         # shared section: SIZE field + the two stepper buttons, stepping through FontSizeScale
  style-section-emphasis.js     # shared section: Italic + Underline + the case button group, all on one row (.btn-group-inline)
  style-section-color.js        # shared section: Color row + color subpage
  style-section-outline.js      # shared section: Outline row (swatch + "Npx") + outline subpage (color + width)
  style-section-shadow.js       # shared section: Shadow row (swatch + ON/OFF) + shadow subpage (toggle + color/offset-x/offset-y/blur)
  style-section-highlight.js    # shared section: Highlight row + highlight subpage (MARKER toggle + color + border radius); option `modes: true` adds CAPTIONS' karaoke MODE group (current_word/progressive_fill/background)
  style-section-box.js          # shared section: box size mode + WIDTH/HEIGHT + background + border; option `sizeModes: false` drops the FIT/FREE/FILL toggle, which is how captions stay always-fixed
  style-section-align.js        # shared section: TEXT ALIGN button group
  style-section-position.js     # shared section: HORIZONTAL/VERTICAL px fields + the stateless anchor-grid shortcut (panel-text.js's anchorPositionX/Y against target.getBoxSize())
  style-section-preset-library.js # shared section: saved-style card grid, "+ Save current style" inline form, save-mode overwrite, per-card delete (added 2026-07-29, batch 6, replacing text-panel-style.js + caption-panel-style.js)
  style-tab-design.js        # StyleTab.design — composes fontFamily→fontWeight→size→emphasis→color→outline→shadow→highlight; the single place that order is defined for both panels
  style-tab-box.js           # StyleTab.box — composes box→align→position
  style-tab-style.js         # StyleTab.styleLibrary — composes the Style tab (one section: the preset library)
```

Then, immediately after the surviving `caption-panel-words.js` line, **add the two kept single-panel files the tree was already missing**:

```markdown
  caption-panel-language.js     # CAPTIONS panel Closed-caption tab: Language settings row + drill-down for CaptionTrack.language ("" = auto-detect)
  caption-panel-filler-words.js # CAPTIONS panel Filler words tab: Project.filler_words list (add/remove) + the Auto-remove button (FillerWords.detectRanges + Api.applyAutoSlice)
```

- [ ] **Step 2: Fix the `panel-text.js` tree line**

Find the tree line starting `  panel-text.js         # TEXT context-panel section:` and replace the whole line with:

```markdown
  panel-text.js         # TEXT context-panel section: Style/Design/Box/Time tab-bar orchestration (UI.tabBar) for the selected text block, building one StyleTarget.forTextBlock() plus a StylePanelHost and handing both to StyleTab.design/box/styleLibrary (renderTextPanel then only calls each tab's render()); preset defaulting (defaultTextPreset/ensureTextPreset), multi-block selection (currentTextBlock/selectTextBlock/addTextBlock/addTextBlockAndEdit/deleteSelectedTextBlock/duplicateTextBlock), the anchorPositionX/Y position-grid helpers, and the stage resize/move handlers (stageScale/handleBoxResize/handleBoxResizeEnd/handleBoxMove/handleBoxMoveEnd); renderBoxPanel() removed 2026-07-29 (shared style sections) — it is now style-section-box.js
```

- [ ] **Step 3: Fix the `index.html` tree line**

In the long `  index.html         # editor page: ...` line, find this stretch:

> each pane wired by its own `static/text-panel-*.js` file except Box (wired in `panel-text.js`) — no side-panel heading field: … ; TIME holds start/end (`text-panel-time.js`);

— i.e. everything from `each pane wired by its own` through `TIME holds start/end (\`text-panel-time.js\`);` inclusive. Replace that whole stretch with:

```markdown
each pane a mount point filled at wiring time by the shared style sections (`static/style-tab-*.js` → `static/style-section-*.js`, added 2026-07-29) rather than hand-written markup — `#text-style-body`, `#text-font-body` and `#text-box-body` are empty `<div>`s in this file, and `#text-time-body` keeps its own markup for the single-panel `text-panel-time.js`; no side-panel heading field: the heading is edited directly on the stage (`static/ui-text-interaction.js`, added 2026-07-18);
```

Then find the trailing sentence:

> As of 2026-07-24 (highlight background + border-radius feature): the CAPTIONS panel's HIGHLIGHT mode button group gained a third "Background" option plus a border-radius number field (`#caption-highlight-border-radius-field`, shown only when Background mode is active), and a new `<script src="/static/text-panel-highlight.js">` tag loads the sibling TEXT-panel Highlight subpage.

and replace it with:

```markdown
As of 2026-07-29 (shared style sections): the TEXT and CAPTIONS panels no longer hold duplicated control markup at all — both panels' Style, Design and Box tab bodies are empty mount points, 19 `text-panel-*.js`/`caption-panel-*.js` script tags were replaced by the 21 `font-size-scale`/`format-run-write`/`style-fields`/`style-target-*`/`style-panel-host`/`style-section-*`/`style-tab-*` tags listed in the master plan's load order, and every drill-down subpage is created at runtime by `StylePanelHost` instead of being hand-written here.
```

- [ ] **Step 4: Replace the four inventory bullets that describe the deleted per-panel files**

**(a)** Under *Text blocks & rich-text formatting*, replace the bullet beginning:

> - `static/text-panel-font-family.js` / `text-panel-font-weight.js` / `text-panel-font-style.js` / …

with:

```markdown
- `static/style-tab-design.js` / `style-tab-box.js` / `style-tab-style.js` — the TEXT panel's Design/Box/Style tab contents. The panel no longer owns per-control files: it builds one `StyleTarget.forTextBlock()` and one `StylePanelHost`, hands them to the three composers, and calls each composer's `render()` per panel render. `static/text-panel-time.js` is the one control group still TEXT-only (start/end), because captions have no equivalent. See "Shared style sections" below for the sections themselves.
```

**(b)** Under *Saved style presets*, replace **both** the `static/text-panel-style.js` bullet and the `static/caption-panel-style.js` bullet with this single bullet:

```markdown
- `static/style-section-preset-library.js` — `StyleSection.presetLibrary(container, target, options)`: the saved-style library, one file for both panels (added 2026-07-29, shared style sections, replacing `text-panel-style.js` + `caption-panel-style.js`). Builds its own markup once — "+ Save current style" button, inline form container, card `<ul>` — and `render()` refetches via `Api.listPresets()`, sorts by `usage_count` descending, and repaints `UI.stylePresetCard`s. "+ Save current style" hides itself and opens `UI.styleSaveForm` ("save mode"); while save mode is on every card's click handler is `overwriteSavedPreset` (replaces the saved style's fields in place, keeping `id`/`name`/`usage_count`) instead of `applySavedPreset`. Every card carries a hover-revealed trash button wired to `Api.deletePreset` with no confirmation step. `applySavedPreset` calls `target.clearFormatRuns()` first — a whole-look reset that empties a text block's per-range overrides and is a deliberate no-op on the caption target, which is why this file needs no per-panel branch — then bulk-assigns `StyleFields.styleFieldsOf(saved)` onto `target.getPreset()`, commits it through one `target.setPresetField()` call, bumps `usage_count`, re-POSTs the preset, and calls `target.rerenderPanel()`. The field list comes from `static/style-fields.js`, so the caption side no longer silently drops `highlight` (a saved caption style used to come back with MARKER off).
```

**(c)** Under *Captions & transcription*, replace the bullet beginning:

> - `static/caption-panel-font-family.js` / `caption-panel-font-weight.js` / … — mirrors of the equivalent `text-panel-*.js` files …

with:

```markdown
- The CAPTIONS panel's Style/Design/Box tabs are the *same files* the TEXT panel uses — `static/style-tab-{style,design,box}.js` over `static/style-section-*.js` — pointed at the caption track via `StyleTarget.forCaptionTrack()` (added 2026-07-29, shared style sections; the nine `caption-panel-{style,case,font-family,font-weight,font-style,outline,shadow,box,highlight}.js` mirrors are gone). The two genuine per-panel differences are named options, not copied code: `StyleTab.box`'s `sizeModes: false` drops the FIT/FREE/FILL toggle so the caption box stays always-fixed, and `StyleTab.design`'s `highlightModes: true` adds the karaoke MODE group inside the Highlight subpage. `static/caption-panel-{words,language,filler-words}.js` stay as-is — genuinely captions-only, with no TEXT counterpart to share with.
```

**(d)** Under *Captions & transcription*, replace the bullet beginning `- \`static/caption-panel-highlight.js\` — \`CaptionPanel.renderHighlight()\`: …` with:

```markdown
- `static/style-section-highlight.js` — the Highlight settings row + drill-down subpage for both panels (added 2026-07-29, shared style sections, replacing `text-panel-highlight.js` + `caption-panel-highlight.js`): MARKER ON/OFF writing `preset.highlight`, highlight color, and the border-radius field. With the `modes: true` option (CAPTIONS only) it also renders the karaoke MODE group — `current_word` / `progressive_fill` / `background` — which is why CAPTIONS' MARKER/MODE controls now live inside the drill-down rather than inline in the panel body.
```

- [ ] **Step 5: Fix the two remaining stale cross-references**

In the `TextPreset` bullet under *Text blocks & rich-text formatting*, find:

> UI control in `static/text-panel-case.js`/`static/caption-panel-case.js`.

and replace with:

```markdown
UI control in `static/style-section-emphasis.js` (shared by both panels).
```

In the `static/panel-text.js` inventory bullet, find:

> shared by `text-panel-position.js` (with `Preview.getTextBoxSize(blockId)`) and `caption-panel-box.js` (with `Preview.getCaptionBoxSize()`)

and replace with:

```markdown
consumed by `static/style-section-position.js` through the style target's `getBoxSize()`, which resolves to `Preview.getTextBoxSize(blockId)` or `Preview.getCaptionBoxSize()` depending on which panel built the target
```

In the same bullet, find:

> `renderTextPanel()` (thin orchestrator delegating to each `text-panel-*.js` file plus `renderBoxPanel()`)

and replace with:

```markdown
`renderTextPanel()` (thin orchestrator calling each tab composer's `render()`)
```

and delete the clause:

> `renderBoxPanel()` (Box tab: width/height SIZE mode FIT/FREE/FILL + background/border fields);

- [ ] **Step 6: Add the new inventory subsection**

Insert this whole subsection **immediately before** the `### Saved style presets` heading:

```markdown
### Shared style sections (TEXT + CAPTIONS)

Added 2026-07-29. The TEXT and CAPTIONS panels style the same entity — a `TextPreset` — so they share one set of markup-owning components instead of two hand-copied sets. Four layers, each with one job. Spec: `docs/superpowers/specs/2026-07-29-shared-style-sections-design.md`.

- **Pure modules.** `static/font-size-scale.js` (`FontSizeScale.{FONT_SIZE_PRESETS, stepFontSizePreset}` — one scale `[12,14,16,18,21,24,36,45,56,72,96]` for both panels), `static/format-run-write.js` (`FormatRunWrite.upsertFormatRun(block, start, end, field, value)`), `static/style-fields.js` (`StyleFields.{STYLE_FIELD_NAMES, styleFieldsOf}` — the saved-style field list). Each exposes `window.X` for the browser and a guarded `module.exports` for `node --test "tests/js/**/*.test.js"`.
- **Style targets.** `static/style-target-text.js` (`StyleTarget.forTextBlock(deps?)`) and `static/style-target-caption.js` (`StyleTarget.forCaptionTrack(deps?)`) return the same object: `{ kind, supportsFormatRuns, getPreset, getFieldValue, setField, setFields, setPresetField, previewField, cancelPreview, clearFormatRuns, rerenderPreview, rerenderPanel, getBoxSize }`. The target absorbs every real difference between the panels — which preset is read, which preview re-renders, and TEXT's selection-aware `FormatRun` writes — so everything above it is branch-free. `setField`/`setFields` are selection-aware for the fields on `style-target-text.js`'s `FORMAT_RUN_FIELDS` allowlist (size, color, outline, weight, italic, underline, highlight, highlight color) and fall back to a whole-preset write for any other field name, `font` included — per-range fonts were raised and declined, so `font` is deliberately excluded from the allowlist even though `FormatRun.font` exists in the data model. `setPresetField` always writes the whole preset. `setFields` batches several field writes into one save/undo entry (needed because picking a font also snaps its weight in one user action). Sections never assign `preset.x = v`, never call `saveProject()`, and never name a `render*Preview()` function. Collaborators are injected via the optional `deps` argument, which is what makes the targets unit-testable outside a browser (`tests/js/style-target-*.test.js`).
- **Panel host.** `static/style-panel-host.js` — `StylePanelHost(mainEl, drillEl)` returns `{ page(title, buildBody, options?), closeAll() }`; `page(...)` returns `{ open(), close(), bodyEl }` and the host builds each subpage's `UI.subPanelHeader` itself. Replaces the seven hand-copied `openXPanel`/`closeXPanel` pairs and the old `panel-text-main`/`panel-captions-main` id juggling.
- **Sections.** `static/style-section-*.js`, one control group per file, namespaced `window.StyleSection.*`, signature `(container, target, options) -> { render() }`. Each **builds its own markup** into `container` — that is the property that prevents the panels drifting apart again, since the reported divergences (a missing `btn-group-inline` class, a font-size scale that stopped at 56 on one side) were markup bugs, not JS bugs. **Built once, rendered many times:** the factory builds DOM and attaches listeners; `render()` only refreshes displayed values. Never call a `UI.*` builder from `render()`. `render()` may be async (`fontWeight` awaits `Api.listFontWeights`, `presetLibrary` awaits `Api.listPresets`) and callers ignore the returned promise.
- **Tab composers.** `static/style-tab-design.js`, `style-tab-box.js`, `style-tab-style.js` — `StyleTab.{design, box, styleLibrary}(container, target, options) -> { render() }`. `StyleTab.design` renders `fontFamily → fontWeight → size → emphasis → color → outline → shadow → highlight` in that fixed order, defined once here rather than re-enumerated by each panel, which is what makes the shared layout structural instead of conventional. Options: `StyleTab.design` `{ host, highlightModes }`, `StyleTab.box` `{ sizeModes }`, `StyleTab.styleLibrary` `{}`.
- **Tests.** `tests/js/*.test.js` via `node --test "tests/js/**/*.test.js"` (Node's built-in runner, no dependency). Covers the pure modules and both targets. **Stated gap:** the section components build DOM and are not unit-tested — they are kept thin, with all decision logic pushed into the pure modules and targets, and each migration batch was verified in the browser on a throwaway project.
```

- [ ] **Step 7: Verify the map matches reality**

```bash
for f in $(git ls-files 'static/style-*.js' 'static/font-size-scale.js' 'static/format-run-write.js' | xargs -n1 basename); do
  grep -q "$f" CLAUDE.md || echo "MISSING FROM MAP: $f"
done
```

Expected: no output — all 21 new files appear in `CLAUDE.md`.

```bash
grep -n 'text-panel-font-family\|text-panel-font-weight\|text-panel-font-style\|text-panel-outline\|text-panel-shadow\|text-panel-highlight\|text-panel-case\|text-panel-align\|text-panel-position\|text-panel-style\|caption-panel-style\|caption-panel-case\|caption-panel-font\|caption-panel-outline\|caption-panel-shadow\|caption-panel-box\|caption-panel-highlight' CLAUDE.md
```

Expected: **no output** in the file-structure tree or the inventory. Historical mentions inside quoted design/plan filenames are fine, but there should be none of those in `CLAUDE.md`.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: map the shared style sections, drop the 19 per-panel style files"
```

---

## Task 7: Both suites, whole-refactor verification, close the plan

**Files:**
- Modify: `docs/superpowers/plans/2026-07-29-shared-style-sections.md` (mark the batches complete)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is the batch's — and the refactor's — verification gate.

- [ ] **Step 1: Run the JS suite**

```bash
node --test "tests/js/**/*.test.js"
```

Expected: **PASS**, no failures. Batch 1 landed 39 tests across 5 files (`font-size-scale`, `format-run-write`, `style-fields`, `style-target-text`, `style-target-caption`); Batches 2–6 add no tests of their own, so the count should still be 39 unless a later batch added some. A failure here means a section is calling a target or pure module in a way the contract does not allow.

- [ ] **Step 2: Run the Python suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: **PASS**, identical to before the whole refactor started. This work is frontend-only — `app/models.py`, the export pipeline and the ASS renderer were never touched — so any change in this result means something strayed out of scope.

- [ ] **Step 3: Whole-refactor browser pass**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

On a **throwaway** project with one clip, one text block and caption words:

1. **TEXT panel, Design tab:** change Font Family, Weight, SIZE (both steppers), Italic, Underline, case, Color, Outline, Shadow, Highlight. Each must update the stage immediately.
2. **Step-up regression:** with a fresh text block (defaults to `size_px: 96`), click the SIZE **step-up** button. Expected: it stays at 96. It must **not** drop to 56 — that was the old TEXT scale's bug.
3. **TEXT panel, Box tab:** FIT / FREE / FILL, WIDTH/HEIGHT, background, border, TEXT ALIGN, POSITION anchor grid, HORIZONTAL/VERTICAL fields.
4. **TEXT panel, selection-aware writes:** select part of the heading on the stage, then change size / color / weight / outline. Expected: only the selected run changes. This is the `setField` vs `setPresetField` distinction, and the CAPTIONS panel cannot exercise it.
5. **CAPTIONS panel, Design tab:** the same controls in the **same order** as TEXT — Font Family → Weight → SIZE → Italic/Underline/case (one row) → Color → Outline → Shadow → Highlight. Row order and row composition must match TEXT visually; anything that differs is a composer bug, not a styling one.
6. **CAPTIONS panel, Box tab:** WIDTH/HEIGHT unconditionally visible with **no** FIT/FREE/FILL toggle, then background, border, TEXT ALIGN, POSITION.
7. **Both Style tabs:** save, apply, overwrite, delete — plus Task 4 Step 6's MARKER check once more.
8. Reload. Expected: everything persisted.
9. Console: **zero** errors and warnings throughout.

- [ ] **Step 4: Mark the plan complete**

In `docs/superpowers/plans/2026-07-29-shared-style-sections.md`, under **Batch files**, mark every batch done:

```markdown
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-1.md` — Foundation ✅
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-2.md` — Font family & weight ✅
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-3.md` — Size, emphasis, color ✅
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-4.md` — Outline, shadow, highlight ✅
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-5.md` — Box tab ✅
- `docs/superpowers/plans/2026-07-29-shared-style-sections-batch-6.md` — Style tab & cleanup ✅
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-29-shared-style-sections.md
git commit -m "docs: shared style sections refactor complete"
```

---

## Batch 6 done when

This checklist covers the whole refactor, not just this batch.

**Files**

- [ ] All **19** old files are deleted: `text-panel-{font-family,font-weight,font-style,outline,shadow,highlight,case,align,position,style}.js` and `caption-panel-{font-family,font-weight,font-style,outline,shadow,highlight,case,box,style}.js`. `git ls-files 'static/text-panel-*.js' 'static/caption-panel-*.js' | wc -l` returns `4`.
- [ ] All **21** new files exist: 3 pure modules, 2 targets, 1 host, 12 sections, 3 tab composers.
- [ ] `renderBoxPanel()` is gone from `static/panel-text.js`; `grep -rn "renderBoxPanel" static/` is empty.
- [ ] The four genuinely single-panel files are untouched: `text-panel-time.js`, `caption-panel-{words,language,filler-words}.js`.

**`index.html`**

- [ ] The 19 old `<script>` tags are gone; the 21 new ones are present, contiguous, and in the master plan's exact order.
- [ ] Both Style tab bodies, both Design tab bodies and both Box tab bodies are empty mount points.
- [ ] Task 5 Step 5's dead-id loop prints nothing.
- [ ] No inline `style="..."` attribute was introduced anywhere, in the markup or in any JS-built DOM.

**Tests**

- [ ] `node --test "tests/js/**/*.test.js"` passes.
- [ ] `.venv/Scripts/python -m pytest -q` passes, unchanged from before the refactor.

**Behaviour**

- [ ] The TEXT and CAPTIONS Design tabs are visually identical to each other: same rows, same order (Font Family → Weight → SIZE → Italic/Underline/case → Color → Outline → Shadow → Highlight), with the case buttons inline on the Italic/Underline row on **both** sides.
- [ ] The Box tabs differ only by the FIT/FREE/FILL toggle (TEXT has it, CAPTIONS does not) — `sizeModes`, not copied markup.
- [ ] Stepping the SIZE field **up** from 96 stays at 96 on both panels; it never drops to 56.
- [ ] **The MARKER bug is fixed:** on CAPTIONS, MARKER on → save a style → MARKER off → apply that style → MARKER is on again, and survives a reload.
- [ ] TEXT's per-range `FormatRun` writes still work with a partial stage selection active, and applying a saved style clears them.
- [ ] Zero console errors or warnings while clicking through every tab of both panels.

**Docs**

- [ ] `CLAUDE.md`'s `static/` tree lists all 21 new files with one-line purposes and none of the 19 deleted ones.
- [ ] `CLAUDE.md`'s inventory has the new **Shared style sections** subsection, and the *Text blocks*, *Saved style presets* and *Captions & transcription* subsections describe the shared architecture rather than per-panel duplication.
- [ ] `CLAUDE.md`'s Run commands lists `node --test "tests/js/**/*.test.js"` (added in Batch 1).
- [ ] Every batch is marked complete in the master plan.
