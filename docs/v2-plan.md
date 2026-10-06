# Project Dashboard (formerly Forma Docs Dashboard) — v2.0.0 plan

Agreed October 2026. Work happens on the `v2` branch; `main` (the live
GitHub Pages site) stays on v1.8.x with hotfixes only until v2 is ready,
then `v2` is merged in.

## Goals

- Keep everything the MIDP does today: version stacking (one row per
  document, approved-preferring parent, expandable revision history,
  "All revisions" modal), the Forma-style search & filter panel, row
  selection with Copy names / Export selected, inline editing with the
  pending-edits cache.
- Keep the Drawing Register / SHEAF views, the client read-only view and
  the project picker.
- Rebuild the compliance dashboard on clean logic with clearer charts.
- New layout and styling that flows better.
- Pay down the structural tech debt (global scope, dead code, duplicated
  config) while we're in there.

## Decisions

| Topic | Decision |
|---|---|
| Tech | Native ES modules, **no build step** — still static on GitHub Pages. Pure logic is unit-tested with `node --test` (Node runs ES modules natively). |
| Rollout | `v2` branch, swap at release. |
| Pages | Keep `index.html`, `dashboard.html`, `dashboard_client.html` so the APS redirect URIs don't change. Views inside the dashboard use hash routes (`dashboard.html?id=…#/compliance`). |
| Layout | Sidebar app layout: slim left nav (Projects / MIDP / Drawing Register / Compliance), header with project name + user, Aureos green accents on neutral surfaces. Mockups for sign-off at the start of phase 2. |
| Compliance location | Its own view, with click-through to the MIDP pre-filtered (via the search panel). |
| Compliance basis | **One row per document** — the same stacked documents the MIDP shows. |
| Compliance checks | Title Line 1 · Revision (ISO 19650 format) · File Description (present, not the TIDP placeholder) · Status · Form · Originator · Function · Spatial. A naming-standard check is skipped when the project's naming standard doesn't define that field. |
| Compliance scores | Headline: **% fully compliant documents**. Secondary: **% of checks passed**. |
| Compliance breakdowns | Per-check pass rate · by folder / lifecycle (WIP / SHARED / PUBLISHED) · by Originator / Function · status distribution. |
| APS token | **The signed-in user's own 3-legged token** for every APS call (reads and edits), with automatic refresh. ACC then enforces each user's real permissions and the audit log shows who edited what. The Power Automate "get access token" flow is no longer used by v2 and should be retired once v2 is live. |

## Code layout

```
src/
  pages/  projects.js       index.html entry — project picker
          dashboard.js      dashboard.html entry — loading, nav, hash routing
  session.js                shared sign-in + user + project-list lookup
  core/   config.js         app constants, PA flow URLs, attribute map, per-project features
          log.js            DEBUG-gated logging
          storage.js        safe local/sessionStorage JSON helpers
          store.js          tiny observable state store
          router.js         hash router (#/midp, #/drawings, #/compliance)
          prefs.js          per-browser display prefs (compact mode)
  auth/   pkce.js           PKCE sign-in, token refresh, getAccessToken()
          roles.js          internal vs client (cosmetic — not access control)
  api/    http.js           fetch wrapper: auth header, errors, 429 retry
          aps.js            Autodesk endpoints
          powerAutomate.js  project list + project extract flows
  data/   extract.js        parse the PA extract payload (framework + single)
          fileRows.js       build file rows from each source, apply attributes
          stacking.js       document stacking (dedup / pickWinner) — pure
          enrich.js         chunked versions:batch-get with cache + progress
          history.js        full revision history for a document
          pendingEdits.js   edit overlay until the next PA extract
          project.js        orchestrates loading a project
  compliance/ rules.js · engine.js                      (phase 4)
  views/  shell.js (top bar, sidebar, state cards) · feedback.js · placeholder.js (temporary)
          midp/ index (view) · columns · searchPanel · editing · historyDialog · columnPicker
          drawingRegister · compliance   (phases 4–5)
  ui/     dom.js (safe element builder) · toast.js · format.js · editors · charts
assets/css/app.css          design tokens + shell + components (Aureos website look)
dev/      mock-api.js + index.html / dashboard.html — the app against generated
          data with no sign-in (http://localhost:8000/dev/index.html)
mockups/  approved static layout mockup
tests/    node --test unit tests for core/data/compliance
```

