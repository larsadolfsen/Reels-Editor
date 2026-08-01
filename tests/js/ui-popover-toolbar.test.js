const test = require("node:test");
const assert = require("node:assert");

function makeFakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        title: "",
        innerHTML: "",
        className: "",
        style: {},
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        children: [],
        appendChild(el) { this.children.push(el); return el; },
      };
    },
  };
}

function makeFakeAnchor(rect = { left: 0, width: 100 }) {
  return {
    classList: { list: [], add(...names) { this.list.push(...names); } },
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

test("UI.popoverToolbar tracks the pointer's x position across the anchor on mousemove", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor({ left: 50, width: 100 });
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);

  anchor._listeners.mousemove({ clientX: 90 });
  assert.strictEqual(toolbar.style.left, "40px");
});

test("UI.popoverToolbar clamps the tracked position to the anchor's own bounds", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-icon.js");
  require("../../static/ui-popover-toolbar.js");

  const anchor = makeFakeAnchor({ left: 50, width: 100 });
  const toolbar = global.UI.popoverToolbar(anchor, [{ icon: "copy", title: "Copy", onClick: () => {} }]);

  anchor._listeners.mousemove({ clientX: 0 });
  assert.strictEqual(toolbar.style.left, "0px");

  anchor._listeners.mousemove({ clientX: 1000 });
  assert.strictEqual(toolbar.style.left, "100px");
});
