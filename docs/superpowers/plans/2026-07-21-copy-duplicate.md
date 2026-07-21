# Copy/Duplicate Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Duplicate the selected clip or text block via Ctrl+D and a panel "Duplicate" button.

**Architecture:** Pure frontend state mutation — the data model already supports it (fresh `crypto.randomUUID()` ids). A clip copy inserts immediately after the original in `order` (shifting the rest); a text-block copy deep-copies the block AND its preset (new ids, `preset_id` re-linked, position offset +20/+20 so it's visibly distinct). No backend change, so no pytest — verified live in-browser on a THROWAWAY project (per the live-verify-on-throwaway rule).

**Tech Stack:** vanilla JS. Single task, single batch.

## Global Constraints
- Fresh ids via `crypto.randomUUID().replaceAll("-", "")` (the pattern already used in `addTextBlock`/`addClip`/`insertClipIntoSequence`).
- Captions and video boxes are out of scope (design: clip or text block only; captions/music are singletons).
- A clip copy carries ALL fields (`media_id`, `file_path`, `in_point`, `out_point`, `fill_mode`, `speed`) — use spread so future fields ride along.
- The Ctrl+D handler reuses the keydown handler's existing input/textarea/select/contentEditable focus guard (editor.js:439) and `preventDefault`s (browser bookmark).
- New/edited file headers stay current per CLAUDE.md.

---

### Task 1: duplicateClip + duplicateTextBlock + buttons + Ctrl+D

**Files:**
- Modify: `static/panel-video.js` (add `duplicateClip`, expose it, wire `#video-duplicate` in `render`)
- Modify: `static/panel-text.js` (add `duplicateTextBlock`, wire `#text-duplicate` at module level)
- Modify: `static/index.html` (add `#video-duplicate` and `#text-duplicate` buttons)
- Modify: `static/editor.js` (Ctrl+D branch in the keydown handler)
- Modify: `CLAUDE.md` (map: note duplicate in Video clips + Text blocks inventory)

**Interfaces:**
- Produces: `window.VideoPanel.duplicateClip(id)`, global `duplicateTextBlock(id)`.

- [ ] **Step 1: Add `duplicateClip` in panel-video.js**

Inside the IIFE in `static/panel-video.js` (alongside `deleteClip`/`moveClip`/`select`), add:

```javascript
  // Deep-copies a clip, inserting it immediately after the original (order+1), and selects it.
  async function duplicateClip(clipId) {
    const c = project.clips.find((x) => x.id === clipId);
    if (!c) return;
    project.clips.forEach((x) => { if (x.order > c.order) x.order += 1; });
    const copy = { ...c, id: crypto.randomUUID().replaceAll("-", ""), order: c.order + 1 };
    project.clips.push(copy);
    if (clipDurations[c.id] !== undefined) clipDurations[copy.id] = clipDurations[c.id];
    await saveProject();
    Preview.load(project);
    select(copy);   // sets selected, opens VIDEO panel on the copy, renders + renderTimeline
  }
```

Expose it at the bottom of the IIFE next to the other assignments:

```javascript
  window.VideoPanel.duplicateClip = duplicateClip;
```

And wire the button inside `render(c)`, right next to the delete wiring (`document.getElementById("video-delete").onclick = ...`):

```javascript
    document.getElementById("video-duplicate").onclick = () => duplicateClip(c.id);
```

- [ ] **Step 2: Add `duplicateTextBlock` in panel-text.js**

In `static/panel-text.js`, after `deleteSelectedTextBlock` (near line 77), add:

```javascript
// Deep-copies the block AND its preset (new ids, preset_id re-linked), offsets the copy's
// position +20/+20 px so it's visibly distinct, selects the copy, saves and re-renders.
async function duplicateTextBlock(blockId) {
  const src = (project.text_blocks || []).find((b) => b.id === blockId);
  if (!src) return;
  const newPresetId = crypto.randomUUID().replaceAll("-", "");
  const srcPreset = project.text_presets[src.preset_id] || defaultTextPreset(newPresetId);
  project.text_presets[newPresetId] = {
    ...srcPreset, id: newPresetId,
    x: (srcPreset.x || 0) + 20, y: (srcPreset.y || 0) + 20,
  };
  const copy = { ...src, id: crypto.randomUUID().replaceAll("-", ""), preset_id: newPresetId };
  project.text_blocks.push(copy);
  selectedTextBlockId = copy.id;
  selected = { type: "text", item: copy };
  await saveProject();
  await renderTextPanel();
  renderTimeline();
}
```

Wire the button at module level, next to the existing `#text-delete` listener (panel-text.js:237):

```javascript
document.getElementById("text-duplicate").addEventListener("click", () => {
  const b = currentTextBlock();
  if (b) duplicateTextBlock(b.id);
});
```

- [ ] **Step 3: Add the buttons in index.html**

In `static/index.html`, in `#panel-video`, insert a duplicate button group immediately BEFORE the delete group (the `<div class="style-group">` holding `#video-delete`, ~line 170):

```html
        <div class="style-group">
          <button id="video-duplicate" class="col-8" type="button">Duplicate clip</button>
        </div>
```

In `#panel-text`, insert immediately BEFORE the delete group (the `<div class="style-group">` holding `#text-delete`, ~line 573):

```html
        <div class="style-group">
          <button id="text-duplicate" class="col-8" type="button">Duplicate text</button>
        </div>
```

- [ ] **Step 4: Ctrl+D in the keydown handler**

In `static/editor.js`, in the keydown handler, add immediately AFTER the redo line (line 442, the `Ctrl+Y`/`Ctrl+Shift+Z` branch) and before the `ArrowLeft` branch:

```javascript
  if (mod && (e.key === "d" || e.key === "D")) {
    e.preventDefault();
    if (selected && selected.type === "video") VideoPanel.duplicateClip(selected.item.id);
    else if (selected && selected.type === "text") duplicateTextBlock(selected.item.id);
    return;
  }
```

- [ ] **Step 5: Verify the app loads (server + console)**

There is no JS test harness — verification is live and belongs to the controller (dispatching implementer should NOT run the browser). After editing, the implementer confirms only that `.venv/Scripts/python -m pytest -q` is still green (189 passed — JS-only, unaffected) and reports; the controller does the live in-browser duplication checks.

- [ ] **Step 6: Update the map + commit**

In `CLAUDE.md`, add one terse note under Video clips (`VideoPanel.duplicateClip`) and under Text blocks (`duplicateTextBlock`), plus note Ctrl+D in the editor.js keyboard-shortcuts description.

```bash
git add static/panel-video.js static/panel-text.js static/index.html static/editor.js CLAUDE.md
git commit -m "feat: duplicate selected clip or text block (Ctrl+D + panel button)"
```

## Controller live-verification checklist (throwaway project)
- [ ] Duplicate a clip: copy appears right after the original in the timeline VIDEO row (order+1), carries the same trim/fill/speed, and is selected.
- [ ] Duplicate a text block: copy is a separate block with its OWN preset (changing one block's style doesn't affect the other), offset +20/+20, and selected/editable.
- [ ] Ctrl+D duplicates whatever is selected (clip or text block); does nothing while typing in an input/contenteditable (focus guard); no browser bookmark dialog.
- [ ] No console errors.

## Out of scope
- Cross-project copy/paste, a cut/paste clipboard model, duplicating captions or video boxes.
