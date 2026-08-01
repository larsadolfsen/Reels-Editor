// Wires UI.popoverToolbar (static/ui-popover-toolbar.js) onto a #row-overlays lane
// (text block/video box/image box/shape): a Copy icon button that duplicates that layer via
// OverlayCopy.duplicate (static/overlay-copy.js), saves, and selects the new layer, plus a
// Delete icon button that removes it via OverlayDelete.delete (static/overlay-delete.js) and
// returns to FILES, same as each layer's own side-panel Delete button. Reaches into editor.js's
// project/saveProject/onTimelineSelect/openFilesPanel globals and
// VideoBoxPreview/ImageBoxPreview/ShapePreview globals at call time — same documented approach
// as static/timeline-slice.js. Exposes window.OverlayCopyToolbar.attach(blockDiv, entry), called
// from static/timeline.js's renderOverlaysRow.
(() => {
  const KIND_TO_SELECT_TYPE = {
    text: "text",
    video_box: "video-box",
    image_box: "image-box",
    shape: "shape",
  };

  // Explicit stage re-render after onTimelineSelect for kinds whose panel render doesn't already
  // repaint the stage itself — text's renderTextPanel() calls Preview.renderText() internally, so
  // it's excluded (same distinction timeline-slice.js/stage-shape-draw.js/panel-media.js draw
  // between text and video-box/image-box/shape).
  function repaintStage(kind) {
    const t = Preview.currentTimelineTime();
    if (kind === "video_box") VideoBoxPreview.render(project.video_boxes, t);
    else if (kind === "image_box") ImageBoxPreview.render(project.image_boxes, t);
    else if (kind === "shape") ShapePreview.render(project.shapes, t);
  }

  function attach(blockDiv, entry) {
    UI.popoverToolbar(blockDiv, [
      {
        icon: "copy",
        title: "Copy layer",
        onClick: async () => {
          const newItem = OverlayCopy.duplicate(project, entry);
          await saveProject();
          await onTimelineSelect({ type: KIND_TO_SELECT_TYPE[entry.kind], item: newItem });
          repaintStage(entry.kind);
        },
      },
      {
        icon: "trash",
        title: "Delete layer",
        onClick: async () => {
          OverlayDelete.delete(project, entry);
          if (entry.kind === "shape") {
            VideoBoxPreview.setActiveMaskShapeId(null);
            ImageBoxPreview.setActiveMaskShapeId(null);
          }
          await saveProject();
          repaintStage(entry.kind);
          if (entry.kind === "video_box" || entry.kind === "image_box") repaintStage("shape");
          renderTimeline();
          openFilesPanel();
        },
      },
    ]);
  }

  if (typeof window !== "undefined") window.OverlayCopyToolbar = { attach };
})();
