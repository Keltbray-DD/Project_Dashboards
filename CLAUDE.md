# Project Dashboard — Project Notes

Internal Aureos web tool for project dashboards, grouped into sidebar
sections by discipline. The first section, **Information Management**,
surfaces Autodesk Construction Cloud (ACC, branded "Forma") document
control data — the MIDP, the Drawing Register and metadata Compliance —
for civil/infrastructure projects. Further sections (Project Management,
Quality, …) are planned; see "Add a dashboard section" below.

Static client-side app: native **ES modules, no build step**, hosted on
GitHub Pages (`https://keltbray-dd.github.io/Project_Dashboards/`).

v2.0.0 was a full rewrite of v1.x; the plan and decisions are in
[docs/v2-plan.md](docs/v2-plan.md).
v2.1.0 reads files live from Forma (single projects whole; frameworks one
chosen sub-project / region at a time) and narrows Compliance to five
checks on the deliverable folders.

---

## Running locally

```bash
py dev/serve.py
```

`dev/serve.py` is `http.server` with `Cache-Control: no-store`, so the
browser never runs stale ES modules after an edit (plain `py -m http.server`
sends no cache headers and browsers keep modules for a while).

- Real data: `http://localhost:8000/index.html` (Autodesk sign-in).
- Mock data, no sign-in: `http://localhost:8000/dev/index.html`
  (`?as=client` / `?as=internal` switches the mock user; on the dashboard,
  `?slow=1` simulates a slow metadata load, `?size=N` sets the number of
  documents, `?flaky=1` makes Forma randomly throttle / error / hang and
  report ~1% of files unavailable, and `?down=1` fails every metadata
  request until `__MOCK__.down = false` — for testing Retry). EX0001 is
  read live from a mock folder tree (clients get 403 on WIP).
- `?source=extract` on any dashboard (real or mock) uses the Power
  Automate file list instead of reading Forma live, for comparing the two.
- Tests: `npm test` (runs `node --test` over `tests/`; Node 20+).

OAuth redirect URIs registered on the APS app (must match exactly):
`/index.html`, `/dashboard.html`, `/dashboard_client.html` on
`http://localhost:8000` and the GitHub Pages origin. That's why those
three page names must not change. `dev/` pages never hit real sign-in.

---

## Architecture

### Pages

| Page | Entry module | What it is |
|---|---|---|
| `index.html` | `src/pages/projects.js` | Project picker |
| `dashboard.html` | `src/pages/dashboard.js` | One project: loading, nav, hash-routed views |
| `dashboard_client.html` | same as dashboard.html | Kept so old client links + redirect URI keep working |

Views are hash routes: `dashboard.html?id=<bare project GUID>#/midp`,
`#/drawings`, `#/compliance`. The route and `?id=` survive the OAuth
round trip (`auth/pkce.js` restores them).

### Roles (cosmetic only)

`auth/roles.js isInternalEmail()` — exact domain match against
`INTERNAL_EMAIL_DOMAINS` in `core/config.js`.

- **Internal**: MIDP, Drawing Register, Compliance, inline editing.
- **External client**: MIDP + Drawing Register, read-only, "View only"
  tag, files limited to PUBLISHED / SHARED_TO_CLIENT folders
  (`data/registers.js isClientVisible`), filtered before stacking.

This is a UI hint, not access control: every APS call uses the signed-in
user's **own token**, so ACC enforces what they can read and edit.

### Data flow

1. **Sign-in** — PKCE against the public APS app (`APS_CLIENT_ID`). The
   access token auto-refreshes before expiry; the refresh token is in
   `localStorage["user_refresh_token"]` (same key v1 used).
2. **Project list** — Power Automate flow (`PA_FLOWS.projects`), cached
   per session; also used to resolve a project's name from `?id=`.
