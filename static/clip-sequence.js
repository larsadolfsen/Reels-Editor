// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed) and converting a video box into a sequence clip.
// Also imports one or more media files via the native multi-select file picker straight into
// the media library (no timeline insert — the user drags library items onto the timeline
// themselves). Plain globals shared with editor.js's drag/drop wiring; reaches into editor.js's
// `project`/`saveProject` globals.

// Inserts a new main-sequence ClipLayer at `dropTime` from any source carrying
// media_id/file_path/in_point/out_point (a video box or a media-library drag): if the
// drop point lands inside an existing clip, that clip splits into two (same media, trimmed
// halves) with the new clip inserted between them; otherwise it inserts at the nearest clip
// boundary. Mutates project.clips in place; returns the new clip.
function insertClipIntoSequence(source, dropTime) {
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  let acc = 0;
  let splitClip = null;
  let splitAt = 0;
  let insertOrder = ordered.length; // default: past the end of the sequence

  for (const c of ordered) {
    const d = (c.out_point - c.in_point) / (c.speed || 1);
    if (dropTime < acc + d) {
      splitClip = c;
      splitAt = c.in_point + (dropTime - acc) * (c.speed || 1);
      insertOrder = c.order;
      break;
    }
    acc += d;
  }

  // Dropping essentially at a clip's own start point needs no split — just insert before it.
  if (splitClip && Math.abs(splitAt - splitClip.in_point) < 0.01) {
    insertOrder = splitClip.order;
    for (const c of project.clips) if (c.order >= insertOrder) c.order += 1;
    splitClip = null;
  } else if (splitClip) {
    for (const c of project.clips) if (c.order > splitClip.order) c.order += 2;
    const secondHalf = {
      id: crypto.randomUUID().replaceAll("-", ""),
      media_id: splitClip.media_id,
      file_path: splitClip.file_path,
      in_point: splitAt,
      out_point: splitClip.out_point,
      order: splitClip.order + 2,
      fill_mode: splitClip.fill_mode,
      speed: splitClip.speed || 1,
    };
    splitClip.out_point = splitAt;
    project.clips.push(secondHalf);
    insertOrder = splitClip.order + 1;
  } else {
    for (const c of project.clips) if (c.order >= insertOrder) c.order += 1;
  }

  const newClip = {
    id: crypto.randomUUID().replaceAll("-", ""),
    media_id: source.media_id,
    file_path: source.file_path,
    in_point: source.in_point,
    out_point: source.out_point,
    order: insertOrder,
    fill_mode: source.fill_mode || "fit",
    speed: source.speed || 1,
  };
  project.clips.push(newClip);
  return newClip;
}

// Drag-to-stitch: a video box dropped on the VIDEO row becomes a sequence clip and stops
// being a box. Position/size/z_index are dropped (meaningless for a full-frame clip).
function stitchVideoBoxIntoSequence(box, dropTime) {
  insertClipIntoSequence(box, dropTime);
  project.video_boxes = project.video_boxes.filter((v) => v.id !== box.id);
}

async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;

  for (const path of paths) {
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) continue;
    const { duration, has_audio, kind } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind });
  }

  await saveProject();
  MediaPanel.render();
}

document.getElementById("add-clip").addEventListener("click", importMedia);
