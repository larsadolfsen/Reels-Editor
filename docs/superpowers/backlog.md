# Backlog

Running list of things to do, picked one at a time. Add items as they come up (in any thread); check them off here once shipped and merged.

## To do

Major roadmap revised — see [2026-07-17-major-plan-revision-design.md](specs/2026-07-17-major-plan-revision-design.md) for process rules (brainstorm before every phase, small parallel-worktree tasks, visual checkpoint per phase) and full phase detail. Phases below, in order:

- [ ] **Phase 1 — Text Box finish:** Tasks 1-11 done/merged (model fields, ASS box rendering, BOX accordion, preview rendering, resize handles); remaining: CLAUDE.md inventory update (Task 12), end-to-end export verification + finish branch (Task 13, needs ffmpeg on PATH), plus new requirement **drag-to-reposition the box** (not in the existing plan, which deferred body-drag to resize-only); see [2026-07-17-text-box-design.md](specs/2026-07-17-text-box-design.md) and [2026-07-17-text-box.md](plans/2026-07-17-text-box.md); needs its own brainstorm before planning the drag feature
- [ ] **Phase 2 — Text panel accordion restructure:** split FONT/MISC into six accordions — FONT (family, size, weight/italic/underline, color, outline, highlight toggle+color), STYLE (saved presets — save/list/apply, revives original plan's Task 8), BOX (toggle, color, border/radius, drag+resize), POSITION, TIME; plus inline text editing (click directly into the text block on the stage to edit in place); components built with an eye to reuse by Phase 3; needs its own brainstorm before planning
- [ ] **Phase 3 — Captions:** replace placeholder panel with real transcription-backed captions; caption list subpanel (drill-down, timestamps, inline edit); reuse Phase 2's FONT/STYLE/BOX/POSITION accordions (no TIME — already timestamped); HIGHLIGHT with a mode toggle (current-word-only vs progressive-fill karaoke); preview+export rendering; revives original plan's Tasks 10-12; needs its own brainstorm before planning
- [ ] **Phase 4 — Video Box (picture-in-picture):** needs its own brainstorming session first — `ClipLayer` has no position/size concept yet
- [ ] **Phase 5 — Export polish:** preview/export parity spot-checks across all layer types, clean up known limitations (audio-stream requirement, clip-join hiccup), whole-milestone end-to-end verification; needs its own brainstorm before planning
- [ ] Logo dot and REEL positioning — no spec/details yet, gather when picked up
- [ ] Move Color control into FONT accordion + shrink color swatch to 28x28px — no spec/details yet, gather when picked up; largely superseded by Phase 2's accordion restructure above, but keep until Phase 2 is picked up
- [ ] Redesign safe-zone guide overlay for clarity — dashed lines/labels in `static/css/components/safe-zones.css` are hard to see against busy video content; needs higher-contrast styling (shaded bands, label chips, etc.), preview-only, no spec yet
- [ ] Accordion section spacing/divider — add bottom padding/margin to accordion body content (`static/css/components/accordion.css`), and move the divider from `border-top` to `border-bottom`; no spec/details yet, gather when picked up

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
