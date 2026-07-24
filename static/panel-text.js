// TEXT context-panel section: renders the FONT/STYLES/BOX/TIME tab bar (UI.tabBar) for the selected
// text block (empty-state aware when zero blocks exist), plus the stage resize/move handlers.
// Plain globals (renderTextPanel, currentTextBlock, selectTextBlock, addTextBlock, ...) shared
// with text-panel-*.js; reaches into editor.js's `project`/`saveProject`/`selected`/`showPanel` globals.
// addTextBlockAndEdit(position?) (wired to the empty-state "+ Add text" button, the left icon
// rail's TEXT entry, and stage-click-router.js's Text-tool insert-at-click) creates the block,
// opens the panel, and immediately enters on-stage contentEditable edit mode via
// Preview.enterTextEditMode() so the user can type right away; an optional {x, y} canvas-px
// position overrides the new block's default centered placement.

// Position grid anchors: edge-flush against the 1080x1920 canvas, using the box's own actual
// rendered width/height (from Preview.getTextBoxSize/getCaptionBoxSize) so TOP/BTM/LEFT/RIGHT
// place the box's edge (not its top-left corner) flush with the canvas edge, and MID centers it.
// Used only as a stateless one-shot shortcut in the POSITION accordion's 3x3 grid — clicking a
// cell writes the computed value straight into TextPreset.x/y with no persisted anchor selection.
function anchorPositionX(value, boxWidth, align) {
  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  const w = boxWidth || 0;
  const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
  let visualLeft;
  if (value === "left") visualLeft = 0;
  else if (value === "right") visualLeft = Math.max(0, 1080 - w);
  else visualLeft = Math.max(0, (1080 - w) / 2);
  return visualLeft + offsetFactor * w;
}

function anchorPositionY(value, boxHeight) {
  const h = boxHeight || 0;
  if (value === "top") return 0;
  if (value === "btm") return Math.max(0, 1920 - h);
  return Math.max(0, (1920 - h) / 2);
}

function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
    shadow: false, shadow_color: "#000000", shadow_offset_x: 4, shadow_offset_y: 4, shadow_blur: 0,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 700, entrance: "fade_pop",
  };
}

// Preset always lives at project.text_presets[id] — resolving through the same id used
// for lookup (block.preset_id) structurally prevents the two from drifting apart.
function ensureTextPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultTextPreset(id);
  }
  return project.text_presets[id];
}

let selectedTextBlockId = null;

// The TEXT panel's target block: the explicitly selected one, else the first block, else null.
// Never creates — creation is only ever explicit via addTextBlock() (+ buttons).
function currentTextBlock() {
  const blocks = project.text_blocks || [];
  const sel = blocks.find((b) => b.id === selectedTextBlockId);
  if (sel) return sel;
  selectedTextBlockId = blocks[0] ? blocks[0].id : null;
  return blocks[0] || null;
}

function selectTextBlock(id) { selectedTextBlockId = id; }

// Creates a new empty block (with its own preset) starting at the playhead and selects it.
function addTextBlock() {
  const start = Math.floor(Preview.currentTimelineTime() * 10) / 10;
  const block = {
    id: crypto.randomUUID().replaceAll("-", ""),
    heading: "", preset_id: crypto.randomUUID().replaceAll("-", ""),
    start, end: start + 3,
  };
  project.text_blocks.push(block);
  ensureTextPreset(block.preset_id);
  selectedTextBlockId = block.id;
  return block;
}

// Removes the selected block and its preset. The panel then auto-targets the first remaining
// block (currentTextBlock's fallback), or shows the empty state when none are left.
async function deleteSelectedTextBlock() {
  const block = currentTextBlock();
  if (!block) return;
  project.text_blocks = project.text_blocks.filter((b) => b.id !== block.id);
  delete project.text_presets[block.preset_id];
  selectedTextBlockId = null;
  await saveProject();
  await renderTextPanel();
  const next = currentTextBlock();
  selected = next ? { type: "text", item: next } : { type: "files" };
  renderTimeline();
}

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
  const copy = {
    ...src,
    id: crypto.randomUUID().replaceAll("-", ""),
    preset_id: newPresetId,
    formatting_runs: (src.formatting_runs || []).map((r) => ({ ...r })),
  };
  project.text_blocks.push(copy);
  selectedTextBlockId = copy.id;
  selected = { type: "text", item: copy };
  await saveProject();
  await renderTextPanel();
  renderTimeline();
}

// `position` ({x, y} in 1080x1920 canvas px), when given, overrides the new block's default
// centered placement — used by stage-click-router.js's Text-tool insert-at-click (added
// 2026-07-24, top-toolbar). Omitted, this is identical to the pre-existing behavior.
async function addTextBlockAndEdit(position) {
  const block = addTextBlock();
  if (position) {
    const preset = ensureTextPreset(block.preset_id);
    preset.x = position.x;
    preset.y = position.y;
  }
  selected = { type: "text", item: block };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
  Preview.enterTextEditMode(block.id);
  await saveProject();
}

function renderTextPreview() {
  Preview.renderText(project, project.text_presets, Preview.currentTimelineTime());
  VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
}

