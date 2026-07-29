# Batch 1 — Tokens & CSS Primitives

> Part of the [UI Component Consistency master plan](2026-07-29-ui-component-consistency-master.md).
> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add a type scale, radius scale, and two color/shadow tokens to `tokens.css`; fix the
`--danger` dark-mode bug; migrate every hardcoded `font-size`/radius/tint/chip-shadow literal to
the new tokens; add `.chip` and `.scroll-list` shared classes.

## Global Constraints

See the [master plan](2026-07-29-ui-component-consistency-master.md#global-constraints) — all
constraints there apply to every task below.

## Task 1: Add the token set to `tokens.css`

**Files:**
- Modify: `static/css/tokens.css`

**Interfaces:**
- Produces: `--fs-2xs` (9px), `--fs-xs` (10.5px), `--fs-sm` (11px), `--fs-md` (12.5px), `--fs-lg`
  (14px), `--fs-xl` (16px), `--fs-2xl` (20px); `--ls-tight` (0.03em), `--ls-wide` (0.05em),
  `--ls-wider` (0.06em); `--radius-sm` (3px), `--radius-md` (4px), `--radius-lg` (6px),
  `--radius-pill` (999px); `--accent-tint` (rgba(108,135,163,0.12)); `--shadow-chip`
  (0 4px 10px rgba(0,0,0,0.4)); `--danger` moved into base `:root`.
- Consumed by: every later task in this plan.

- [ ] **Step 1: Add the tokens**

Open `static/css/tokens.css`. In the base `:root` block (after `--border-hover-color`, before
the closing `}` at line 39), add:

```css
  --fs-2xs: 9px;
  --fs-xs: 10.5px;
  --fs-sm: 11px;
  --fs-md: 12.5px;
  --fs-lg: 14px;
  --fs-xl: 16px;
  --fs-2xl: 20px;

  --ls-tight: 0.03em;
  --ls-wide: 0.05em;
  --ls-wider: 0.06em;

  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-pill: 999px;

  --accent-tint: rgba(108, 135, 163, 0.12);
  --shadow-chip: 0 4px 10px rgba(0, 0, 0, 0.4);

  --danger: #E5484D;
```

Then remove the now-duplicate `--danger: #E5484D;` line from the `:root[data-theme="light"]`
block (currently line 57) — light mode no longer needs its own copy since red doesn't change
between themes. Also remove the now-unused base `--radius: 0px;` declaration (line 35) and its
consumers will be repointed to the new scale in Task 2.

- [ ] **Step 2: Verify in the browser**

Start the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open the app, and
toggle dark/light mode via the theme toggle. Confirm no visual change yet (tokens exist but
nothing consumes them until Task 2) and no console errors.

- [ ] **Step 3: Commit**

```bash
git add static/css/tokens.css
git commit -m "feat: add type/radius/color token scale to tokens.css, fix dark-mode --danger"
```

## Task 2: Migrate every hardcoded `font-size`/radius/tint/chip-shadow literal to tokens

**Files:**
- Modify: every file listed below (grouped by the literal being replaced)

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: no new interface — this is a pure substitution task. Nothing later depends on new
  names, only on the substitution being complete.

This task is mechanical: replace each literal with its token, verify the value is unchanged
(same px/rgba), and move to the next file. Two literals are an *intentional* value change per
the spec — flag them in the commit message, don't treat them as bugs:
- `.timeline-block.selected`'s `rgba(108, 135, 163, 0.16)` → `var(--accent-tint)` (0.12) — drift fix.
- `.safe-zone span`'s `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45)` → `var(--shadow-chip)`
  (`0 4px 10px rgba(0,0,0,0.4)`) — drift fix.

- [ ] **Step 1: `font-size` substitution**

Run this to find every remaining literal after each edit, so you can confirm completion:

```bash
grep -rn "font-size: *[0-9]" static/css/
```

For each file below, replace every `font-size: Npx` with the matching token:

| Value | Token | Files (from the audit) |
| --- | --- | --- |
| 8px, 9px, 9.5px | `var(--fs-2xs)` | `save-indicator.css`, `icon-rail.css`, `safe-zones.css`, `style-panel.css` (`.style-field`, `.clip-usage-chip`, `.clip-info .clip-duration`), `auto-slice-panel.css` |
| 10px, 10.5px | `var(--fs-xs)` | `panel.css`, `accordion.css`, `button-group.css` (`.btn-group button`), `style-panel.css` (`.style-panel-header`, `.style-group-label`, `.clip-section-label`, `.style-checkbox`), `project-list-row.css`, `settings-row.css`, `sub-panel.css` |
| 11px, 11.5px | `var(--fs-sm)` | `base.css`, `button.css`, `panel-button.css`, `style-panel.css` (`#add-clip`), `timeline.css`, `auto-slice-panel.css`, `stage.css` |
| 12px, 12.5px, 13px | `var(--fs-md)` | `button-group.css` (`.icon-btn`), `login.css`, `project-list-row.css`, `project-picker.css`, `style-panel.css` (`.context-panel-name`, `.caption-preview-box`), `style-save-form.css`, `style-preset-card.css`, `base.css` |
| 14px | `var(--fs-lg)` | `color-swatch.css`, `login.css`, `style-panel.css` (`.style-field input[type=number]`), `timeline.css` |
| 16px | `var(--fs-xl)` | `login.css`, `settings-row.css`, `sub-panel.css` |
| 20px | `var(--fs-2xl)` | `sub-panel.css` |

- [ ] **Step 2: `border-radius` substitution**

```bash
grep -rn "border-radius: *[0-9]" static/css/
```

| Value | Token | Files |
| --- | --- | --- |
| 2px | `var(--radius-sm)` — nearest step down, visually negligible on a 2px input border | `style-panel.css` (`.clip-name-input`) |
| 3px | `var(--radius-sm)` | `timeline.css` (`.timeline-block`), `style-panel.css` (`.clip-thumb`), `list-row.css`, `export-progress.css`, `safe-zones.css` (`.safe-zone span`), `auto-slice-panel.css` (`.auto-slice-badge`) |
| 4px | `var(--radius-md)` | `button-group.css` (`.btn-group button`, `.icon-btn`), `settings-row.css` (swatch), `timeline.css` (`.row-add-btn`) |
| 6px | `var(--radius-lg)` | `color-swatch.css`, `number-field.css` (stepper), `style-panel.css` (`.style-field input[type=number]`, `.caption-preview-box`) |
| 8px (pill) | `var(--radius-pill)` | `style-panel.css` (`.clip-usage-chip`) — will be superseded by `.chip` in Task 3, but tokenize now for correctness in the interim |

Also delete the now-orphaned hardcoded `border-radius: 4px` in `button.css` and
`button-group.css` if `--radius` was the only thing referencing them — replace with
`var(--radius-md)` directly (Batch 3 will replace these files wholesale, but keep this batch
internally consistent in the meantime).

- [ ] **Step 3: `--accent-tint` substitution**

```bash
grep -rn "rgba(108, 135, 163" static/css/
```

Replace all three verbatim occurrences (`button-group.css`'s `.btn-group button[aria-pressed]`
and `.icon-btn[aria-pressed]`, `icon-rail.css`'s `.icon-rail-btn[aria-pressed]`) with
`var(--accent-tint)`, and `timeline.css`'s `.timeline-block.selected` (currently at `0.16`) also
with `var(--accent-tint)` — this is the drift-fix visual change.

- [ ] **Step 4: `--shadow-chip` substitution**

```bash
grep -rn "box-shadow: 0 4px 10px\|box-shadow: 0 2px 8px" static/css/
```

Replace `timeline.css`'s `.slice-btn` and `.timeline-block.dragging`, and `safe-zones.css`'s
`.safe-zone span` (currently `0 2px 8px rgba(0,0,0,0.45)` — the drift-fix), all with
`box-shadow: var(--shadow-chip);`.

- [ ] **Step 5: Verify nothing was missed**

```bash
grep -rn "font-size: *[0-9]\|border-radius: *[0-9]px\|rgba(108, 135, 163\|box-shadow: 0 4px 10px rgba\|box-shadow: 0 2px 8px rgba" static/css/
```

Expected: no output (empty). Any remaining match is a literal you missed.

- [ ] **Step 6: Manual browser verification**

Start the server, open the app, and visually compare the timeline's selected-clip highlight and
the safe-zone toggle's chip labels before/after (both should look nearly identical — a very
subtle alpha shift, not a color or layout change). Check dark and light theme. Check no layout
shift from the ≤1px font-size scale merges (spot-check TEXT panel, CAPTIONS panel, timeline
labels).

- [ ] **Step 7: Commit**

```bash
git add static/css/
git commit -m "refactor: migrate font-size/radius/accent-tint/chip-shadow literals to tokens"
```

## Task 3: Add `.chip` and migrate the three chip/badge recipes

**Files:**
- Create: `static/css/components/chip.css`
- Modify: `static/index.html` (link the new stylesheet)
- Modify: `static/css/components/style-panel.css` (remove `.clip-usage-chip`)
- Modify: `static/css/components/auto-slice-panel.css` (remove `.auto-slice-badge`, or repoint
  its base styles to `.chip` while keeping its color modifiers)
- Modify: `static/css/components/safe-zones.css` (remove `.safe-zone span`'s box-model styling,
  keep only what's unique to a safe-zone label)
- Modify: `static/panel-media.js` (uses `.clip-usage-chip` — grep confirms this is the only JS
  consumer)
- Modify: `static/panel-auto-slice.js` (uses `.auto-slice-badge`)

**Interfaces:**
- Produces: `.chip` (base: inline-flex, `var(--radius-sm)`, `var(--bg-1)` background,
  `var(--border-soft)` border, `var(--fs-2xs)` font, `var(--text-dim)` color), `.chip--pill`
  (rounds to `var(--radius-pill)`, for the usage-count badge), `.chip--outlined` (adds
  `var(--surface)` background + `var(--border)` border + `var(--shadow-chip)`, for the
  safe-zone label), `.chip--tinted-{ok,warn,danger}` (auto-slice's color-coded modifiers —
  confirm exact modifier names by reading `auto-slice-panel.css`'s current `.auto-slice-badge`
  variants before writing this file).

- [ ] **Step 1: Read the three source recipes**

```bash
grep -n "clip-usage-chip" -A8 static/css/components/style-panel.css
grep -n "auto-slice-badge" -A15 static/css/components/auto-slice-panel.css
grep -n "safe-zone span" -A15 static/css/components/safe-zones.css
```

Note every property each one sets so the merged `.chip` doesn't drop anything (e.g. the
safe-zone chip's `border-left: 3px solid var(--safe-zone)` accent bar and `text-transform:
uppercase` are unique to it and become a `.chip--safe-zone` modifier, not part of the base).

- [ ] **Step 2: Write `chip.css`**

```css
/* Shared small-labeled-chip component: usage counts, status badges, safe-zone labels. */
/* Exposes .chip + .chip--pill/.chip--outlined/.chip--safe-zone/.chip--{ok,warn,danger} modifiers. Depends on tokens.css. */
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border-soft);
  color: var(--text-dim);
  font-family: var(--font-ui);
  font-size: var(--fs-2xs);
  line-height: 1;
}

