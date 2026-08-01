const test = require("node:test");
const assert = require("node:assert");

// Minimal DOMTokenList stand-in shared by every fake element below — real elements always
// have add/remove/contains, and static/ui-popover-toolbar.js's idle-gated reveal logic reads
// toolbar.classList.contains(...) on a plain document.createElement() result, not just the
// anchor, so both fakes need the same full surface.
function makeClassList() {
  return {
    list: [],
    add(...names) { names.forEach((n) => { if (!this.list.includes(n)) this.list.push(n); }); },
    remove(...names) { names.forEach((n) => { const i = this.list.indexOf(n); if (i !== -1) this.list.splice(i, 1); }); },
    contains(name) { return this.list.includes(name); },
  };
}

function makeFakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        title: "",
        innerHTML: "",
        className: "",
        style: {},
        classList: makeClassList(),
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        children: [],
        appendChild(el) { this.children.push(el); return el; },
      };
    },
  };
}

function makeFakeAnchor(rect = { left: 0, width: 100 }) {
  return {
    classList: makeClassList(),
    children: [],
    appendChild(el) { this.children.push(el); return el; },
    addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
    getBoundingClientRect() { return rect; },
  };
}

delete require.cache[require.resolve("../../static/ui-icon.js")];
delete require.cache[require.resolve("../../static/ui-popover-toolbar.js")];

test("UI.popoverToolbar marks the anchor and appends a toolbar/chip/icon structure", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor();
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy layer", onClick: () => {} }]);

  assert.ok(anchor.classList.list.includes("ui-popover-toolbar-anchor"));
  assert.strictEqual(anchor.children[0], toolbar);
  assert.strictEqual(toolbar.className, "ui-popover-toolbar");

  const chip = toolbar.children[0];
  assert.strictEqual(chip.className, "ui-toolbar-chip ui-popover-toolbar-chip");

  const btn = chip.children[0];
  assert.strictEqual(btn.className, "ui-toolbar-icon");
  assert.strictEqual(btn.title, "Copy layer");
  assert.match(btn.innerHTML, /<svg /);
});

test("UI.popoverToolbar renders one icon button per entry in `buttons`", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor();
  const toolbar = global.UI.popoverToolbar(anchor, [
    { icon: "copy", title: "Copy", onClick: () => {} },
    { icon: "scissors", title: "Cut", onClick: () => {} },
  ]);

  const chip = toolbar.children[0];
  assert.strictEqual(chip.children.length, 2);
  assert.strictEqual(chip.children[1].title, "Cut");
});

test("UI.popoverToolbar wires onClick and stops propagation", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor();
  let called = false;
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => { called = true; } }]);
  const btn = toolbar.children[0].children[0];

  let stopped = false;
  btn._listeners.click({ stopPropagation: () => { stopped = true; } });

  assert.strictEqual(called, true);
  assert.strictEqual(stopped, true);
});

// The reveal is idle-gated (static/ui-popover-toolbar.js's HOVER_DELAY_MS): mousemove only
// schedules the position write, it doesn't apply it until the pointer has been still for
// that long. These tests use node:test's mock timers to advance past that delay instead of
// asserting synchronously right after mousemove.
test("UI.popoverToolbar tracks the pointer's x position across the anchor on mousemove", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor({ left: 50, width: 100 });
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);

  anchor._listeners.mousemove({ clientX: 90 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbar.style.left, "40px");
});

test("UI.popoverToolbar clamps the tracked position to the anchor's own bounds", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  // Once revealed, mousemove no longer repositions the toolbar (see the file's own header
  // comment) — so each clamp direction needs its own fresh, not-yet-visible instance rather
  // than two sequential moves on one toolbar.
  const anchorLow = makeFakeAnchor({ left: 50, width: 100 });
  const toolbarLow = global.UI.popoverToolbar(anchorLow, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  anchorLow._listeners.mousemove({ clientX: 0 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbarLow.style.left, "0px");

  const anchorHigh = makeFakeAnchor({ left: 50, width: 100 });
  const toolbarHigh = global.UI.popoverToolbar(anchorHigh, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  anchorHigh._listeners.mousemove({ clientX: 1000 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbarHigh.style.left, "100px");
});
