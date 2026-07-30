const test = require("node:test");
const assert = require("node:assert");

function makeFakeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        type: "",
        disabled: false,
        innerHTML: "",
        textContent: "",
        classList: {
          list: [],
          add(...names) { this.list.push(...names); },
        },
        addEventListener(evt, fn) { this._listeners = this._listeners || {}; this._listeners[evt] = fn; },
        setAttribute(name, value) { this[`attr_${name}`] = value; },
        children: [],
        appendChild(el) { this.children.push(el); return el; },
      };
    },
  };
}

delete require.cache[require.resolve("../../static/ui-button.js")];

test("buttonClasses builds the expected class list", () => {
  global.document = makeFakeDocument();
  require("../../static/ui-button.js");
  assert.deepStrictEqual(
    global.buttonClasses({ size: "md", intent: "accent" }),
    ["button", "button-md", "button-accent"]
  );
  assert.deepStrictEqual(
    global.buttonClasses({ size: "sm", intent: "neutral", pressed: true }),
    ["button", "button-sm", "button-neutral", "button-pressed"]
  );
});

test("UI.button creates a button with label text and the right classes", () => {
  global.document = makeFakeDocument();
  const container = { appendChild(el) { this.child = el; } };
  const btn = global.UI.button(container, { label: "Export", size: "md", intent: "accent" });
  assert.strictEqual(btn.tagName, "BUTTON");
  assert.strictEqual(btn.type, "button");
  assert.ok(btn.classList.list.includes("button-accent"));
  assert.strictEqual(container.child, btn);
});

test("UI.button wires onClick", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  let called = false;
  const btn = global.UI.button(container, { label: "X", onClick: () => { called = true; } });
  btn._listeners.click();
  assert.strictEqual(called, true);
});

test("UI.button sets aria-pressed when pressed is provided", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  const btn = global.UI.button(container, { label: "X", pressed: true });
  assert.strictEqual(btn["attr_aria-pressed"], "true");
});
