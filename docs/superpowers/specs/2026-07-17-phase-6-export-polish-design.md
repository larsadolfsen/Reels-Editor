# Phase 6 — Export Polish

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — final phase, picked up only after Phases 1–5 are functional; needs its own brainstorm at pickup time since its exact scope depends on what state those phases actually land in.

## Goal

A final pass across the whole editor once every layer type (text, text box, captions, video box) is functional: confirm preview and export agree, and clean up the known limitations accepted at the outset of this project.

## Likely subthreads (to confirm at pickup)

1. **Preview/export parity spot-check per layer type** — [parallel-safe per layer type]. One task per layer (text block + box, captions, video box): pause preview at several timestamps, compare against the corresponding exported frame, confirm position/size/color agree closely (per the original plan's accepted "visual-trust level, not pixel-perfect" bar).
2. **Clean up known limitations** — [parallel-safe per limitation, if still present]. From the original plan's "Known limitations" section:
   - Clips must have an audio stream (`concat` expects `v=1:a=1`) — decide whether to relax this (e.g. synthesize silent audio for video-only clips) or leave it documented.
   - Preview has a brief hiccup at clip joins (export is already seamless) — decide whether this is worth fixing or stays an accepted preview-only quirk.
   - Re-check whether any of these are already resolved by work done since the original plan (e.g. media library changes) before assuming they still apply.
3. **Whole-milestone end-to-end verification** — [sequential, last]. Assemble a real reel exercising every layer type (trimmed clips, a styled text block with a box and highlight, auto-generated and hand-edited captions with karaoke highlight, a video box), export, and watch it start to finish.

## Next step

When this phase is picked up: brainstorm to confirm which of the above still applies (some "known limitations" may already be moot by then) and whether new limitations surfaced during Phases 1–5 belong here too, then write the plan.