### Design (approved Oct 2026)

Aligned to aureos.com: white top bar with the full-colour logo and the
logo's blue→green gradient as a 3px line beneath it; deep navy sidebar
(#1d1e4e) with a lime (#9bc53d) marker on the active view; Inter;
uppercase letter-spaced eyebrow labels; navy primary buttons and lime
outline secondary buttons with a "›"; near-square cards with thin grey
borders. **Compact mode** (icon-only sidebar, denser rows) is a user
toggle remembered per browser, on by default below 1280px wide. Charts
are plain HTML/CSS (no Chart.js).

The v1 scripts in `js/` keep working on this branch until each view is
ported, and are deleted in phase 6.

## Phases

Status: phases 1–6 complete on the `v2` branch (Oct 2026). Remaining
before merging to `main`: a real-data check (sign-in, enrichment with the
user's token, an inline edit, a client account) — see Outstanding in
CLAUDE.md for the follow-ups that sit outside this repo.

1. **Foundation** — config, logging, storage, store; PKCE auth with
   token refresh; API layer (user token); data pipeline (extract parsing,
   file rows, stacking, enrichment, history, pending edits) as pure,
   tested modules.
2. **App shell** — sidebar/header layout, design tokens, restyled project
   picker, hash router, loading states. Mockups first.
3. **MIDP** — Tabulator table, search panel, selection, inline editing,
   pending edits, revision history, carried over intact on the new core.
4. **Compliance** — rules engine + Compliance view + click-through.
5. **Drawing Register / client view** on the same shell, nav gated by
   role and project features. Decided Oct 2026:
   - Drawing Register lists one row per document whose current revision
     matches v1's rule (revision contains C and Form is DR, or
     Deliverable = Yes); DT1116 gets the standard register.
   - The SHEAF-specific register is dropped.
   - External clients get MIDP + Drawing Register, read-only, limited to
     PUBLISHED / SHARED_TO_CLIENT folders (filtered before stacking).
     `dashboard_client.html` is now the same app, kept for old links.
6. **Cleanup & hardening** — delete v1 `js/` + `table_generation.js`;
   `endsWith` email-domain check; `URLSearchParams`; CSP meta tag;
   DEBUG-gated logging; identifier typo sweep; update CLAUDE.md.

## Open items

- **Framework sub-projects** — the abandoned `claude/happy-brown-59cc93`
  worktree started a sub-project picker. v2's extract parser already tags
  rows with `sub_project` / `sub_program`; decide whether it becomes a
  search-panel filter.
- **ACC integration for the user-token app** — the APS app behind
  `apsClientId` must be added as a custom integration in the ACC account
  for the `bim360/docs` custom-attribute endpoints to accept user tokens.
  Verify on first real-data run.
- **Refresh token storage** — stays in `localStorage` for silent re-login
  (now isolated in `auth/pkce.js`); revisit moving to `sessionStorage`.
- **Power Automate flows are still unauthenticated** (project list,
  extract, feedback). Needs flow-side validation of the user's token.
- **Stale modules after a deploy** — browsers cache ES modules (GitHub
  Pages sends `max-age=600`). One visit fetches every module together,
  so they expire together and a mixed old/new set is unlikely; users may
  just see the previous version for up to ~10 minutes. Accepted for now
  (a `?v=` on the entry module alone would make mixing *more* likely,
  since nested imports stay cached). Revisit with a `version.json`
  check if it causes problems.
- **Compliance: naming-standard checks** are skipped when no document in
  the project has that field filled in (treated as "not used by this
  project's naming standard") rather than reading the naming standard
  definition from Forma.
