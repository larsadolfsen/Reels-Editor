// VIDEO context-panel section: trim/order/fill-mode/speed/delete for the selected clip. Exposes
// window.VideoPanel.render()/select()/deleteClip()/moveClip(), plus the shared clampTrim()
// helper (also used by panel-video-box.js).
window.VideoPanel = window.VideoPanel || {};

function clampTrim(inP, outP, dur) {
  inP = Math.max(0, Math.min(inP, dur));
  outP = Math.max(0, Math.min(outP, dur));
  if (outP <= inP) outP = Math.min(dur, inP + 0.1);
  return { in_point: inP, out_point: outP };
}

UI.divider(document.getElementById("video-order-divider"));

(() => {
  function render(c) {
    const dur = clipDurations[c.id] ?? c.out_point;
    const media = project.media_library.find((m) => m.id === c.media_id);
    document.getElementById("video-name").textContent =
      (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();

    async function applyTrim(inP, outP) {
      const t = clampTrim(inP, outP, dur);
      c.in_point = t.in_point; c.out_point = t.out_point;
      await saveProject();
      Preview.load(project);
      renderTimeline();
      render(c);
    }

    UI.numberField(document.getElementById("video-in-field"),
      { label: "IN", unit: "SEC", value: c.in_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(v, c.out_point) });

    UI.numberField(document.getElementById("video-out-field"),
      { label: "OUT", unit: "SEC", value: c.out_point, step: 0.1, span: 4,
        onChange: (v) => applyTrim(c.in_point, v) });

    document.getElementById("video-set-in").onclick = () => applyTrim(player.currentTime, c.out_point);
    document.getElementById("video-set-out").onclick = () => applyTrim(c.in_point, player.currentTime);

    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    const idx = ordered.findIndex((x) => x.id === c.id);
    const upBtn = document.getElementById("video-move-up");
    const downBtn = document.getElementById("video-move-down");
    upBtn.disabled = idx <= 0;
    downBtn.disabled = idx === -1 || idx === ordered.length - 1;
    upBtn.onclick = async () => { await moveClip(c, ordered[idx - 1]); render(c); };
    downBtn.onclick = async () => { await moveClip(c, ordered[idx + 1]); render(c); };

    UI.buttonGroup(document.getElementById("video-fill-mode-group"),
      [{ value: "fit", label: "FIT", span: 4 }, { value: "fill", label: "FILL", span: 4 }],
      c.fill_mode,
      async (v) => {
        c.fill_mode = v;
        await saveProject();
        Preview.load(project);
      });

    UI.numberField(document.getElementById("video-speed-field"),
      { label: "SPEED", unit: "×", value: c.speed || 1, step: 0.1, min: 0.5, max: 2.0, decimals: 1, span: 8,
        onChange: async (v) => {
          c.speed = Math.max(0.5, Math.min(2.0, v));
          await saveProject();
          Preview.load(project);
          renderTimeline();
        } });

    document.getElementById("video-delete").onclick = () => deleteClip(c.id);
    document.getElementById("video-duplicate").onclick = () => duplicateClip(c.id);
  }

  // Removes a clip from the sequence: renumbers the remaining clips' `order` so no gaps appear,
  // drops its clipDurations cache entry, clears selection back to a neutral panel, and if the
  // playhead was inside the deleted clip's timeline range, seeks it to that clip's former start
  // (clamped to the shorter post-delete sequence duration).
  async function deleteClip(clipId) {
    const c = project.clips.find((x) => x.id === clipId);
    if (!c) return;

    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const clip of ordered) {
      if (clip.id === c.id) break;
      start += (clip.out_point - clip.in_point) / (clip.speed || 1);
    }
    const wasInside = (() => {
      const t = parseFloat(document.getElementById("time").textContent) || 0;
      return t >= start && t < start + (c.out_point - c.in_point) / (c.speed || 1);
    })();

    project.clips = project.clips.filter((x) => x.id !== clipId);
    project.clips.sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
    delete clipDurations[clipId];

    await saveProject();
    Preview.load(project);
    MediaPanel.render();
    openFilesPanel();

    if (wasInside) {
      const newTotal = Preview.sequenceDuration(project.clips);
      Preview.seek(newTotal > 0 ? Math.min(start, Math.max(0, newTotal - 0.001)) : 0);
    }
  }

  function select(c) {
    selected = { type: "video", item: c };
    showPanel("video");
    render(c);
    renderTimeline();
  }

  async function moveClip(a, b) {
    const t = a.order;
    a.order = b.order;
    b.order = t;
    await saveProject();
    Preview.load(project);
    renderTimeline();
  }

  // Deep-copies a clip, inserting it immediately after the original (order+1), and selects it.
  async function duplicateClip(clipId) {
    const c = project.clips.find((x) => x.id === clipId);
    if (!c) return;
    project.clips.forEach((x) => { if (x.order > c.order) x.order += 1; });
    const copy = { ...c, id: crypto.randomUUID().replaceAll("-", ""), order: c.order + 1 };
    project.clips.push(copy);
    if (clipDurations[c.id] !== undefined) clipDurations[copy.id] = clipDurations[c.id];
    await saveProject();
    Preview.load(project);
    select(copy);   // sets selected, opens VIDEO panel on the copy, renders + renderTimeline
  }

  window.VideoPanel.render = render;
  window.VideoPanel.select = select;
  window.VideoPanel.deleteClip = deleteClip;
  window.VideoPanel.moveClip = moveClip;
  window.VideoPanel.duplicateClip = duplicateClip;
})();