3. **Project files** — PA flow `PA_FLOWS.extract` returns a SharePoint-
   cached extract (~30-min refresh, but it can lag a day). `data/extract.js`
   parses both the single-record and "framework" shapes. Then
   (`data/project.js loadProjectFiles`):
   - **Single projects are read live from Forma**: the MIDP containers
     (`MIDP_FOLDER_PATTERN`: WIP / SHARED / PUBLISHED, found up to 2 levels
     under the extract's `start_folder_id` by `aps.findFolders`) plus
     `additional_MIDP_folders`, in one `aps.walkFolders` walk — 3 folder
     listings at a time with a 150 ms gap (more than that gets 429s; A66
     reads in ~6 s). Folders the user can't open (403/404, normal for
     clients) are skipped; other failures toast a warning. If nothing can
     be read it falls back to the extract's `files_list`.
   - **Frameworks** load one chosen scope at a time, live — see
     "Framework projects" below.
   `extract.source` says which ("live" | "extract"); `extract.updated` is
   when the list is as of, `extract.cacheEpoch` keys the attribute/history
   caches and the pending-edits cutoff (live: the current 30-min window).
4. **Rows** — `data/fileRows.js` builds one row shape (one per file
   version) from every source.
5. **Attributes** — `data/enrich.js` fills custom attributes via
   `versions:batch-get` (batches of 50, 6 workers, matched by URN; 30 s
   request timeout with back-off; one gentler retry pass; files Forma
   reports unavailable are flagged `attrs_error`), cached in
   `sessionStorage` per project + `cacheEpoch`. Views fill cells in
   progressively (`metadataProgress`); a warning strip with Retry shows if
   anything still failed.
6. **Pending edits** — `data/pendingEdits.js` overlays successful edits
   newer than `cacheEpoch` (`localStorage[pendingEdits_<projectId>]`,
   7-day max age).
7. **Stacking** — `data/stacking.js stackDocuments()` collapses a
   document's WIP/SHARED/PUBLISHED copies into one Document with a
   `current` row (PUBLISHED > SHARED > WIP; within a level the most
   recently uploaded copy wins, then revision rank) plus siblings;
   `hasNewerRevision` flags work in progress past it. SHARED_TO_CLIENT
   ranks as SHARED but has its own badge (`lifecycleTag`).
8. **Views** read `store.documents` and re-render on store changes.

### Framework projects (regions and sub-projects)

A "framework" extract (`type: "framework"`) has a Parent record
(`Framework_lineage.Value === "Parent"`, the framework itself) and one
Child record per **region**, named by `Sub_folder_name` (fallback:
`ProjectName` minus the Parent's name), each with its own
`start_folder_id`. Inside a region, each top-level folder is a
**sub-project** (`AX027_Milborne_Port (PS009789)`); top-level WIP / SHARED
/ PUBLISHED folders are the region's own (region-level files); other
container folders (`Z.PROJECT_ADMIN`, …) are ignored.

**Live (default): choose first, then load only that.**
1. `loadFrameworkCatalogue` lists each region's start folder (one request
   per region) and `classifyRegionFolders` sorts the folders — no files
   are loaded yet.
2. The scope comes from `?scope=` in the URL, else the remembered one
   (`localStorage[v2.scope.<id>]`); with neither, the **chooser**
   (`views/subProjectChooser.js`) fills the page: a card per region with
   sub-project tiles, "All of <region>", "Whole framework" and search.
3. `loadScopeFiles` loads the scope: each sub-project's MIDP folders
   (`aps.findFolders` under the sub-project folder, 3 at a time, paced)
   plus each touched region's region-level folders and additional MIDP
   folders, in one `walkFolders` walk. Parent (framework-wide) files are
   not loaded. A region or the whole framework walks every sub-project in
   it — slower, and labelled so.
4. The top bar shows the scope as a button ("Change") that reopens the
   chooser ("Back to …" returns). Picking a scope — or opening the chooser —
   abandons a scope load still in progress (`scopeLoad` counter;
   `enrichMetadata` drops stale results by comparing `store.extract`).

**Extract mode** (`?source=extract`, or if no region can be listed):
every file from `files_list` is loaded and the old top-bar dropdown filters
in memory (`buildScopes` / `scopeFiles`); Parent files show in every scope.

