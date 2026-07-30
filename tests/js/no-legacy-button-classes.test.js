// Guard: the retired button idioms (.panel-button family, .icon-btn, .row-add-btn, .zoom-btn,
// .number-field-step, and the old UI.button(btn, {variant}) call shape) must never reappear —
// every new button goes through UI.button(container, {...}) instead.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RETIRED_CLASSES = ["panel-button", "icon-btn", "row-add-btn", "zoom-btn", "number-field-step"];

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
const files = allSourceFiles(staticDir, [".js", ".html", ".css"]);

for (const className of RETIRED_CLASSES) {
  test(`"${className}" does not appear anywhere in static/`, () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      assert.ok(
        !content.includes(className),
        `${file} still references the retired class "${className}" — use UI.button instead`
      );
    }
  });
}

test("no UI.button(el, {variant: ...}) call shape remains (old signature)", () => {
  for (const file of files.filter((f) => f.endsWith(".js"))) {
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !/UI\.button\([^,]+,\s*\{\s*variant:/.test(content),
      `${file} still calls UI.button with the retired {variant} shape`
    );
  }
});
