// Timeline slice: pure Timeline.sliceClip/sliceVideoBox (JS mirror of app.timeline.slice_clip,
// extended client-side-only for video boxes) + wiring for the #slice-action scissors button.
// The button cuts whichever is the active target at the playhead: a selected video box that's
// active there takes priority (video-box-slice-priority feature); otherwise it cuts the main
// video clip under the playhead, as before. Reaches into editor.js's project/selected/
// saveProject/renderTimeline and Preview/VideoBoxPreview/VideoBoxPanel globals. Depends on
// Preview.locate for the main-clip path; the video-box helpers are pure and DOM-free (also
// exported via module.exports for node --test — see tests/js/timeline-slice.test.js).

const Timeline = (typeof window !== "undefined" && window.Timeline) || {};

// True when slicing at timeline-time t would be a no-op: the playhead is outside every clip
// (including the empty-timeline case, since Preview.locate returns null for an empty list) or
// within eps source-seconds of a clip boundary. Drives both sliceClip's own no-op guard below
// and the slice button's visual disabled state (static/timeline.js's updateSliceButton).
Timeline.isSliceDisabled = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return true;
  const c = loc.clip, s = loc.src;
  return Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps;
};

// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Timeline.isSliceDisabled(clips, t, eps)) return { clips, newId: null };
  clips.forEach((o) => { if (o.order > c.order) o.order += 1; });
  const newId = crypto.randomUUID().replaceAll("-", "");
  clips.push({
    id: newId, media_id: c.media_id, file_path: c.file_path,
    in_point: s, out_point: c.out_point, order: c.order + 1,
    fill_mode: c.fill_mode, speed: c.speed,
  });
  c.out_point = s;
  return { clips, newId };
};

// True when a single video box is visible at timeline-time t — its own start..end window,
// independent of any other box (a VideoBoxLayer isn't part of an ordered sequence like clips).
function isBoxActiveAt(box, t) {
  return box.start <= t && t < box.start + (box.out_point - box.in_point);
}

// Mirrors isSliceDisabled, but against one video box's own boundaries instead of a clip list:
// disabled when the box isn't active at t, or t is within eps seconds of the box's start or end.
function isBoxSliceDisabled(box, t, eps = 0.05) {
  if (!isBoxActiveAt(box, t)) return true;
  const end = box.start + (box.out_point - box.in_point);
  return Math.abs(t - box.start) < eps || Math.abs(end - t) < eps;
}

// Splits video box `box` (a member of `videoBoxes`) at timeline-time t, mirroring sliceClip's
// shape for a box's own start/in/out fields (no `order` field to shift — a box isn't part of an
// ordered sequence). The original box keeps its id/position/size/z-index/mask fields, only
// out_point trims to the split's source time. The new box is a full copy (position/size/
// z-index/mask/media carried through via spread) starting immediately where the first half
// ends. Mutates `box`/pushes onto `videoBoxes` in place; returns { videoBoxes, newId }.
// No-op (newId null) when isBoxSliceDisabled(box, t, eps) is true.
function sliceVideoBox(videoBoxes, box, t, eps = 0.05) {
  if (isBoxSliceDisabled(box, t, eps)) return { videoBoxes, newId: null };
  const srcTime = box.in_point + (t - box.start);
  const newId = crypto.randomUUID().replaceAll("-", "");
  videoBoxes.push({ ...box, id: newId, in_point: srcTime, start: t });
  box.out_point = srcTime;
  return { videoBoxes, newId };
}

Timeline.isBoxActiveAt = isBoxActiveAt;
Timeline.isBoxSliceDisabled = isBoxSliceDisabled;
Timeline.sliceVideoBox = sliceVideoBox;

if (typeof window !== "undefined") {
  window.Timeline = Timeline;

  document.getElementById("slice-action").addEventListener("click", async () => {
    const t = Preview.currentTimelineTime();
    if (selected && selected.type === "video-box" && Timeline.isBoxActiveAt(selected.item, t)) {
      const { newId } = Timeline.sliceVideoBox(project.video_boxes, selected.item, t);
      if (!newId) return;                 // near box boundary -> harmless no-op
      await saveProject();
      VideoBoxPreview.render(project.video_boxes, t);
      VideoBoxPanel.render(selected.item.id);
      renderTimeline();
      return;
    }
    const { newId } = Timeline.sliceClip(project.clips, t);
    if (!newId) return;                 // boundary / empty timeline -> harmless no-op
    await saveProject();
    Preview.load(project);
    Preview.seek(t);                    // Preview.load resets the clock to 0; seek back so the
    renderTimeline();                   // playhead (blue line) stays where the cut was made
  });
}

if (typeof module !== "undefined") {
  module.exports = { isBoxActiveAt, isBoxSliceDisabled, sliceVideoBox };
}