Rows carry `regions` (every region the file is listed under;
`mergeDuplicateFiles` keeps one row per version) and `sub_project`
(`subProjectFolder`: the first path segment, skipping `Project Files` /
the region folder; "" for region-level).
- Region-level files show in each of that region's sub-projects.
- `XX0000_*` (training) sub-projects are left out.
- Names ending `CANCELLED` are listed last and labelled "Cancelled";
  labels are tidied (`_` and ` - ` → spaces).

Scope keys: `framework`, `region:<region>`, `sub:<region>|<folder>`
(`store.scope` + `store.scopeLabel`). Every view, Compliance and the nav
counts see only the scope (`stackScoped` in `pages/dashboard.js`).
Mock: project EX0003 "Example Framework" (per-region folder trees in
`dev/mock-api.js`).

### State

`core/store.js` — one observable store:
`{ user, project, extract, files, documents, attrDefs, loading, editsVersion }`.
Views subscribe and return an unsubscribe cleanup. Inline edits mutate
`doc.current` and bump `editsVersion` (Compliance recounts on it).

---

## File map

```
index.html / dashboard.html / dashboard_client.html
assets/css/app.css          all styles: tokens, shell, tables, panel, compliance
src/
  pages/projects.js         picker entry
  pages/dashboard.js        dashboard entry: load pipeline, routes, nav count
  session.js                sign-in + user + project lookup
  core/   config.js         ALL constants: APS ids, PA flow URLs, ATTR_NAME_MAP,
                            per-project features (PROJECT_FEATURES), domains
          store.js · router.js · prefs.js (compact mode) · storage.js · log.js
  auth/   pkce.js · roles.js
  api/    http.js (retry/back-off, HttpError) · aps.js · powerAutomate.js
  data/   extract · fileRows · enrich · history · pendingEdits · project
          stacking · filters (search-panel logic) · attributeDefs · registers
  compliance/ rules.js · engine.js
  views/  shell.js (top bar, sidebar, state cards) · feedback.js
          registers.js (MIDP + Drawing Register configs)
          midp/ index.js (shared register view) · columns · searchPanel
                editing · historyDialog · columnPicker
          compliance.js
          subProjectChooser.js (framework: pick a sub-project before loading)
  ui/     dom.js (safe element builder) · toast · format · charts (HTML/CSS)
tests/    node --test unit tests (core/data/compliance)
dev/      mock-api.js + mock pages (generated data, no sign-in)
mockups/  approved static layout mockup
docs/     v2-plan.md
```

---

## Conventions

- **No `innerHTML` with data.** Build DOM with `ui/dom.js h()`; text goes
  through `textContent`. Tabulator formatters return DOM nodes.
- **Pure logic in `data/` and `compliance/`, with tests.** DOM and network
  stay in `views/`, `pages/`, `api/`. The APS client is created with an
  injectable `fetch` so data code is testable.
- **Logging**: `core/log.js` — `log.debug/info` only print with `?debug=1`
  or `localStorage.debug = "1"`; `warn/error` always print.
- **Styling**: Aureos website look — tokens at the top of `app.css` (navy
  `#1d1e4e`, lime `#9bc53d`, logo gradient). Compact mode is a body class.
- **CSP**: each page has a `Content-Security-Policy` meta tag. Adding a new
  CDN, API host or inline script means updating it on all three pages.

---

## How to do common things

### Add a dashboard section (e.g. Project Management, Quality)
1. Add the section to `SECTIONS` in `src/core/config.js` with its view
   route names, in sidebar order.
2. Build each view as `(container, ctx) => cleanup` under `src/views/` and
   register it in `VIEWS` in `src/pages/dashboard.js` (label + icon).
3. Decide who sees it where `routes` is built in `pages/dashboard.js`
   (role, project features). Sections with no visible views are hidden.
Data that isn't from the Forma extract needs its own loader in `data/`.

### Add a project feature (Drawing Register, extra editable field)
Add/extend its entry in `PROJECT_FEATURES` in `src/core/config.js`
(`registers: ["midp", "drawingRegister"]`, `extraFields: ["series"]`).

