// tests/js/ui-text.test.js
const test = require("node:test");
const assert = require("node:assert");

// UI.text is DOM-dependent (creates real elements), but the class-selection logic and the
// thrown-on-unknown-variant behavior are pure enough to test with a minimal fake DOM shim.
function makeFakeDocument() {
  const created = [];
  return {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        classList: {
          list: [],
          add(...names) { this.list.push(...names); },
        },
        textContent: "",
      };
      created.push(el);
      return el;
    },
    created,
  };
}

test("UI.text creates an eyebrow-variant span with the right class and text", () => {
  global.document = makeFakeDocument();
  delete require.cache[require.resolve("../../static/ui-text.js")];
  require("../../static/ui-text.js");
  const container = { appendChild(el) { this.child = el; } };
  const el = global.UI.text(container, { variant: "eyebrow", content: "STYLE" });
  assert.ok(el.classList.list.includes("text-eyebrow"));
  assert.strictEqual(el.textContent, "STYLE");
  assert.strictEqual(container.child, el);
});

test("UI.text supports label/hint/body variants", () => {
  global.document = makeFakeDocument();
  const container = { appendChild(el) { this.child = el; } };
  assert.ok(global.UI.text(container, { variant: "label", content: "X" }).classList.list.includes("text-label"));
  assert.ok(global.UI.text(container, { variant: "hint", content: "X" }).classList.list.includes("text-hint"));
  assert.ok(global.UI.text(container, { variant: "body", content: "X" }).classList.list.includes("text-body"));
});

test("UI.text throws on an unrecognized variant", () => {
  global.document = makeFakeDocument();
  const container = { appendChild() {} };
  assert.throws(() => global.UI.text(container, { variant: "nope", content: "X" }), /variant/);
});
