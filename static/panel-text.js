// TEXT context-panel section: renders the FONT/STYLES/BOX/TIME accordions for the selected
// text block (empty-state aware when zero blocks exist), plus the stage resize/move handlers.
// Plain globals (renderTextPanel, currentTextBlock, selectTextBlock, addTextBlock, ...) shared
// with text-panel-*.js; reaches into editor.js's `project`/`saveProject`/`selected`/`showPanel` globals.
// addTextBlockAndEdit() (wired to both the empty-state "+ Add text" button and the timeline's
// TEXT-row + button) creates the block, opens the panel, and immediately enters on-stage
// contentEditable edit mode via Preview.enterTextEditMode() so the user can type right away.

// Position grid anchors (thirds of the 1080x1920 canvas). Used only as a stateless one-shot
// shortcut in the POSITION accordion's 3x3 grid — clicking a cell writes the computed value
// straight into TextPreset.x/y with no persisted anchor selection.
const POSITION_ANCHORS_X = { left: 162, mid: 540, right: 918 };
const POSITION_ANCHORS_Y = { top: 288, mid: 960, btm: 1632 };

function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
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
  renderTimeline();
}

async function addTextBlockAndEdit() {
  const block = addTextBlock();
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
  document.getElementById("panel-text-style").hidden = true;
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

UI.accordionSection(document.getElementById("text-style-accordion"), document.getElementById("text-style-body"), { title: "STYLES", expanded: false });
UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-box-accordion"), document.getElementById("text-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("text-time-accordion"), document.getElementById("text-time-body"), { title: "TIME", expanded: false });

UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));
UI.divider(document.getElementById("text-box-border-position-divider"));

document.getElementById("text-add-block-btn").addEventListener("click", () => addTextBlockAndEdit());
document.getElementById("text-delete").addEventListener("click", () => deleteSelectedTextBlock());
