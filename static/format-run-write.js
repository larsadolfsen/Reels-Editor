// Per-range FormatRun upsert shared by every selection-aware style control.
// Pure: exposes window.FormatRunWrite.upsertFormatRun in the browser and the same
// object via module.exports for node --test.
(() => {
  // Runs never overlap: this splits/merges as needed by finding any existing run whose
  // range exactly matches [start, end) — the common case, re-editing the same selection —
  // and updating it in place, else pushing a fresh one. Overlapping-but-not-identical
  // ranges are out of scope: the UI only ever selects fresh ranges via the browser's
  // native Selection API, so exact-range re-edits are the only overlap that occurs.
  function upsertFormatRun(block, start, end, field, value) {
    block.formatting_runs = block.formatting_runs || [];
    let run = block.formatting_runs.find((r) => r.start === start && r.end === end);
    if (!run) {
      run = { start, end };
      block.formatting_runs.push(run);
    }
    run[field] = value;
    return run;
  }

  const api = { upsertFormatRun };
  if (typeof window !== "undefined") window.FormatRunWrite = api;
  if (typeof module !== "undefined") module.exports = api;
})();
