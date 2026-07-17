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
- **Brainstorm before every phase.** Each phase gets its own `superpowers:brainstorming` session immediately before its implementation plan is written — confirming scope and details are still current, not just working off this document's summary.
- **Task** = one component or service within a phase: one `UI.*` JS component, one CSS component file, one backend model/route change, one ASS-render addition, one service module. Small enough to hand to a single worktree subagent in one sitting.
- **Parallelize independent tasks.** Tasks within a phase's plan that don't touch the same files/state are flagged "parallel-safe" and run via `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development`, each in its own worktree, merged back before the phase's visual checkpoint.
- **No half-wired features.** A task isn't "done" if it adds a backend field with no UI control, or a UI control with no backend wiring. Every task lands with something functional and visible, even if it's one small piece of a bigger phase.

## Phase Order

### Phase 1: Text Box finish

Tasks 1–11 of the existing [2026-07-17-text-box.md](../plans/2026-07-17-text-box.md) plan are done and merged (model fields, ASS box rendering, BOX accordion, browser preview rendering, resize handles). Remaining scope:

- Task 12 (`CLAUDE.md` inventory update) and Task 13 (end-to-end browser + export verification, finish-branch) from that plan
- **Drag-to-reposition the box** on the stage (new requirement, not in the existing plan — that plan explicitly deferred body-drag as "a fast-follow," resize-only for now). Clicking and dragging the box body moves its anchor/offset, distinct from the existing resize handles.

### Phase 2: Text panel accordion restructure

Split the current FONT/MISC accordions into six, each a self-contained accordion component with its own backing fields:

| Accordion | Contents |
|---|---|
| **FONT** | Font family (existing drill-down), size, weight/bold, italic, underline, color, outline color/width, **highlight toggle + color** (background behind the glyphs themselves — distinct from BOX, which is a separate container) |
| **STYLE** | Saved style presets — save current style as a named preset, list/apply saved presets. Revives the original plan's never-built Task 8 (`GET/POST /api/presets`) |
| **BOX** | Toggle, color, border/radius, drag + resize (see Phase 1) |
| **POSITION** | Text align + anchor grid + pixel offsets (current POSITION section, unchanged in content, just its own accordion) |
| **TIME** | Start/end seconds (current TIME section, unchanged in content, just its own accordion) |

Also in this phase: **inline text editing** — clicking directly into the text block on the video stage makes it editable in place (contenteditable overlay), instead of only editing via the side-panel textarea.

This phase's accordions and their `UI.*`/backend building blocks are built to be reused by Phase 3 (Captions), so component boundaries should be designed with that reuse in mind (e.g. a FONT-accordion component that isn't hardcoded to the text-block model shape).

### Phase 3: Captions

Replace the current non-functional placeholder (`#panel-captions`) with real, functional captions:

- Transcription (faster-whisper) producing timestamped `CaptionWord`s — revives the original plan's Task 10
- A **caption list subpanel** (drill-down, similar pattern to the font list) showing every caption word/line with its timestamps, editable inline — text and (later) timing
- Reuse the Phase 2 accordions and their components: **FONT, STYLE (presets), BOX, POSITION** — no **TIME** accordion, since captions are already timestamped by transcription, not manually set
- **HIGHLIGHT**, reused from FONT but with a caption-specific behavior: a mode toggle between **current word only** (single active word highlighted) and **progressive fill** (karaoke-style — all spoken words stay highlighted up to and including the current one)
- Preview + export rendering (karaoke `\k` tags in ASS, live highlight in the browser overlay) — revives the original plan's Task 12

### Phase 4: Video Box

Picture-in-picture clip layer. `ClipLayer` has no position/size concept yet, so this phase's first step is its own brainstorming session to design that data model — not code. Deferred until Phases 1–3 are done.

### Phase 5: Export polish

Final pass once all layer types (text, captions, video box) are functional:

- Preview/export parity spot-checks across layer types
- Clean up known limitations from the original plan (clips must have an audio stream, preview clip-join hiccup, etc.)
- Whole-milestone end-to-end verification: assemble a real reel exercising every layer type, export, watch start to finish

## Out of scope for this spec

- Detailed task breakdowns for any phase — each phase's own brainstorming session produces that.
- The Video Box data model — deferred to Phase 4's brainstorm.
- Backlog items already tracked independently (logo/REEL positioning, safe-zone contrast, divider component, etc.) — unaffected by this revision, still tracked in `docs/superpowers/backlog.md`.
