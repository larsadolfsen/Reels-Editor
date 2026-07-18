# Backlog

Running list of things to do, picked one at a time. Add items as they come up (in any thread); check them off here once shipped and merged.

## To do

Major roadmap revised — see [2026-07-17-major-plan-revision-design.md](specs/2026-07-17-major-plan-revision-design.md) for process rules (full brainstorm then immediate plan per phase, small parallel-worktree tasks, visual checkpoint per phase). Each brainstormed phase has a depth doc and (once ready) a real implementation plan under `plans/` — pick up a phase by reading its doc/plan directly.

- [ ] **Phase 1 — Text styling complete** — [depth doc](specs/2026-07-17-phase-1-text-styling-complete-design.md) · [plan](plans/2026-07-17-phase-1-text-styling-complete.md): finishes the Text Box plan's Task 12 (`CLAUDE.md` docs), drag-to-reposition, and the full five-accordion restructure (FONT/STYLE/BOX/POSITION/TIME) with saved presets and inline stage text editing (replaces the side-panel textarea entirely) — all whole-block text styling in one phase, ready to execute
- [ ] **Phase 2 — Rich-text formatting** — [depth doc](specs/2026-07-17-phase-2-rich-text-formatting-design.md): per-selection FONT formatting incl. highlight; split out of Phase 1 as its own phase, carries real open technical risk (word-wrap with mixed run widths, multi-line highlight) flagged in the doc; brainstormed, plan not yet written (write it when Phase 1 ships)
- [ ] **Phase 3 — Captions** — [depth doc](specs/2026-07-17-phase-3-captions-design.md): real transcription-backed captions reusing Phase 1's accordions and Phase 2's highlight mechanism, caption list subpanel, karaoke highlight modes; one open question flagged in the doc to resolve before planning
- [ ] **Phase 4 — Video Box (picture-in-picture)** — [depth doc](specs/2026-07-17-phase-4-video-box-design.md): needs a full brainstorm first, `ClipLayer` has no position/size concept yet
- [ ] **Phase 5 — Export polish** — [depth doc](specs/2026-07-17-phase-5-export-polish-design.md): parity spot-checks, known-limitation cleanup, whole-milestone verification
- [ ] Redesign safe-zone guide overlay for clarity — dashed lines/labels in `static/css/components/safe-zones.css` are hard to see against busy video content; needs higher-contrast styling (shaded bands, label chips, etc.), preview-only, no spec yet

## Done

- [x] Font Family row: two stacked lines (label above, value+chevron below) — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 7
- [x] Font Family drill-down header: align with `#style-panel-collapse-toggle` — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 8
- [x] Divider between FONT and MISC accordion content — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 12
- [x] Font list rows: replace Apply-button flow with hover-to-preview + click-to-save — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 9
- [x] Font list: checkmark on applied font, pinned to top of list — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 10
- [x] Font list row background: transparent at rest, lighter grey on hover only — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 11
- [x] `UI.resizeHandles` component (Text Box plan Task 6) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md)
- [x] Font Family revision: manual verification in browser — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 13
- [x] Text Box component, Tasks 1-5 (Pillow/fontTools dep, `TextPreset` box fields + migration, word-wrap, ASS rounded-rect box rendering) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); merged, `pytest -q` green (40 passed)
- [x] Text Box component, Tasks 7-11 (BOX accordion markup/wiring, `preview.js` box CSS rendering, stage resize handles) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); merged, verified live in browser
- [x] `UI.divider` component, extracted from one-off `.style-divider` CSS, used for the VIDEO/TEXT panel dividers and between Font Family drill-down rows — see `static/ui-divider.js`
- [x] Text Box component, Task 13 (end-to-end verification) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); `pytest -q` green (43 passed). Found and fixed two real bugs along the way: export never wired ASS rendering into ffmpeg at all (no text/box/captions ever burned into any export, unrelated to Text Box specifically), and the box dialogue referenced a non-existent ASS style causing a position offset in export vs. preview — both confirmed fixed via a real export + frame extraction, see [2026-07-17-text-box-design.md](specs/2026-07-17-text-box-design.md)'s Open questions section
- [x] Accordion header label vertical centering + section spacing/divider — `line-height: 1` on `.accordion-header` (was inheriting a larger default, pushing text off-center); divider moved from the header's `border-top` to the body's `border-bottom` + `padding-bottom` for breathing room. Verified numerically (header text/row vertically centered to sub-pixel precision; all three TEXT-panel accordion bodies have the padding+border) — see `static/css/components/accordion.css`
- [x] Logo dot and REEL positioning — investigated, confirmed already correct: pixel-accurate match to the design-foundation mockup (dot's `border-radius: 2px` "rounded square" look, spacing, vertical alignment all intentional/as-designed). No change needed.
