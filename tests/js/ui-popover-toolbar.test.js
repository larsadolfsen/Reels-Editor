const test = require("node:test");
const assert = require("node:assert");

// Minimal DOMTokenList stand-in shared by every fake element below — real elements always
// have add/remove/contains/toggle, and static/ui-popover-toolbar.js's idle-gated reveal logic
// reads/writes toolbar.classList on a plain document.createElement() result, not just the
// anchor, so both fakes need the same full surface.
function makeClassList() {
  return {
    list: [],
    add(...names) { names.forEach((n) => { if (!this.list.includes(n)) this.list.push(n); }); },
    remove(...names) { names.forEach((n) => { const i = this.list.indexOf(n); if (i !== -1) this.list.splice(i, 1); }); },
    contains(name) { return this.list.includes(name); },
    toggle(name, force) {
      const shouldHave = force === undefined ? !this.contains(name) : force;
      if (shouldHave) this.add(name); else this.remove(name);
      return shouldHave;
    },
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
        classList: makeClassList(),
        style: {},
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        children: [],
        appendChild(el) { this.children.push(el); return el; },
        getBoundingClientRect() { return { top: 100, left: 0, width: 0, height: 0 }; },
      };
    },
  };
}

function makeFakeAnchor(rect = { left: 0, width: 100 }, parentElement = null) {
  return {
    classList: makeClassList(),
    children: [],
    parentElement,
    appendChild(el) { this.children.push(el); return el; },
    addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
    getBoundingClientRect() { return rect; },
  };
}

// A scrolling ancestor for uiPopoverToolbarScrollAncestor's walk-up to find: any single node
// with overflowY: auto/scroll/hidden/clip, positioned at `top`, with no parentElement of its own
// (the walk stops at document.body regardless, so this is enough depth for these tests).
function makeFakeScrollAncestor(top) {
  return { overflowY: "auto", getBoundingClientRect: () => ({ top }), parentElement: null };
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

// The three tests below cover ui-popover-toolbar-below (added 2026-08-01 for the transcript
// hover-slice feature, then fixed twice over two review rounds — see the file's own header
// comment): the chip flips to render below the anchor when there isn't room above a scrolling
// ancestor's own clip edge, measured against that ancestor's rect (with a 6px margin), not the
// viewport. global.getComputedStyle is a minimal fake reading a plain `overflowY` property off
// each fake node, since these tests need to drive uiPopoverToolbarScrollAncestor's ancestor walk.
test("UI.popoverToolbar flips below the anchor when there is no room above a scrolling ancestor", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.document = makeFakeDocument();
  global.getComputedStyle = (el) => ({ overflowY: el.overflowY || "visible" });
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const scrollAncestor = makeFakeScrollAncestor(24);
  const anchor = makeFakeAnchor({ left: 0, width: 100 }, scrollAncestor);
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  // The chip's default (unflipped) placement would land at top: -6 — above the scroll
  // ancestor's own top of 24, so it must flip.
  toolbar.getBoundingClientRect = () => ({ top: -6 });

  anchor._listeners.mousemove({ clientX: 10 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), true);
});

test("UI.popoverToolbar keeps the default above-placement when there is room", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.document = makeFakeDocument();
  global.getComputedStyle = (el) => ({ overflowY: el.overflowY || "visible" });
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const scrollAncestor = makeFakeScrollAncestor(24);
  const anchor = makeFakeAnchor({ left: 0, width: 100 }, scrollAncestor);
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  // Plenty of room above the scroll ancestor's own top of 24.
  toolbar.getBoundingClientRect = () => ({ top: 200 });

  anchor._listeners.mousemove({ clientX: 10 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), false);
});

test("UI.popoverToolbar falls back to the viewport when no scrolling ancestor exists", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  global.document = makeFakeDocument();
  global.getComputedStyle = (el) => ({ overflowY: el.overflowY || "visible" });
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  // No parentElement at all — uiPopoverToolbarScrollAncestor's walk finds nothing and returns
  // null, so the threshold falls back to 0 (plus the 6px margin).
  const anchor = makeFakeAnchor({ left: 0, width: 100 }, null);
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  toolbar.getBoundingClientRect = () => ({ top: -1 });

  anchor._listeners.mousemove({ clientX: 10 });
  t.mock.timers.tick(120);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), true);
});
