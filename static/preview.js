// Preview stage playback: loads a project's clips, plays the first clip in the 9:16 stage.
// Exposes window.Preview.load(project). Thin — no business logic beyond DOM wiring.
window.Preview = (() => {
  let clips = [];
  const player = document.getElementById("player");
  const timeEl = document.getElementById("time");

  function load(project) {
    clips = project.clips || [];
    if (clips.length > 0) {
      player.src = "/media?path=" + encodeURIComponent(clips[0].file_path);
    } else {
      player.removeAttribute("src");
    }
  }

  player.addEventListener("timeupdate", () => {
    timeEl.textContent = player.currentTime.toFixed(1);
  });

  document.getElementById("play").addEventListener("click", () => {
    if (player.paused) player.play(); else player.pause();
  });

  return { load };
})();
