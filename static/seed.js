// Seeds a placeholder caption line (with its own preset_id, matching CaptionTrack's schema) so
// the timeline's CAPTIONS row and CAPTIONS panel have something to show on a fresh project,
// dev convenience alongside real Auto-caption transcription. Text-block seeding is not needed
// here — editor.js's ensureTextBlock()/ensureTextPreset() already create a real, style-panel-backed one.
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
    project.captions = { id: crypto.randomUUID().replaceAll("-", ""), words, z_index: 0,
      preset_id: crypto.randomUUID().replaceAll("-", "") };
  }
  return project;
}
