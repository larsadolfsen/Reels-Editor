# Major Plan Revision — Design

**Status:** planning. This spec revises the project's remaining roadmap and the *process* used to plan and execute it. Phases that have been brainstormed in full get their implementation plan written immediately (not deferred) — see Process Rules and Phase Order below for which phases that applies to now.

## Why

The original [2026-07-09-first-reel.md](../plans/2026-07-09-first-reel.md) plan (Tasks 1–12) is largely superseded. A lot of side work (font accordion, text box, safe zones, media library, etc.) landed ad hoc between its tasks, and Task 8 (savable presets) was never finished. The user has learned two things running this process so far:

1. They need to **see visual, functional progress between phases** before the next phase starts — not just green tests. A feature isn't done if the backend is wired but there's no UI, or vice versa.
2. Plans need **smaller tasks**, sized so independent pieces (one `UI.*` component, one CSS file, one backend field, one service) can be handed to separate subagents running in parallel worktrees, rather than one long sequential task list.

This spec sets that process, then lays out the phase order and scope for the remaining roadmap.

## Process Rules

These rules govern every future plan derived from this roadmap (not just the phases below):

- **Phase** = a chunk of the roadmap (e.g. "Captions"). A phase ends with a mandatory visual-review checkpoint: the app running, the feature fully wired end-to-end (backend + UI), reviewed live in the browser before the next phase starts.
- **Brainstorm each phase in full, then write its implementation plan immediately** — the plan is not deferred to a separate future session. Phases 1–3 have already been brainstormed this way: each has a depth doc (resolved decisions, subthread breakdown, flagged open technical risks) and, once ready to execute, a real implementation plan under `docs/superpowers/plans/`. Phases 4–5 haven't been brainstormed yet — when picked up, they get the same full brainstorm-then-plan treatment before any code is written, since Phase 4 (Video Box) in particular has no existing design to check against.
- If a phase is picked up materially later than when its depth doc/plan were written, re-verify the plan against the codebase's actual state first (things may have shifted) — but that's a verification pass, not a reason to start over from a blank page.
- **Task** = one component or service within a phase: one `UI.*` JS component, one CSS component file, one backend model/route change, one ASS-render addition, one service module. Small enough to hand to a single worktree subagent in one sitting.
- **Parallelize independent tasks.** Tasks within a phase's plan that don't touch the same files/state are flagged "parallel-safe" and run via `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development`, each in its own worktree, merged back before the phase's visual checkpoint.
- **No half-wired features.** A task isn't "done" if it adds a backend field with no UI control, or a UI control with no backend wiring. Every task lands with something functional and visible, even if it's one small piece of a bigger phase.

## Phase Order

Each phase has its own depth doc with the full subthread breakdown; this section is just a summary and pointer.

### Phase 1: Text styling complete — [depth doc](2026-07-17-phase-1-text-styling-complete-design.md) · [plan](../plans/2026-07-17-phase-1-text-styling-complete.md)

Finishes **every** whole-block text-styling feature in one phase, so rich-text (Phase 2) has a stable, fully-wired foundation instead of overlapping with in-flight panel changes. Merges what was originally two separate phases (Text Box finish, then a separate accordion restructure) into one. Covers: closing out the existing Text Box plan (`CLAUDE.md` docs), drag-to-reposition the box, splitting FONT/MISC into five accordions (FONT, STYLE with saved presets, BOX, POSITION, TIME), and replacing the side-panel heading textarea with inline on-stage editing (plain text only, no rich formatting yet).

### Phase 2: Rich-text formatting — [depth doc](2026-07-17-phase-2-rich-text-formatting-design.md)

Split out of Phase 1 into its own phase because it's a materially bigger, riskier unit of work. Lets FONT properties (including a new highlight — background behind glyphs) vary per selected range of text within a block, instead of one flat style per block. Carries real open technical risk (word-wrap with mixed run widths, multi-line highlight rendering) flagged explicitly in its depth doc rather than glossed over.

### Phase 3: Captions — [depth doc](2026-07-17-phase-3-captions-design.md)

Replaces the non-functional placeholder panel with real, functional captions: transcription (faster-whisper), a caption list subpanel with timestamps, reuse of Phase 1's FONT/STYLE/BOX/POSITION accordions (no TIME — already timestamped) and Phase 2's per-range highlight mechanism (driven by playback time instead of a user selection, for the current-word-only vs progressive-fill karaoke modes), and preview+export rendering. Revives the original plan's Tasks 10–12.

### Phase 4: Video Box — [depth doc](2026-07-17-phase-4-video-box-design.md)

Picture-in-picture clip layer. `ClipLayer` has no position/size concept yet, so this phase's first step is its own full brainstorming session to design that data model — not a verification pass like Phases 1–3, since there's no existing design to check against. Deferred until Phases 1–3 are done.

### Phase 5: Export polish — [depth doc](2026-07-17-phase-5-export-polish-design.md)

Final pass once all layer types (text, captions, video box) are functional: preview/export parity spot-checks per layer type, cleanup of known limitations from the original plan (audio-stream requirement, clip-join hiccup), and whole-milestone end-to-end verification.

## Out of scope for this spec

- Full step-by-step implementation plans for Phases 3–5 — those get written when each phase's own brainstorm completes, following the same immediate-plan-writing rule Phase 1 followed (see Process Rules). Phase 1's plan already exists (linked above); Phase 2's is next once Phase 1 ships.
- The Video Box data model — deferred to Phase 4's brainstorm, including its subthread breakdown (its depth doc intentionally has none yet, unlike Phases 1–3).
- Backlog items already tracked independently (logo/REEL positioning, safe-zone contrast, divider component, etc.) — unaffected by this revision, still tracked in `docs/superpowers/backlog.md`.
