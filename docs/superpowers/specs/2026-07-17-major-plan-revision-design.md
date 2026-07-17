# Major Plan Revision — Design

**Status:** planning only. This spec revises the project's remaining roadmap and the *process* used to plan and execute it. It does not implement anything; each phase below gets its own brainstorming session and implementation plan when picked up (see Process Rules).

## Why

The original [2026-07-09-first-reel.md](../plans/2026-07-09-first-reel.md) plan (Tasks 1–12) is largely superseded. A lot of side work (font accordion, text box, safe zones, media library, etc.) landed ad hoc between its tasks, and Task 8 (savable presets) was never finished. The user has learned two things running this process so far:

1. They need to **see visual, functional progress between phases** before the next phase starts — not just green tests. A feature isn't done if the backend is wired but there's no UI, or vice versa.
2. Plans need **smaller tasks**, sized so independent pieces (one `UI.*` component, one CSS file, one backend field, one service) can be handed to separate subagents running in parallel worktrees, rather than one long sequential task list.

This spec sets that process, then lays out the phase order and scope for the remaining roadmap.

## Process Rules

These rules govern every future plan derived from this roadmap (not just the phases below):

- **Phase** = a chunk of the roadmap (e.g. "Captions"). A phase ends with a mandatory visual-review checkpoint: the app running, the feature fully wired end-to-end (backend + UI), reviewed live in the browser before the next phase starts.
- **Brainstorm before every phase.** Each phase gets its own `superpowers:brainstorming` session immediately before its implementation plan is written. Phases 1–3 already have a dedicated depth doc with a subthread breakdown (linked below) — the brainstorm's job is to **verify that breakdown still holds** against the codebase's actual state at pickup time (things may have shifted since this spec was written) and refine it, not to originate it from a blank page. Phases 4–5 have thinner docs and need a fuller brainstorm, since Phase 4 in particular has no existing design to check against.
- **Task** = one component or service within a phase: one `UI.*` JS component, one CSS component file, one backend model/route change, one ASS-render addition, one service module. Small enough to hand to a single worktree subagent in one sitting.
- **Parallelize independent tasks.** Tasks within a phase's plan that don't touch the same files/state are flagged "parallel-safe" and run via `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development`, each in its own worktree, merged back before the phase's visual checkpoint.
- **No half-wired features.** A task isn't "done" if it adds a backend field with no UI control, or a UI control with no backend wiring. Every task lands with something functional and visible, even if it's one small piece of a bigger phase.

## Phase Order

Each phase has its own depth doc with the full subthread breakdown; this section is just a summary and pointer.

### Phase 1: Text Box finish — [depth doc](2026-07-17-phase-1-text-box-finish-design.md)

Tasks 1–11 of the existing [2026-07-17-text-box.md](../plans/2026-07-17-text-box.md) plan are done and merged (model fields, ASS box rendering, BOX accordion, browser preview rendering, resize handles). Remaining: that plan's Task 12 (docs) and Task 13 (verification + finish-branch), plus a new requirement — **drag-to-reposition the box** on the stage (the existing plan explicitly deferred body-drag to a fast-follow, resize-only for now).

### Phase 2: Text panel accordion restructure — [depth doc](2026-07-17-phase-2-accordion-restructure-design.md)

Split the current FONT/MISC accordions into six: **FONT** (family + size/weight/italic/underline/color/outline + new highlight toggle/color), **STYLE** (saved presets, revives the original plan's never-built Task 8), **BOX** (already built in Phase 1), **POSITION**, **TIME**. Also adds **inline text editing** — clicking directly into the text block on the stage to edit in place. Built with an eye toward reuse by Phase 3.

### Phase 3: Captions — [depth doc](2026-07-17-phase-3-captions-design.md)

Replaces the non-functional placeholder panel with real, functional captions: transcription (faster-whisper), a caption list subpanel with timestamps, reuse of Phase 2's FONT/STYLE/BOX/POSITION accordions (no TIME — already timestamped), a HIGHLIGHT accordion with a current-word-only vs progressive-fill karaoke mode toggle, and preview+export rendering. Revives the original plan's Tasks 10–12.

### Phase 4: Video Box — [depth doc](2026-07-17-phase-4-video-box-design.md)

Picture-in-picture clip layer. `ClipLayer` has no position/size concept yet, so this phase's first step is its own full brainstorming session to design that data model — not a verification pass like Phases 1–3, since there's no existing design to check against. Deferred until Phases 1–3 are done.

### Phase 5: Export polish — [depth doc](2026-07-17-phase-5-export-polish-design.md)

Final pass once all layer types (text, captions, video box) are functional: preview/export parity spot-checks per layer type, cleanup of known limitations from the original plan (audio-stream requirement, clip-join hiccup), and whole-milestone end-to-end verification.

## Out of scope for this spec

- Full step-by-step implementation plans (test code, exact diffs) for any phase — each phase's own brainstorming session produces that, starting from the subthread breakdown already in `docs/superpowers/backlog.md` and verifying it still holds (see Process Rules).
- The Video Box data model — deferred to Phase 4's brainstorm, including its subthread breakdown (nothing is listed in the backlog for Phase 4 yet, unlike Phases 1–3).
- Backlog items already tracked independently (logo/REEL positioning, safe-zone contrast, divider component, etc.) — unaffected by this revision, still tracked in `docs/superpowers/backlog.md`.
