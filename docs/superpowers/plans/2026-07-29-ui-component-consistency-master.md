# UI Component Consistency — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three parallel button idioms, 95 hand-inlined SVGs, zero typography tokens,
three duplicate chip recipes, and two hand-synced safe-zone geometries with one component each:
`UI.text`, `UI.icon`, `UI.button`, `UI.safeZones`, plus a real type/radius/color token set.

**Architecture:** Five batches, each its own plan file, executed strictly in order because
later batches consume earlier ones (buttons take icon names; everything consumes tokens).
Each batch is a token/CSS foundation task followed by one or more migration tasks that convert
existing hand-written markup to the new component, file group by file group.

**Tech Stack:** No build step — classic `<script>` tags sharing `window.UI`/`window.Timeline`-style
globals, exactly as the rest of `static/*.js` already works. Tests run via `node --test`.

## Global Constraints

(Copied verbatim from [the design spec](../specs/2026-07-29-ui-component-consistency-design.md).)

- No build step, bundler, or framework — classic scripts sharing `window.*` globals.
- No new icon set — only the ~40 icons already in use get extracted; Lucide stays the source for
  any future addition.
- No redesign — visual change is a consequence of merging duplicate recipes, not a goal itself.
- No refactoring unrelated to icons, buttons, typography, chips, scroll-lists, or safe zones.
- Every `static/*.js` and `static/css/**/*.css` file opens with a one/two-line header comment
  stating its purpose — new files must have one; edited files must have theirs kept current.
- No inline `style="..."` in `static/index.html` or JS-rendered markup — all styling via CSS
  classes.
- One function/component per file — no shared catch-all files (the icon path data living inside
  `ui-icon.js` is the one named exception, since it is that service's own payload).
- Every task ends with a commit and something visible/verifiable in the running app or test
  output before the next task starts.
- Update `CLAUDE.md`'s codebase map and inventory in the same commit as any file add/move/delete.
- `--danger` and the radius/accent-tint/shadow-chip fixes are **intentional visible changes**,
  not regressions — call them out during manual verification, don't "fix" them back.

## File Structure

New files this plan creates:

```
static/
  ui-text.js              # UI.text(container, {variant, content}) — eyebrow/label/hint/body
  ui-icon.js               # UI.icon(name, {size}) — inline SVG string, ~40 icons' path data inside
  ui-safe-zones.js          # UI.safeZones(container) — renders the 4 bands from one SAFE_ZONES array
  css/components/
    text.css                # .text-eyebrow/.text-label/.text-hint/.text-body
    chip.css                 # .chip + modifiers, replacing .clip-usage-chip/.auto-slice-badge/safe-zone chip
    scroll-list.css           # .scroll-list utility
    button.css                 # REPLACED: new UI.button component styles (old file's content retired)
tests/js/
  ui-icon.test.js
  ui-text.test.js
  ui-button.test.js
  ui-safe-zones.test.js
  no-raw-svg.test.js          # guard: no `<svg` literal remains in static/*.js after batch 2
  no-legacy-button-classes.test.js  # guard: no .panel-button/.icon-btn/.row-add-btn/.zoom-btn after batch 3
```

Files this plan deletes (at the end of their batch, once migration is verified):

```
static/css/components/panel-button.css   (batch 3, task 17)
static/ui-button.js's old variant-applier body (batch 3, task 14, replaced not deleted — same filename)
```

Files this plan modifies extensively (every CSS/JS file listed in the spec's audit tables —
enumerated per-task in each batch file, not repeated here).

## Batch Plans

1. [Batch 1 — Tokens & CSS primitives](2026-07-29-ui-component-consistency-batch1-tokens.md) — type
   scale, radius scale, `--accent-tint`, `--shadow-chip`, `--danger` fix, `.chip`, `.scroll-list`.
2. [Batch 1b — UI.text](2026-07-29-ui-component-consistency-batch1b-text.md)
3. [Batch 2 — UI.icon](2026-07-29-ui-component-consistency-batch2-icons.md)
4. [Batch 3 — UI.button](2026-07-29-ui-component-consistency-batch3-buttons.md)
5. [Batch 4 — UI.safeZones](2026-07-29-ui-component-consistency-batch4-safezones.md)

## Batch Status

Mark a batch's row "in progress" (and commit that marker) before starting its first task, per
session convention — so anyone looking at the branch can see which batch is underway.

| Batch | Status |
| --- | --- |
| 1 — Tokens & CSS primitives | done |
| 1b — UI.text | done |
| 2 — UI.icon | not started |
| 3 — UI.button | not started |
| 4 — UI.safeZones | not started |

## Verification (run once, at the very end, after all batches)

```bash
node --test "tests/js/**/*.test.js"
.venv/Scripts/python -m pytest -q
```

Both must pass with zero failures before this plan is considered done. Per-task verification
(described in each batch file) is a lighter, scoped check — this final pass is the one full-suite
run the orchestrating session does before declaring the whole plan complete.
