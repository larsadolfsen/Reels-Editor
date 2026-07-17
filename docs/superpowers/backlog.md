# Backlog

Running list of things to do, picked one at a time. Add items as they come up (in any thread); check them off here once shipped and merged.

## To do

Major roadmap revised — see [2026-07-17-major-plan-revision-design.md](specs/2026-07-17-major-plan-revision-design.md) for process rules (brainstorm before every phase, small parallel-worktree tasks, visual checkpoint per phase). Each phase has its own depth doc with the full subthread breakdown (parallel-safe vs sequential, files touched, open questions) — pick up a phase by reading its doc, verifying the breakdown still holds, then brainstorming any open questions before writing the plan.

- [ ] **Phase 1 — Text Box finish** — [depth doc](specs/2026-07-17-phase-1-text-box-finish-design.md): Task 13 (verification) done, found+fixed two real export bugs along the way (see Done below); remaining: Task 12 (`CLAUDE.md` docs, a prior dispatch for it was stopped mid-way) and the drag-to-reposition subthread (brainstormed in full, ready to plan)
- [ ] **Phase 2 — Text panel accordion restructure** — [depth doc](specs/2026-07-17-phase-2-accordion-restructure-design.md): five accordions (FONT/STYLE/BOX/POSITION/TIME, whole-block styling only), saved presets, inline stage text editing (replaces the side-panel textarea entirely)
- [ ] **Phase 3 — Rich-text formatting** — [depth doc](specs/2026-07-17-phase-3-rich-text-formatting-design.md): per-selection FONT formatting incl. highlight; split out of Phase 2 as its own phase, carries real open technical risk (word-wrap with mixed run widths, multi-line highlight) flagged in the doc
- [ ] **Phase 4 — Captions** — [depth doc](specs/2026-07-17-phase-4-captions-design.md): real transcription-backed captions reusing Phase 2's accordions and Phase 3's highlight mechanism, caption list subpanel, karaoke highlight modes
- [ ] **Phase 5 — Video Box (picture-in-picture)** — [depth doc](specs/2026-07-17-phase-5-video-box-design.md): needs a full brainstorm first, `ClipLayer` has no position/size concept yet
- [ ] **Phase 6 — Export polish** — [depth doc](specs/2026-07-17-phase-6-export-polish-design.md): parity spot-checks, known-limitation cleanup, whole-milestone verification
- [ ] Logo dot and REEL positioning — no spec/details yet, gather when picked up
- [ ] Move Color control into FONT accordion + shrink color swatch to 28x28px — no spec/details yet, gather when picked up; largely superseded by Phase 2's accordion restructure above, but keep until Phase 2 is picked up
- [ ] Redesign safe-zone guide overlay for clarity — dashed lines/labels in `static/css/components/safe-zones.css` are hard to see against busy video content; needs higher-contrast styling (shaded bands, label chips, etc.), preview-only, no spec yet
- [ ] Accordion section spacing/divider — add bottom padding/margin to accordion body content (`static/css/components/accordion.css`), and move the divider from `border-top` to `border-bottom`; no spec/details yet, gather when picked up
- [ ] Accordion header label (e.g. "FONT") not vertically centered in its row — needs vertical-align/line-height fix, no spec/details yet, gather when picked up
- [ ] BOX accordion: remove the checkmark, set background to transparent by default — no spec/details yet, gather when picked up

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
