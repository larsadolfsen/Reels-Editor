// Tests for window.UI.icon(name, {size}) — the inline-SVG icon registry service.
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-icon.js")];
require("../../static/ui-icon.js");

test("UI.icon returns an SVG string with the standard wrapper attributes", () => {
  const markup = global.UI.icon("trash");
  assert.match(markup, /^<svg /);
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /fill="none"/);
  assert.match(markup, /stroke="currentColor"/);
  assert.match(markup, /<\/svg>$/);
});

test("UI.icon defaults to size 24 and honors an explicit size", () => {
  assert.match(global.UI.icon("trash"), /width="24" height="24"/);
  assert.match(global.UI.icon("trash", { size: 14 }), /width="14" height="14"/);
});

test("UI.icon embeds the icon-specific path data", () => {
  // trash's real path data, extracted from static/panel-media.js's pre-migration markup
  assert.match(global.UI.icon("trash"), /M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6/);
});

test("UI.icon embeds the clapperboard icon's path data", () => {
  assert.match(global.UI.icon("clapperboard"), /M20.2 6 3 11l-.9-2.4/);
});

test("UI.icon embeds the copy icon's path data", () => {
  assert.match(global.UI.icon("copy"), /<rect width="14" height="14" x="8" y="8" rx="2" ry="2"\/>/);
});

test("UI.icon throws on an unrecognized name", () => {
  assert.throws(() => global.UI.icon("not-a-real-icon"), /unknown icon/i);
});
