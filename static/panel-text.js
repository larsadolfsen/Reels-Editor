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
// Used only as a stateless one-shot shortcut in the POSITION single row of icon buttons — clicking
// one writes the computed value straight into TextPreset.x/y with no persisted anchor selection.
function anchorPositionX(value, boxWidth, align) {
  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  const w = boxWidth || 0;
  const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
  const canvasW = SafeZoneGeometry.CANVAS_W;
  const margin = SafeZoneGeometry.HORIZONTAL_MARGIN;
  let visualLeft;
  if (value === "left") visualLeft = margin;
  else if (value === "right") visualLeft = Math.max(margin, canvasW - margin - w);
  else visualLeft = Math.max(0, (canvasW - w) / 2);
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
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false, text_case: "none",
    shadow: false, shadow_color: "#000000", shadow_offset_x: 4, shadow_offset_y: 4, shadow_blur: 0,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: Math.round(SafeZoneGeometry.TOP_ZONE_BOTTOM), entrance: "fade_pop",
    highlight: false, highlight_color: "#FFD400", highlight_mode: "current_word", highlight_border_radius: 4,
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

// Removes the selected block and its preset, then closes the side panel back to FILES.
async function deleteSelectedTextBlock() {
  const block = currentTextBlock();
  if (!block) return;
  project.text_blocks = project.text_blocks.filter((b) => b.id !== block.id);
  delete project.text_presets[block.preset_id];
  selectedTextBlockId = null;
  await saveProject();
  openFilesPanel();
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
  ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
}

async function renderTextPanel() {
  // closeAll() hides every host subpage and un-hides #panel-text-main — the same reset the two
  // per-control lines did, minus the ids.
  textStyleHost.closeAll();

  const block = currentTextBlock();
  document.getElementById("text-empty-state").hidden = !!block;
  document.getElementById("text-accordions").hidden = !block;
  if (!block) {
    Preview.setSelectedTextBlock(null, null);
    renderTextPreview();
    return;
  }
  const preset = ensureTextPreset(block.preset_id);

  await textDesignTab.render();
  textStyleTab.render();
  renderBoxTab();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    // No heading write here: preview-text.js already assigns the typed text onto the block whose
    // div is actually being edited, and that block isn't necessarily this panel's selected one —
    // clicking another block on the stage doesn't blur an open edit (the box-move branch in
    // ui-text-interaction.js preventDefaults the mousedown), so the still-editing block's later
    // blur used to write its text into whichever block had meanwhile become selected. These
    // callbacks only do the selected-block-agnostic side effects.
    //
    // The freeze below is NOT selected-block-agnostic, though — it must apply to whichever block
    // actually blurred, not to `block`/`preset` closed over from this renderTextPanel() call.
    // preview-text.js passes the blurred block's own id (blockId) precisely because
    // boxResizeCallbacks gets reassigned the moment a different block becomes selected — if block
    // A is left editing, block B gets selected (re-registering these callbacks for B), and A
    // blurs afterward, this closure's `block`/`preset` would be B's, not A's. Resolve fresh by id.
    onEditEnd: async (text, blockId) => {
      // Typing into a block that's still auto-sizing to its content (`fit`) freezes it to a
      // manually-resizable fixed size the moment editing ends with text present — mirrors the
      // existing precedent in handleBoxResizeEnd, which does the same thing on a resize drag.
      // One-way: once frozen, later clearing the text back to empty does not revert this.
      const targetBlock = (project.text_blocks || []).find((b) => b.id === blockId) || block;
      const targetPreset = targetBlock ? project.text_presets[targetBlock.preset_id] : preset;
      if (targetBlock && targetPreset && targetPreset.box_width_mode === "fit" && (targetBlock.heading || "").trim()) {
        const size = Preview.getTextBoxSize(targetBlock.id);
        if (size) {
          targetPreset.box_width = Math.round(size.width);
          targetPreset.box_height = Math.round(size.height);
          targetPreset.box_width_mode = "fixed";
          targetPreset.box_height_mode = "fixed";
          renderBoxTab();
        }
      }
      renderTextPreview();
      await saveProject();
    },
    // preview.js already tracks the active selection itself (Preview.getActiveFormatSelection());
    // this is just a pass-through hook in case a future panel needs to react live to selection
    // changes. FONT accordion controls read the selection on demand instead, so no-op for now.
    onSelectionChange: () => {},
  });
}

// The Box tab now renders as: existing Background/Border settings-row + subpage UI (unchanged,
// predates this refactor), then the shared StyleTab.box sections (WIDTH/HEIGHT, TEXT
// ALIGN, POSITION) mounted into #text-box-shared-body. Built lazily — #text-box-shared-body
// only has anything to show once a text block exists, and Preview/project are not defined yet
// when this file loads.
let textBoxTab = null;

function renderBoxTab() {
  TextPanel.renderBackground();
  TextPanel.renderBorder();
  if (!textBoxTab) {
    textBoxTab = StyleTab.box(document.getElementById("text-box-shared-body"), textStyleTarget, { sizeModes: true });
  }
  textBoxTab.render();
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
  preset.box_width_mode = "fixed";
  preset.box_height_mode = "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  renderTextPreview();
  await saveProject();
  renderBoxTab();
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

const TEXT_TAB_ICON_STYLE = UI.icon("paintbrush", { size: 18 });
const TEXT_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
const TEXT_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
const TEXT_TAB_ICON_TIME = UI.icon("timer", { size: 18 });

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
}
UI.tabBar(document.getElementById("text-tab-bar"), TEXT_TABS, activeTextTab, showTextTab);
showTextTab(activeTextTab);

UI.contextPanelHeader(document.getElementById("text-header"), { icon: UI.icon("type", { size: 18 }), label: "Text" });

// The shared style sections are built ONCE, here, and only re-rendered afterwards — never
// rebuilt. The host appends every drill-down subpage as a new child of #panel-text itself,
// the same place the remaining per-control subpanels (#panel-text-background, etc.) already
// live.
const textStyleTarget = StyleTarget.forTextBlock();
const textStyleHost = StylePanelHost(
  document.getElementById("panel-text-main"),
  document.getElementById("panel-text"),
);
const textDesignTab = StyleTab.design(
  document.getElementById("text-design-mount"),
  textStyleTarget,
  {
    host: textStyleHost,
    // The Weight list previews the block's own heading, read fresh so it follows edits.
    sampleText: () => (currentTextBlock() || {}).heading || "",
    // TEXT's tighter SIZE-row layout (declined convergence with CAPTIONS' default spacing).
    compactSizeRow: true,
  },
);

// Style tab: built once against the same text style target the Design/Box tabs use, then
// re-rendered on every renderTextPanel() call. Sections are built once, rendered many times.
const textStyleTab = StyleTab.styleLibrary(document.getElementById("text-style-body"), textStyleTarget, {});

document.getElementById("text-add-block-btn").addEventListener("click", () => addTextBlockAndEdit());
document.getElementById("text-delete").addEventListener("click", () => deleteSelectedTextBlock());