### Add a new attribute column
1. `ATTR_NAME_MAP` in `core/config.js` (Forma name → field key).
2. A column in `src/views/midp/columns.js buildColumns()`.
3. If users should edit it, add the field to `EDITABLE_FIELDS` (the
   editor appears when Forma defines that attribute).
4. If it should be filterable, add it to `FILTER_DEFS` in
   `views/midp/searchPanel.js`.

### Compliance checks
Five checks, on documents in the deliverable folders only (WIP, SHARED,
SHARED_TO_CLIENT, PUBLISHED — `compliance/engine.js isDeliverable`):
Revision (ISO 19650), Status, File Description (not the TIDP placeholder),
Title Line 1 and Document Classification (only the Forma attribute
"Document Classification" — a separate "Classification" attribute, as on
A66, is ignored). Documents elsewhere (e.g. an
additional MIDP folder) are shown as "not checked". Originator, Function
and Form aren't checked; the page's heat grid still groups by them.

To add one: a rule in `RULES` in `src/compliance/rules.js`
(`group: "core"` always applies; `"naming"` is skipped when no document
uses the field) and a test in `tests/compliance.test.js`. The page,
bars, heat grid and export pick it up automatically.

### Open another view pre-filtered
`setExternalFilter("midp", { label, predicate })` then
`navigate("midp")` — shows as a removable chip (see `views/compliance.js`).

### Bust caches
- Attribute cache: Session Storage → keys `customAttrs:<project>:*`.
- Revision history: Session Storage → keys `history:*`.
- Pending edits: Local Storage → `pendingEdits_<projectId>`.
- Force a fresh sign-in: Local Storage → delete `user_refresh_token`.

### Project IDs
- HI7416 (A66 NTP Scheme 3A): `76c59b97-feaf-413c-9bd0-43cf8aaa3133`
- DT1117: `2e6449f9-ce25-4a9c-8835-444cb5ea03bf`
- DT1116: `7c7ca0c5-bfc3-4ef1-9396-c72c6270f457`

---

## Outstanding

1. **Power Automate flows are unauthenticated** (project list, extract,
   feedback). Anyone with a URL can call them; `userID` in the body is
   advisory. Fix flow-side: require the user's Autodesk token and derive
   the user from it.
2. **Retire the PA "get access token" flow** (`df0aebc4…`). v1 used it to
   get a 2-legged `data:write` app token for every call; v2 doesn't use it.
   Turn it off once v2 is live — until then it hands out write tokens.
3. **Delete the old confidential-client APS app** (pre-PKCE).
4. **ACC integration** — the APS app behind `APS_CLIENT_ID` must be a
   custom integration in the ACC account for the `bim360/docs` attribute
   endpoints to accept user tokens.
5. **Refresh token in `localStorage`** — reachable by any XSS; consider
   `sessionStorage` (loses silent re-login across browser restarts).
6. **Browser caching after a deploy** — modules are cached (GitHub Pages
   sends `max-age=600`). Because one visit fetches all modules together
   they normally expire together, so a mixed old/new set is unlikely, but
   for up to ~10 minutes after a release users may still get the previous
   version. If that becomes a problem, add a version check against a
   `version.json` fetched with `cache: "no-store"`.

---

## APS endpoints used

| Endpoint | Where |
|---|---|
| `GET/POST /authentication/v2/authorize`, `/token` | `auth/pkce.js` |
| `GET api.userprofile.autodesk.com/userinfo` | `api/aps.js userInfo` |
| `GET /project/v1/hubs/{hub}/projects/b.{p}/topFolders` | `topFolders` |
| `GET /data/v1/projects/b.{p}/folders/{f}/contents` (paged) | `folderContents`, `walkFolders`, `findFolders` |
| `GET /data/v1/projects/b.{p}/items/{lineage}/versions` (paged) | `itemVersions` |
| `POST /bim360/docs/v1/projects/{p}/versions:batch-get` | `batchGetVersions` |
| `GET /bim360/docs/v1/projects/{p}/folders/{f}/custom-attribute-definitions` | `customAttributeDefinitions` |
| `POST /bim360/docs/v1/projects/{p}/versions/{urn}/custom-attributes:batch-update` | `updateCustomAttributes` |
