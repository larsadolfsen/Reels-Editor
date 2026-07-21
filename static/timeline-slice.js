// Timeline slice: pure Timeline.sliceClip (JS mirror of app.timeline.slice_clip) + wiring for the
// #slice-action scissors button, which cuts the video clip under the playhead in two. Reaches into
// editor.js's project/saveProject/renderTimeline and Preview globals. Depends on Preview.locate.
window.Timeline = window.Timeline || {};

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

document.getElementById("slice-action").addEventListener("click", async () => {
  const t = Preview.currentTimelineTime();
  const { newId } = Timeline.sliceClip(project.clips, t);
  if (!newId) return;                 // boundary / empty timeline -> harmless no-op
  await saveProject();
  Preview.load(project);
  Preview.seek(t);                    // Preview.load resets the clock to 0; seek back so the
  renderTimeline();                   // playhead (blue line) stays where the cut was made
});
