// Guard: no hand-inlined <svg> markup should exist outside ui-icon.js — every icon must come
// from UI.icon() so the codebase never regrows a second, undocumented icon source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../../static");
// shape-mask.js builds a CSS mask-image data-URI SVG (a rect-based alpha mask), not decorative
// icon markup — a fundamentally different use case than the "every icon comes from UI.icon()"
// rule this guard enforces, so it's excluded alongside ui-icon.js itself. ui-safe-zones.js no
// longer needs the same exemption — as of the safe-zone-border-not-scrim feature it renders a
// plain CSS border outline instead of a data-URI SVG mask, so it's back under this guard.
const jsFiles = fs.readdirSync(staticDir).filter((f) => f.endsWith(".js") && f !== "ui-icon.js" && f !== "shape-mask.js");

for (const file of jsFiles) {
  test(`${file} contains no raw <svg markup`, () => {
    const content = fs.readFileSync(path.join(staticDir, file), "utf8");
    assert.ok(
      !content.includes("<svg"),
      `${file} still has an inline <svg> — migrate it to UI.icon() (see Batch 2 plan)`
    );
  });
}
