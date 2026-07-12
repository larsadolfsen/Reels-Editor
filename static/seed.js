// Seeds placeholder text/caption data so the timeline UI has something to show
// before real creation flows (text style panel, transcription) exist.
// Exposes window.seedDefaults(project) -> project (mutates and returns project).
function seedDefaults(project) {
  if (project.text_blocks.length === 0) {
    project.text_blocks.push({
      id: crypto.randomUUID().replaceAll("-", ""),
      heading: "HOOK",
      subheading: "",
      preset_id: "seed",
      start: 0,
      end: 2,
    });
  }
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
