// Hover-to-slice on the transcript sidebar: hovering a .transcript-word span (static/
// transcript-sidebar.js) lazily reveals a UI.popoverToolbar (static/ui-popover-toolbar.js) with a
// scissors button, wired only once per span (on the first hover where slicing there is currently
// valid) so a long transcript's hundreds of words don't all get DOM/listeners up front. Clicking
// slices the MAIN clip sequence at that word's t_start via Timeline.sliceClip (static/timeline-
// slice.js), mirroring that file's own #slice-action click handler's save/reload sequence.
// Reaches into editor.js's project/saveProject/renderTimeline globals and the Preview global at
// call time — same documented approach static/timeline-slice.js itself uses.
(() => {
  const container = document.getElementById("transcript-sidebar");

  container.addEventListener("mouseover", (e) => {
    const span = e.target.closest(".transcript-word");
    if (!span) return;

    const tStart = parseFloat(span.dataset.tStart);
    if (Timeline.isSliceDisabled(project.clips, tStart)) return;
    if (span.dataset.sliceToolbarBound) return;
    span.dataset.sliceToolbarBound = "true";

    UI.popoverToolbar(span, [{
      icon: "scissors",
      title: "Slice main clip here",
      onClick: async () => {
        const { newId } = Timeline.sliceClip(project.clips, tStart);
        if (!newId) return;               // boundary / empty timeline -> harmless no-op
        await saveProject();
        Preview.load(project);
        Preview.seek(tStart);             // Preview.load resets the clock to 0; seek back so the
        renderTimeline();                 // playhead lands where the cut was made
      },
    }]);
  });
})();