async function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-weight").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = currentTextBlock();
  document.getElementById("text-empty-state").hidden = !!block;
  document.getElementById("text-accordions").hidden = !block;
  if (!block) {
    Preview.setSelectedTextBlock(null, null);
    renderTextPreview();
    return;
  }
  const preset = ensureTextPreset(block.preset_id);

  TextPanel.renderFontFamily();
  await TextPanel.renderFontWeight();
  TextPanel.renderFontStyle();
  TextPanel.renderOutline();
  TextPanel.renderShadow();
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; renderTextPreview(); await saveProject(); },
    // preview.js already tracks the active selection itself (Preview.getActiveFormatSelection());
    // this is just a pass-through hook in case a future panel needs to react live to selection
    // changes. FONT accordion controls read the selection on demand instead, so no-op for now.
    onSelectionChange: () => {},
  });
}

function renderBoxPanel() {
  const preset = ensureTextPreset(currentTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-box-size-mode-group"),
    [{ value: "fit", label: "FIT", span: 3 }, { value: "fixed", label: "FREE", span: 2 }, { value: "fill", label: "FILL", span: 3 }],
    preset.box_width_mode,
    (value) => {
      preset.box_width_mode = value;
      preset.box_height_mode = value;
      renderTextPreview(); saveProject(); renderBoxPanel();
    });

  // WIDTH/HEIGHT fields are needed by both FREE (manual fixed size) and FILL (fixed size that
  // auto-fits text) — only FIT (box sizes to content) has no use for them.
  const boxSizeFieldsHidden = preset.box_width_mode === "fit";
  document.getElementById("text-box-width-field").hidden = boxSizeFieldsHidden;
  document.getElementById("text-box-height-field").hidden = boxSizeFieldsHidden;

  UI.numberField(document.getElementById("text-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.box_width = v; renderTextPreview(); saveProject(); } });

  UI.numberField(document.getElementById("text-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.box_height = v; renderTextPreview(); saveProject(); } });

  UI.colorSwatch(document.getElementById("text-box-background-color-field"),
    { label: "Background", showLabel: false, value: preset.box_background_color, span: 1,
      onChange: (v) => { preset.box_background_color = v; preset.box_background = true; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-background-opacity-field"),
    { label: "OPACITY", unit: "%", value: preset.box_background_opacity, min: 0, max: 100, span: 7,
      onChange: (v) => { preset.box_background_opacity = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40, span: 4,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200, span: 3,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-border-color-field"),
    { label: "Border Color", showLabel: false, value: preset.box_border_color, span: 1,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); } });
}

function stageScale() {
  const stageW = document.getElementById("overlay").clientWidth || 1;
  return 1080 / stageW;
}

function handleBoxResize(preset, { width, height }) {
  const scale = stageScale();
  const previewPreset = { ...preset, box_width_mode: "fixed", box_height_mode: "fixed",
    box_width: Math.round(width * scale), box_height: Math.round(height * scale) };
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  // Dragging a handle from FIT means "give this an explicit size" (switches to FREE), but
  // dragging while already in FILL should stay in FILL — autofit is only ever an explicit
  // opt-in via the SIZE button group, never a side effect of a resize drag.
  const wasFill = preset.box_width_mode === "fill";
  preset.box_width_mode = wasFill ? "fill" : "fixed";
  preset.box_height_mode = wasFill ? "fill" : "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  renderTextPreview(); // re-triggers FILL's refit against the new box dimensions, must run before save so the fitted size_px persists
  await saveProject();
  renderBoxPanel();
}

function handleBoxMove(preset, { dx, dy }) {
  const scale = stageScale();
  const previewPreset = { ...preset, x: preset.x + dx * scale, y: preset.y + dy * scale };
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxMoveEnd(preset, { dx, dy }) {
  const scale = stageScale();
  // TextPreset.x/y are int fields (app/models.py) — round before persisting,
  // else the PUT /api/projects/{id} save fails Pydantic validation (422) and the drag is lost.
  preset.x += Math.round(dx * scale);
  preset.y += Math.round(dy * scale);
  await saveProject();
  await renderTextPanel();
}

const TEXT_TAB_ICON_STYLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>';
const TEXT_TAB_ICON_DESIGN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
const TEXT_TAB_ICON_BOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
const TEXT_TAB_ICON_TIME = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>';

const TEXT_TABS = [
  { value: "style", icon: TEXT_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: TEXT_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: TEXT_TAB_ICON_BOX, label: "Box" },
  { value: "time", icon: TEXT_TAB_ICON_TIME, label: "Time" },
];
const textTabPanes = {
  style: document.getElementById("text-style-body"),
  design: document.getElementById("text-font-body"),
  box: document.getElementById("text-box-body"),
  time: document.getElementById("text-time-body"),
};
let activeTextTab = "style";
function showTextTab(value) {
  activeTextTab = value;
  Object.entries(textTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  // Duplicate/Delete act on the whole text block, not on picking a saved style — hide them
  // while the Style tab (the saved-style library) is open.
  document.getElementById("text-edit-actions").hidden = value === "style";
}
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);

UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));
UI.divider(document.getElementById("text-box-border-position-divider"));

document.getElementById("text-add-block-btn").addEventListener("click", () => addTextBlockAndEdit());
document.getElementById("text-delete").addEventListener("click", () => deleteSelectedTextBlock());
document.getElementById("text-duplicate").addEventListener("click", () => {
  const b = currentTextBlock();
  if (b) duplicateTextBlock(b.id);
});
