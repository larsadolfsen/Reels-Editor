// Guard: no hand-inlined <svg> markup should exist outside ui-icon.js — every icon must come
// from UI.icon() so the codebase never regrows a second, undocumented icon source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../../static");
// shape-mask.js builds a CSS mask-image data-URI SVG (a rect-based alpha mask), not decorative
// icon markup — a fundamentally different use case than the "every icon comes from UI.icon()"
// rule this guard enforces, so it's excluded alongside ui-icon.js itself. ui-safe-zones.js builds
// the same kind of data-URI rect mask (added 2026-08-01, safe-zone-scrim-stripes feature, to punch
// the safe rect's hole out of the striped darkening scrim) rather than reusing shape-mask.js's
// (that file assigns window.ShapeMask unconditionally, so it isn't require()-safe under
// node --test) — same rationale, same exclusion.
const jsFiles = fs.readdirSync(staticDir).filter((f) => f.endsWith(".js") && f !== "ui-icon.js" && f !== "shape-mask.js" && f !== "ui-safe-zones.js");

for (const file of jsFiles) {
  test(`${file} contains no raw <svg markup`, () => {
    const content = fs.readFileSync(path.join(staticDir, file), "utf8");
    assert.ok(
      !content.includes("<svg"),
      `${file} still has an inline <svg> — migrate it to UI.icon() (see Batch 2 plan)`
    );
  });
}
