const test = require("node:test");
const assert = require("node:assert");

function makeFakeClassList() {
  const set = new Set();
  return {
    add(...names) { names.forEach((n) => set.add(n)); },
    remove(...names) { names.forEach((n) => set.delete(n)); },
    contains(name) { return set.has(name); },
    toggle(name, force) {
      const shouldHave = force === undefined ? !set.has(name) : force;
      if (shouldHave) set.add(name); else set.delete(name);
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
        classList: makeFakeClassList(),
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
    classList: { list: [], add(...names) { this.list.push(...names); } },
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

// The reveal (including the `left` position write) happens inside a real setTimeout
// (UI_POPOVER_TOOLBAR_HOVER_DELAY_MS), not synchronously on mousemove — these tests wait past
// that delay before asserting, matching how the component actually schedules the update.
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("UI.popoverToolbar tracks the pointer's x position across the anchor on mousemove", async () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor({ left: 50, width: 100 });
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);

  anchor._listeners.mousemove({ clientX: 90 });
  await wait(150);
  assert.strictEqual(toolbar.style.left, "40px");
});

test("UI.popoverToolbar clamps the tracked position to the anchor's own bounds", async () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  // Once visible, the toolbar deliberately stops tracking the pointer (see this file's own
  // header comment) — so clamping at the low and high end of the anchor's width are each
  // exercised on a fresh anchor/toolbar pair, one reveal per instance, rather than two
  // mousemoves against the same already-revealed toolbar.
  const belowMin = makeFakeAnchor({ left: 50, width: 100 });
  const toolbarBelowMin = global.UI.popoverToolbar(belowMin, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  belowMin._listeners.mousemove({ clientX: 0 });
  await wait(150);
  assert.strictEqual(toolbarBelowMin.style.left, "0px");

  const aboveMax = makeFakeAnchor({ left: 50, width: 100 });
  const toolbarAboveMax = global.UI.popoverToolbar(aboveMax, [{ icon: "copy", title: "Copy", onClick: () => {} }]);
  aboveMax._listeners.mousemove({ clientX: 1000 });
  await wait(150);
  assert.strictEqual(toolbarAboveMax.style.left, "100px");
});

// The three tests below cover ui-popover-toolbar-below (added 2026-08-01 for the transcript
// hover-slice feature, then fixed twice over two review rounds — see the file's own header
// comment): the chip flips to render below the anchor when there isn't room above a scrolling
// ancestor's own clip edge, measured against that ancestor's rect (with a 6px margin), not the
// viewport. global.getComputedStyle is a minimal fake reading a plain `overflowY` property off
// each fake node, since these tests need to drive uiPopoverToolbarScrollAncestor's ancestor walk.
test("UI.popoverToolbar flips below the anchor when there is no room above a scrolling ancestor", async () => {
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
  await wait(150);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), true);
});

test("UI.popoverToolbar keeps the default above-placement when there is room", async () => {
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
  await wait(150);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), false);
});

test("UI.popoverToolbar falls back to the viewport when no scrolling ancestor exists", async () => {
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
  await wait(150);
  assert.strictEqual(toolbar.classList.contains("ui-popover-toolbar-below"), true);
});
