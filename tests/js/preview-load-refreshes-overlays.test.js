// Guard test for static/preview.js's load(): it must refresh the module's overlay-render state
// (textProject/textPresets) and repaint the overlays. preview.js is a DOM-bound IIFE, so this
// project's dependency-free `node --test` setup cannot exercise it behaviorally — this pins the
// source-level invariant instead, because losing it is invisible until an undo/redo silently
// paints pre-undo text blocks, captions and video/image boxes back onto the stage.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../../static/preview.js"), "utf8");

// The body of `function load(project) { ... }`, brace-matched from its opening brace.
function loadBody(src) {
  const start = src.indexOf("function load(project) {");
  assert.notStrictEqual(start, -1, "preview.js no longer defines load(project)");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces in preview.js's load()");
}

const body = loadBody(source);

test("load() rebinds textProject to the project it was handed", () => {
  assert.match(body, /textProject\s*=\s*project/,
    "load() must reassign textProject, or every later overlay repaint renders a stale project");
});

test("load() rebinds textPresets to the project it was handed", () => {
  assert.match(body, /textPresets\s*=\s*project\.text_presets/,
    "load() must reassign textPresets alongside textProject, or presets outlive their project");
});

test("load() repaints the overlays itself", () => {
  assert.match(body, /renderOverlaysAt\(/,
    "load() must paint the overlays; a zero-clip project never fires a timeupdate to do it");
});
