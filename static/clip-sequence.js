// Sequence-mutation helpers for the main VIDEO clip track: inserting a new clip at a drop point
// (splitting an existing clip if needed), converting a video box into a sequence clip, and
// appending a media-library item straight to the end of the sequence (used by the MEDIA panel's
// plus-icon button, static/panel-media.js). Also imports one or more media files via the native
// multi-select file picker straight into the media library (no timeline insert — the user drags
// library items onto the timeline themselves). Plain globals shared with editor.js's drag/drop
// wiring; reaches into editor.js's `project`/`saveProject` globals.

// Inserts a new main-sequence ClipLayer at `dropTime` from any source carrying
// media_id/file_path/in_point/out_point (a video box or a media-library drag): if the
// drop point lands inside an existing clip, that clip splits into two (same media, trimmed
// halves) with the new clip inserted between them; otherwise it inserts at the nearest clip
// boundary. Shifts any project.captions.words at/after dropTime later by the inserted clip's
// duration, so existing captions stay aligned with the clips they were on (see
// caption-clip-sync.js). Mutates project.clips in place; returns the new clip.
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

  const insertedDuration = (newClip.out_point - newClip.in_point) / (newClip.speed || 1);
  if (project.captions) {
    project.captions.words = CaptionClipSync.shiftCaptionsAfterEdit(project.captions.words, dropTime, 0, insertedDuration);
  }

  return newClip;
}

// Drag-to-stitch: a video box dropped on the VIDEO row becomes a sequence clip and stops
// being a box. Position/size/z_index are dropped (meaningless for a full-frame clip).
function stitchVideoBoxIntoSequence(box, dropTime) {
  insertClipIntoSequence(box, dropTime);
  project.video_boxes = project.video_boxes.filter((v) => v.id !== box.id);
}

// Appends a media-library item as a new clip at the end of the main VIDEO sequence — the drop
// point is always past every existing clip, so insertClipIntoSequence never needs to split.
// Shared by the MEDIA panel's plus-icon "add to timeline" button (static/panel-media.js, video
// rows only; image rows create an IMAGE BOX instead, see panel-image-box.js's createImageBox).
async function appendMediaClipToSequence(m) {
  const dropTime = Preview.sequenceDuration(project.clips);
  const clip = insertClipIntoSequence(
    { media_id: m.id, file_path: m.file_path, in_point: 0, out_point: m.duration },
    dropTime,
  );
  clipDurations[clip.id] = m.duration;
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (m.kind !== "image") await runAutoCaption();
  return clip;
}

async function importMedia() {
  const paths = await Api.pickFiles();
  if (!paths.length) return;

  // The import route copies each file, probes it, and saves the project server-side, but
  // saveProject() still needs to run client-side afterward — it's not just a persistence
  // call, it's also what reseeds the undo baseline (lastSavedJson) and records the import as
  // its own undo step. Skipping it left `project` (in memory) ahead of `lastSavedJson`, so an
  // unrelated later Ctrl+Z would revert to the pre-import snapshot and then persist that
  // reverted state, silently dropping the imported MediaItem (bug found in final review).
  const result = await Api.importMedia(project.id, paths);
  if (!result) {
    alert("Import failed — one of the selected files could not be read.");
    return;
  }
  project = result.project;
  await saveProject();

  MediaPanel.render();
}

document.getElementById("add-clip").addEventListener("click", importMedia);
