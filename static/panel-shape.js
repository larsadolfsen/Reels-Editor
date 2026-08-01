// #panel-shape context-panel section: size/position (Box), fill color/opacity/corner radius
// (Style), and start/duration (Time) fields, drag-to-move/resize on stage (via ShapePreview),
// delete. Detail view split into Box/Style/Time tab panes via UI.tabBar (Box default), with
// Delete as an always-visible footer. Exposes window.ShapePanel.render(selectedId) and
// window.ShapePanel.createShape() (pushes a new shape into project.shapes and returns it, no
// save/render — caller's responsibility, same contract as ImageBoxPanel.createImageBox) plus
// window.ShapePanel.createShapeAt(rect) (same contract, overriding x/y/width/height from `rect` —
// used by stage-shape-draw.js's click-drag creation; createShape() is createShapeAt({})). One
// shape selected at a time; multiple shapes live in project.shapes (see app/models.py's
// ShapeLayer). No add-from-media picker (a shape isn't sourced from media) and no Mask tab
// (corner radius already covers its shaping need) — mirrors panel-image-box.js otherwise.
window.ShapePanel = window.ShapePanel || {};

(() => {
  const SHAPE_HEADER_ICON = UI.icon("square", { size: 18 });
  const SHAPE_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
  const SHAPE_TAB_ICON_STYLE = UI.icon("square", { size: 18 });
  const SHAPE_TAB_ICON_TIME = UI.icon("timer", { size: 18 });

  const SHAPE_TABS = [
    { value: "box", icon: SHAPE_TAB_ICON_BOX, label: "Box" },
    { value: "style", icon: SHAPE_TAB_ICON_STYLE, label: "Style" },
    { value: "time", icon: SHAPE_TAB_ICON_TIME, label: "Time" },
  ];
  const shapeTabPanes = {
    box: document.getElementById("shape-box-body"),
    style: document.getElementById("shape-style-body"),
    time: document.getElementById("shape-time-body"),
  };
  let activeShapeTab = "box";
  function showShapeTab(value) {
    activeShapeTab = value;
    Object.entries(shapeTabPanes).forEach(([k, el]) => { el.hidden = k !== value; });
  }
  UI.tabBar(document.getElementById("shape-tab-bar"), SHAPE_TABS, activeShapeTab, showShapeTab);
  showShapeTab(activeShapeTab);

  function createShapeAt(rect) {
    const shape = { id: crypto.randomUUID().replaceAll("-", ""), ...ShapeDefaults.centeredShape(), ...rect };
    project.shapes.push(shape);
    return shape;
  }

  function createShape() {
    return createShapeAt({});
  }

  // Repaints the shape's own on-stage element AND, if it's currently masking a video/image box
  // (mask_shape_id), that box's stage element too — otherwise live edits (position/size/opacity/
  // corner_radius) only show on the box after some unrelated future render (found in Task 12
  // manual verification: opacity/corner_radius edits looked "stuck" until reselecting the box).
  function repaintStage() {
    ShapePreview.render(project.shapes, Preview.currentTimelineTime());
    const masksVideoBox = (project.video_boxes || []).some((v) => v.mask_shape_id === lastSelectedId);
    const masksImageBox = (project.image_boxes || []).some((b) => b.mask_shape_id === lastSelectedId);
    if (masksVideoBox) VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
    if (masksImageBox) ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
  }

  function renderDetail(shape) {
    UI.numberField(document.getElementById("shape-x-field"),
      { label: "X", unit: "PX", value: shape.x, min: 0, max: 1080, span: 4,
        onChange: async (v) => { shape.x = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-y-field"),
      { label: "Y", unit: "PX", value: shape.y, min: 0, max: 1920, span: 4,
        onChange: async (v) => { shape.y = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-width-field"),
      { label: "WIDTH", unit: "PX", value: shape.width, min: 1, max: 1080, span: 4,
        onChange: async (v) => { shape.width = v; await saveProject(); renderTimeline(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-height-field"),
      { label: "HEIGHT", unit: "PX", value: shape.height, min: 1, max: 1920, span: 4,
        onChange: async (v) => { shape.height = v; await saveProject(); renderTimeline(); repaintStage(); } });

    UI.colorSwatch(document.getElementById("shape-fill-color-field"),
      { label: "Fill", value: shape.fill_color, span: 8,
        onChange: async (v) => { shape.fill_color = v; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-opacity-field"),
      { label: "OPACITY", unit: "%", value: Math.round(shape.opacity * 100), min: 0, max: 100, span: 4,
        onChange: async (v) => { shape.opacity = v / 100; await saveProject(); repaintStage(); } });
    UI.numberField(document.getElementById("shape-corner-radius-field"),
      { label: "RADIUS", unit: "PX", value: shape.corner_radius, min: 0, span: 4,
        onChange: async (v) => { shape.corner_radius = v; await saveProject(); repaintStage(); } });

    UI.numberField(document.getElementById("shape-start-field"),
      { label: "START", unit: "SEC", value: shape.start, step: 0.1, min: 0, span: 4,
        onChange: async (v) => { shape.start = v; await saveProject(); renderTimeline(); } });
    UI.numberField(document.getElementById("shape-duration-field"),
      { label: "DURATION", unit: "SEC", value: shape.duration, step: 0.1, min: 0.1, span: 4,
        onChange: async (v) => { shape.duration = v; await saveProject(); renderTimeline(); } });

    document.getElementById("shape-delete").onclick = async () => {
      project.shapes = project.shapes.filter((s) => s.id !== shape.id);
      // If this shape was acting as a mask for a video/image box, clear that reference so the
      // accordion collapses back to "+ Add mask" instead of pointing at a deleted shape.
      (project.video_boxes || []).forEach((v) => { if (v.mask_shape_id === shape.id) v.mask_shape_id = null; });
      (project.image_boxes || []).forEach((b) => { if (b.mask_shape_id === shape.id) b.mask_shape_id = null; });
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      await saveProject();
      repaintStage();
      renderTimeline();
      openFilesPanel();
    };

    ShapePreview.setSelectedShape(shape.id, {
      onResize: (size) => {
        const scale = stageScale();
        const width = Math.round(size.width * scale);
        const height = Math.round(size.height * scale);
        ShapePreview.render(
          project.shapes.map((s) => (s.id === shape.id ? { ...s, width, height } : s)),
          Preview.currentTimelineTime(),
        );
      },
      onDragEnd: async (size) => {
        const scale = stageScale();
        shape.width = Math.round(size.width * scale);
        shape.height = Math.round(size.height * scale);
        await saveProject();
        renderDetail(shape);
      },
      onMove: (delta) => {
        const scale = stageScale();
        ShapePreview.render(
          project.shapes.map((s) => (s.id === shape.id ? { ...s, x: s.x + delta.dx * scale, y: s.y + delta.dy * scale } : s)),
          Preview.currentTimelineTime(),
        );
      },
      onMoveEnd: async (delta) => {
        const scale = stageScale();
        shape.x = Math.round(shape.x + delta.dx * scale);
        shape.y = Math.round(shape.y + delta.dy * scale);
        await saveProject();
        renderDetail(shape);
      },
    });
  }

  let lastSelectedId = null;

  function render(selectedId) {
    document.getElementById("shape-add").onclick = async () => {
      const shape = createShape();
      await saveProject();
      renderTimeline();
      render(shape.id);
    };
    const shape = selectedId ? project.shapes.find((s) => s.id === selectedId) : null;
    UI.contextPanelHeader(document.getElementById("shape-header"), {
      icon: SHAPE_HEADER_ICON,
      label: "Shape",
    });
    document.getElementById("shape-empty-state").hidden = !!shape;
    document.getElementById("shape-detail").hidden = !shape;
    if (!shape) {
      ShapePreview.setSelectedShape(null, null);
      lastSelectedId = null;
      VideoBoxPreview.setActiveMaskShapeId(null);
      ImageBoxPreview.setActiveMaskShapeId(null);
      VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
      ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
      return;
    }
    // Selecting a shape that's outside its own time window seeks the playhead to its start so
    // it's visible and editable on stage — mirrors panel-image-box.js's same behavior.
    if (shape.id !== lastSelectedId) {
      const t = Preview.currentTimelineTime();
      if (t < shape.start || t >= shape.start + shape.duration) {
        Preview.seek(shape.start);
        renderTimeline();
      }
    }
    const masksVideoBox = (project.video_boxes || []).some((v) => v.mask_shape_id === shape.id);
    const masksImageBox = (project.image_boxes || []).some((b) => b.mask_shape_id === shape.id);
    VideoBoxPreview.setActiveMaskShapeId(masksVideoBox ? shape.id : null);
    ImageBoxPreview.setActiveMaskShapeId(masksImageBox ? shape.id : null);
    VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
    lastSelectedId = shape.id;
    renderDetail(shape);
  }

  window.ShapePanel.render = render;
  window.ShapePanel.createShape = createShape;
  window.ShapePanel.createShapeAt = createShapeAt;
})();
