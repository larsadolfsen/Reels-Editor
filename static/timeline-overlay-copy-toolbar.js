// Hover-reveal copy toolbar for #row-overlays lanes (text block/video box/image box/shape):
// a small popover above the lane's .timeline-block with a triangle pointing down at it and one
// Copy icon button, mirroring the look of the playhead-handle's .slice-btn. Clicking Copy
// duplicates that layer via OverlayCopy.duplicate (static/overlay-copy.js), saves, and selects
// the new layer. Reaches into editor.js's project/saveProject/onTimelineSelect globals and
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
    const toolbar = document.createElement("div");
    toolbar.className = "overlay-copy-toolbar";

    const btn = document.createElement("span");
    btn.className = "overlay-copy-icon";
    btn.title = "Copy layer";
    btn.innerHTML = UI.icon("copy", { size: 14 });
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const newItem = OverlayCopy.duplicate(project, entry);
      await saveProject();
      await onTimelineSelect({ type: KIND_TO_SELECT_TYPE[entry.kind], item: newItem });
      repaintStage(entry.kind);
    });

    toolbar.appendChild(btn);
    blockDiv.appendChild(toolbar);
  }

  if (typeof window !== "undefined") window.OverlayCopyToolbar = { attach };
})();
