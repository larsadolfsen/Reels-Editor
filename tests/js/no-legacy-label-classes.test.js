// tests/js/no-legacy-label-classes.test.js
// Guard: the six eyebrow-label recipes retired in Batch 1b must never reappear as hand-rolled
// classes — new labels must go through UI.text instead of reinventing the recipe a seventh time.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RETIRED = [
  "style-group-label",
  "style-panel-header",
  "clip-section-label",
  "sub-panel-title",
  "settings-row-label",
];

function allSourceFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allSourceFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const staticDir = path.join(__dirname, "../../static");
const files = allSourceFiles(staticDir, [".js", ".html"]);

for (const className of RETIRED) {
  test(`"${className}" does not appear anywhere in static/`, () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes(className),
        `${file} still references the retired class "${className}" — use UI.text instead`
      );
    }
  });
}
