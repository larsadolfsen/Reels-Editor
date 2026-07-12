// Seeds a placeholder caption line so the timeline's CAPTIONS row has something to show
// before real transcription (Task 10) exists. Text-block seeding is not needed here —
// editor.js's ensureTextBlock()/textPreset already create a real, style-panel-backed one.
// Exposes window.seedDefaults(project) -> project (mutates and returns project).
function seedDefaults(project) {
  if (!project.captions) {
    const sampleWords = ["okay", "so", "nobody", "talks", "about", "this"];
    let t = 0;
    const words = sampleWords.map((text) => {
      const w = { id: crypto.randomUUID().replaceAll("-", ""), text, t_start: t, t_end: t + 0.55 };
      t += 0.65;
      return w;
    });
    project.captions = { id: crypto.randomUUID().replaceAll("-", ""), words };
  }
  return project;
}
