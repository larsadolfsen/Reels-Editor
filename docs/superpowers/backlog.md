# Backlog

Running list of things to do, picked one at a time. Add items as they come up (in any thread); check them off here once shipped and merged.

## To do

- [ ] Logo dot and REEL positioning — no spec/details yet, gather when picked up
- [ ] Font Family revision: finish development branch — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 14
- [ ] Move Color control into FONT accordion + shrink color swatch to 28x28px — no spec/details yet, gather when picked up
- [ ] Text Box component — spec + implementation plan ready, see [2026-07-17-text-box-design.md](specs/2026-07-17-text-box-design.md) and [2026-07-17-text-box.md](plans/2026-07-17-text-box.md)
- [ ] Video Box (picture-in-picture) component — needs its own brainstorming session first (see Background section of the Text Box spec above); ClipLayer has no position/size concept yet
- [ ] Captions Box component — blocked on captions having any real rendered layer at all (currently a non-functional placeholder); see Background section of the Text Box spec above
- [ ] Redesign safe-zone guide overlay for clarity — dashed lines/labels in `static/css/components/safe-zones.css` are hard to see against busy video content; needs higher-contrast styling (shaded bands, label chips, etc.), preview-only, no spec yet
- [ ] Accordion section spacing/divider — add bottom padding/margin to accordion body content (`static/css/components/accordion.css`), and move the divider from `border-top` to `border-bottom`; no spec/details yet, gather when picked up

## In progress (unmerged branches)

- [ ] Text Box component, Tasks 1-2 (Pillow/fontTools dependency, `TextPreset` box fields + migration) — done on branch `worktree-agent-ad9ff1e3b3843519e`, **not merged**: `app/ass_render.py` still reads the removed `p.box`/`p.box_color`, so merging alone breaks `pytest` (5 failures in `test_ass_render.py`) until [2026-07-17-text-box.md](plans/2026-07-17-text-box.md) Tasks 4-5 rewrite `_style()`. Pick up by continuing that plan from Task 3.

## Done

- [x] Font Family row: two stacked lines (label above, value+chevron below) — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 7
- [x] Font Family drill-down header: align with `#style-panel-collapse-toggle` — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 8
- [x] Divider between FONT and MISC accordion content — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 12
- [x] Font list rows: replace Apply-button flow with hover-to-preview + click-to-save — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 9
- [x] Font list: checkmark on applied font, pinned to top of list — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 10
- [x] Font list row background: transparent at rest, lighter grey on hover only — see [2026-07-17-font-family-drilldown-design.md](specs/2026-07-17-font-family-drilldown-design.md), task 11
- [x] `UI.resizeHandles` component (Text Box plan Task 6) — see [2026-07-17-text-box.md](plans/2026-07-17-text-box.md)