.chip--pill {
  min-width: 16px;
  border-radius: var(--radius-pill);
}

.chip--outlined {
  height: auto;
  padding: 3px 7px;
  background: var(--surface);
  border-color: var(--border);
  box-shadow: var(--shadow-chip);
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: var(--ls-wide);
  text-transform: uppercase;
  border-radius: var(--radius-sm);
}

.chip--safe-zone { border-left: 3px solid var(--safe-zone); }
```

(Add `.chip--ok`/`.chip--warn`/`.chip--danger` color modifiers matching whatever
`.auto-slice-badge`'s current variants set, once Step 1's grep output is in hand — copy their
exact `color`/`background`/`border-color` values verbatim, just renamed.)

- [ ] **Step 3: Link the stylesheet**

In `static/index.html`, add `<link rel="stylesheet" href="/static/css/components/chip.css">`
next to the other component stylesheet links (after `list-row.css` per the existing "list-row
first" convention doesn't apply here — chip has no cascade-order dependency, add it alphabetically
near `button-group.css`).

- [ ] **Step 4: Migrate `.clip-usage-chip`**

In `static/panel-media.js`, find where `.clip-usage-chip` is applied (`classList.add` or
template string) and change it to `chip.classList.add("chip", "chip--pill")`. Remove the
`.clip-usage-chip` rule block from `style-panel.css`.

- [ ] **Step 5: Migrate `.auto-slice-badge`**

In `static/panel-auto-slice.js`, change `.auto-slice-badge` (plus whatever color-modifier class
it also applies) to `.chip` plus the matching `.chip--{ok,warn,danger}` modifier. Remove
`.auto-slice-badge` and its modifiers from `auto-slice-panel.css`.

- [ ] **Step 6: Migrate the safe-zone chip**

In `static/css/components/safe-zones.css`, change `.safe-zone span` to only keep what's unique
to it (the `border-left` accent, if not folded into `.chip--safe-zone` already) and change the
markup in `static/index.html`'s four `.safe-zone` `<span>` elements to
`class="chip chip--outlined chip--safe-zone"`.

- [ ] **Step 7: Manual browser verification**

Load a project with clips used in the sequence (usage chip visible in FILES panel), run
auto-slice detection (badge visible), and toggle safe zones (label chips visible). All three
should look visually identical to before this task, aside from the shadow/tint drift already
accepted in Task 2.

- [ ] **Step 8: Commit**

```bash
git add static/css/components/chip.css static/index.html static/css/components/style-panel.css static/css/components/auto-slice-panel.css static/css/components/safe-zones.css static/panel-media.js static/panel-auto-slice.js
git commit -m "feat: add shared .chip component, retire .clip-usage-chip/.auto-slice-badge/safe-zone-span recipes"
```

## Task 4: Add `.scroll-list` and migrate the triplicated 320px rule

**Files:**
- Create: `static/css/components/scroll-list.css`
- Modify: `static/index.html` (link stylesheet; add `.scroll-list` class to the three lists)
- Modify: `static/css/components/video-box-panel.css` (remove the `max-height`/`overflow-y` rule
  from `#video-box-picker-list`)
