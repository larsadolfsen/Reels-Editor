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
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        children: [],
        appendChild(el) { this.children.push(el); return el; },
      };
    },
  };
}

function makeFakeAnchor() {
  return {
    classList: { list: [], add(...names) { this.list.push(...names); } },
    children: [],
    appendChild(el) { this.children.push(el); return el; },
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
  assert.strictEqual(chip.className, "ui-popover-toolbar-chip");

  const btn = chip.children[0];
  assert.strictEqual(btn.className, "ui-popover-toolbar-icon");
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
