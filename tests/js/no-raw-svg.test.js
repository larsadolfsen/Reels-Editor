// Guard: no hand-inlined <svg> markup should exist outside ui-icon.js — every icon must come
// from UI.icon() so the codebase never regrows a second, undocumented icon source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const staticDir = path.join(__dirname, "../../static");
const jsFiles = fs.readdirSync(staticDir).filter((f) => f.endsWith(".js") && f !== "ui-icon.js");

for (const file of jsFiles) {
  test(`${file} contains no raw <svg markup`, () => {
    const content = fs.readFileSync(path.join(staticDir, file), "utf8");
    assert.ok(
      !content.includes("<svg"),
      `${file} still has an inline <svg> — migrate it to UI.icon() (see Batch 2 plan)`
    );
  });
}
