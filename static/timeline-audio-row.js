// AUDIO timeline row: real per-clip waveforms (each clip's canvas is trimmed to its in/out
// range and scaled to the timeline's px/sec) plus the music track's waveform layered behind
// them in the same row (single AUDIO row in v1, no separate music row). Peaks are fetched once
// per media id via Api.getMediaPeaks and cached client-side in peaksCache; fetches are
// fire-and-forget — onReady is called once a fetch resolves so the caller can re-render with
// the now-cached data. A clip whose media has no audio (or peaks fetch failed) draws a flat line.
// Exposes window.TimelineAudioRow.render(project, pxPerSec, onReady).
window.TimelineAudioRow = (() => {
  const peaksCache = {}; // mediaId -> number[] | "loading"

  function ordered(clips) {
    return [...clips].sort((a, b) => a.order - b.order);
  }
  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  // Returns cached peaks synchronously if available; otherwise kicks off a fetch (once per
  // media id) and returns null. onReady fires when that fetch resolves.
  function getPeaks(mediaId, filePath, onReady) {
    const cached = peaksCache[mediaId];
    if (cached && cached !== "loading") return cached;
    if (cached !== "loading") {
      peaksCache[mediaId] = "loading";
      Api.getMediaPeaks(mediaId, filePath).then((peaks) => {
        peaksCache[mediaId] = peaks;
        onReady();
      });
    }
    return null;
  }

  function drawWaveform(canvas, peaks, alpha = 1) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = getComputedStyle(canvas).color;
    if (!peaks || peaks.length === 0) {
      ctx.fillRect(0, mid - 1, w, 2);
      return;
    }
    const barWidth = Math.max(1, w / peaks.length);
    peaks.forEach((p, i) => {
      const barH = Math.max(2, p * h);
      ctx.fillRect(i * barWidth, mid - barH / 2, Math.max(1, barWidth - 1), barH);
    });
  }

  // Slices a media file's full-duration peaks array down to the [inPoint, outPoint) window
  // a clip actually uses, proportional to the media's total duration.
  function sliceForTrim(peaks, mediaDuration, inPoint, outPoint) {
    if (!peaks || peaks.length === 0 || !mediaDuration) return peaks || [];
    const startIdx = Math.floor((inPoint / mediaDuration) * peaks.length);
    const endIdx = Math.ceil((outPoint / mediaDuration) * peaks.length);
    return peaks.slice(Math.max(0, startIdx), Math.min(peaks.length, endIdx));
  }

  function makeCanvas(className, left, width, height) {
    const canvas = document.createElement("canvas");
    canvas.className = className;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = height;
    canvas.style.left = `${left}px`;
    canvas.style.width = `${width}px`;
    return canvas;
  }

  function render(project, pxPerSec, onReady) {
    const track = document.getElementById("row-audio");
    track.innerHTML = "";
    const rowHeight = track.clientHeight || 40;

    let acc = 0;
    for (const c of ordered(project.clips || [])) {
      const d = clipDuration(c);
      const media = (project.media_library || []).find((m) => m.id === c.media_id);
      const canvas = makeCanvas("audio-clip-waveform", acc * pxPerSec, d * pxPerSec, rowHeight);
      track.appendChild(canvas);
      if (media && media.has_audio) {
        const peaks = getPeaks(media.id, media.file_path, onReady);
        drawWaveform(canvas, sliceForTrim(peaks, media.duration, c.in_point, c.out_point));
      } else {
        drawWaveform(canvas, []);
      }
      acc += d;
    }

    if (project.music) {
      const media = (project.media_library || []).find((m) => m.id === project.music.media_id);
      if (media) {
        const width = Math.max(1, acc * pxPerSec); // music is cut at the reel's end, never longer
        const canvas = makeCanvas("audio-music-waveform", 0, width, rowHeight);
        track.appendChild(canvas);
        const peaks = getPeaks(media.id, media.file_path, onReady);
        const reelFraction = media.duration > 0 ? Math.min(1, acc / media.duration) : 1;
        const sliceEnd = Math.round((peaks || []).length * reelFraction) || (peaks || []).length;
        drawWaveform(canvas, (peaks || []).slice(0, sliceEnd), 0.5);
      }
    }
  }

  return { render };
})();
