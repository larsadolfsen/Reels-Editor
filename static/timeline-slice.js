// Timeline slice: pure Timeline.sliceClip (JS mirror of app.timeline.slice_clip) + wiring for the
// #slice-action scissors button, which cuts the video clip under the playhead in two. Reaches into
// editor.js's project/saveProject/renderTimeline and Preview globals. Depends on Preview.locate.
window.Timeline = window.Timeline || {};

// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps) return { clips, newId: null };
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
  const { newId } = Timeline.sliceClip(project.clips, Preview.currentTimelineTime());
  if (!newId) return;                 // boundary / empty timeline -> harmless no-op
  await saveProject();
  Preview.load(project);
  renderTimeline();
});
