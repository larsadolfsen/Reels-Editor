# Phase 2 — Project Management

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only, minimal — this phase's first real step is its own brainstorming session (not written yet); this doc captures why it exists and what it's for, not a subthread breakdown.

## Goal

Give the user real control over saving and organizing their work, instead of the current silent, single-implicit-project autosave.

## Why this phase exists

Every edit already triggers `PUT /api/projects/{id}`, persisted to `data/projects/<id>.json` on disk — nothing is at risk of being lost day-to-day in the same browser. But there is currently no way to:

- Name a project (it's always called `"reel"`)
- See a list of projects and switch between them
- Explicitly start a new project without losing track of the current one
- Recover a project if browser storage (`localStorage.projectId`, the only pointer to "which project is this browser looking at") is cleared, or work across browsers/machines

`static/api-ensure-project.js` currently creates-or-loads exactly one project per browser via that single `localStorage` key — there's no multi-project concept in the UI at all today, even though the backend's `POST/GET/PUT /api/projects[/{id}]` routes already support arbitrary numbers of projects.

## Known shape (informal, not a commitment)

- A project list/switcher UI, likely a new left-rail panel item (matching the FILES/TEXT/CAPTIONS icon-rail pattern) or a dedicated screen before entering the editor.
- A rename/name-on-create flow, replacing the hardcoded `"reel"` name.
- Decide: does creating a new project require confirming you're leaving the current one (nothing unsaved to lose, since autosave is continuous — but worth a moment's confirmation so it doesn't feel accidental), and does the app keep showing "explicit save" language even though persistence is already automatic, to build user trust that work is safe?

## Next step

When this phase is picked up: run `superpowers:brainstorming` to settle the actual UI (list view? command palette? dedicated screen?), the rename flow, and any project-deletion/duplication needs, then `superpowers:writing-plans` to produce the implementation plan — this document intentionally does not attempt a subthread breakdown yet.