- Modify: `static/css/components/image-box-panel.css` (remove the same from
  `#image-box-picker-list`)
- Modify: `static/css/components/auto-slice-panel.css` (remove the same from `.auto-slice-list`)

**Interfaces:**
- Produces: `.scroll-list { max-height: 320px; overflow-y: auto; }`.

- [ ] **Step 1: Write `scroll-list.css`**

```css
/* Shared scrollable-list-inside-a-panel utility, used by any picker/results list capped to a fixed height. */
/* Exposes .scroll-list. No dependencies. */
.scroll-list {
  max-height: 320px;
  overflow-y: auto;
}
```

- [ ] **Step 2: Link and apply**

Add the stylesheet link in `static/index.html`. Add `class="scroll-list"` (merged with each
element's existing classes) to `#video-box-picker-list`, `#image-box-picker-list`, and
`.auto-slice-list`'s element in `index.html`. Remove the `max-height`/`overflow-y` declarations
from the three component CSS files.

- [ ] **Step 3: Verify**

```bash
grep -rn "max-height: 320px" static/css/
```

Expected: no output — the rule now lives in exactly one place.

Open the VIDEO BOX panel's add-picker, the IMAGE BOX panel's add-picker, and the AUTO SLICE
results list in the browser; each should still scroll and cap at the same height as before.

- [ ] **Step 4: Commit**

```bash
git add static/css/components/scroll-list.css static/index.html static/css/components/video-box-panel.css static/css/components/image-box-panel.css static/css/components/auto-slice-panel.css
git commit -m "feat: add shared .scroll-list utility, retire triplicated 320px max-height rule"
```

## Batch 1 Definition of Done

- [ ] All four tasks committed individually.
- [ ] `grep -rn "font-size: *[0-9]\|border-radius: *[0-9]px" static/css/` returns nothing.
- [ ] `grep -rn "rgba(108, 135, 163\|max-height: 320px" static/` returns nothing.
- [ ] `node --test "tests/js/**/*.test.js"` passes (no JS logic changed in this batch, so this
  should already be green — run it to confirm nothing broke).
- [ ] Master plan's batch table updated: Batch 1 → "done".
