// Guard test pinning the two integration points that keep the transcript sidebar (see
// static/transcript-sidebar.js) in sync with caption changes: preview.js's load() and
// panel-captions.js's renderCaptionPreview() both DOM-bound files this project's dependency-free
// `node --test` setup can't exercise behaviorally, so this pins the source-level call instead —
// losing either one means the sidebar silently goes stale after a project load/restore or a
// caption word edit.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

function functionBody(src, signature, label) {
  const start = src.indexOf(signature);
  assert.notStrictEqual(start, -1, `${label} no longer defines ${signature}`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${label}`);
}

test("preview.js's load() rebuilds the transcript sidebar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../static/preview.js"), "utf8");
  const body = functionBody(source, "function load(project) {", "preview.js");
  assert.match(body, /TranscriptSidebar\.render\(project\)/,
    "load() must call TranscriptSidebar.render(project), or the sidebar goes stale after project load/restore");
});

test("panel-captions.js's renderCaptionPreview() rebuilds the transcript sidebar", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../static/panel-captions.js"), "utf8");
  const body = functionBody(source, "function renderCaptionPreview() {", "panel-captions.js");
  assert.match(body, /TranscriptSidebar\.render\(project\)/,
    "renderCaptionPreview() must call TranscriptSidebar.render(project), or word edits/auto-caption go stale");
});
