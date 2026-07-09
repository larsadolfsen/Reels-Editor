// Preview stage playback: plays a project's clips back-to-back in timeline order.
// Exposes window.Preview.load(project). Mirrors app/timeline.py's ordered/locate. Thin — DOM wiring only.
window.Preview = (() => {
  let clips = [];
  let activeIndex = -1;
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");

  function ordered(list) {
    return [...list].sort((a, b) => a.order - b.order);
  }

  function clipDuration(c) {
    return c.out_point - c.in_point;
  }

  function sequenceDuration(list) {
    return list.reduce((sum, c) => sum + clipDuration(c), 0);
  }

  function locate(list, t) {
    let acc = 0;
    for (const c of ordered(list)) {
      const d = clipDuration(c);
      if (t < acc + d) return { clip: c, src: c.in_point + (t - acc), acc };
      acc += d;
    }
    return null;
  }

  function playClipAt(index) {
    activeIndex = index;
    const c = clips[index];
    player.src = "/media?path=" + encodeURIComponent(c.file_path);
    player.onloadedmetadata = () => {
      player.currentTime = c.in_point;
      player.play();
    };
  }

  function load(project) {
    clips = ordered(project.clips || []);
    activeIndex = -1;
    if (clips.length > 0) {
      playClipAt(0);
    } else {
      player.removeAttribute("src");
    }
  }

  player.addEventListener("timeupdate", () => {
    if (activeIndex < 0) return;
    const c = clips[activeIndex];
    let timelineTime = 0;
    for (let i = 0; i < activeIndex; i++) timelineTime += clipDuration(clips[i]);
    timelineTime += player.currentTime - c.in_point;
    timeEl.textContent = timelineTime.toFixed(1);

    if (player.currentTime >= c.out_point) {
      if (activeIndex + 1 < clips.length) {
        playClipAt(activeIndex + 1);
      } else {
        player.pause();
      }
    }
  });

  document.getElementById("play").addEventListener("click", () => {
    if (player.paused) player.play(); else player.pause();
  });

  return { load, locate, sequenceDuration };
})();
