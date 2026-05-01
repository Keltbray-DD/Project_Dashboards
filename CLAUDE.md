# ACC Docs Dashboard — Project Notes

Internal Aureos web tool that surfaces Autodesk Construction Cloud (ACC, also branded "Forma") document control data — the Master Information Delivery Plan (MIDP), Drawing Register, and Drawing Register SHEAF — for civil/infrastructure projects.

Static client-side app: plain HTML / vanilla JS, no build step, hosted on GitHub Pages (`https://keltbray-dd.github.io/Project_Dashboards/`).

---

## Architecture overview

### Two views

| File | Audience | Tabs |
|---|---|---|
| `dashboard.html` + `js/main.js` | Internal users (Aureos / Keltbray emails) — write access | MIDP, Drawing Register, Drawing Register SHEAF |
| `dashboard_client.html` + `js/main_client.js` | External clients — read-only | Drawing Register (uses SHEAF filter, restricted to PUBLISHED / 0F.SHARED_TO_CLIENT folders) |

`isClient` flag in `js/login.js` decides which to redirect to (currently a substring check on email — `aureos` / `keltbray` → admin view, everything else → client view).

### Data flow

1. **Project list** — `acc_functions.js` calls a Power Automate flow with the user's Autodesk userID, returns a list of projects the user has access to. Rendered as a card gallery on `index.html`.
2. **Project files** — On dashboard load, `get_data.js → getJSONDataFromSP()` calls a different Power Automate flow which returns a SharePoint-cached extract: every project file's basic metadata (`Name`, `itemID`, `itemIdVersion`, `folderID`, `folderPath`, `lastModifiedTime`, `lastModifiedUserName`, `createUserName`). The PA extract runs every ~30 minutes.
3. **Custom attributes (on demand)** — `data_processing.js → enrichFilesWithCustomAttributes()` calls ACC's `versions:batch-get` endpoint for the file URNs, fills in revision / status / title lines / activity code / etc. Cached in `sessionStorage` keyed by version URN. Runs in chunks of 200 with 4-way concurrency.
4. **Older file versions (on demand)** — when the user clicks the chevron on a row, `getItemVersions()` fetches all versions of that file lineage, then `getCustomDetailsBatch()` fills in their attributes. Cached in `sessionStorage`.
5. **Tabulator render** — each tab is a Tabulator instance bound to the in-memory `files[]` array.

### Auth

- **PKCE OAuth flow** with Autodesk APS. The APS app must be configured as a **Public Client** (no client secret).
- Client ID: `apsClientId` in `variables.js`.
- Refresh token in `localStorage` for silent re-auth across sessions.
- State parameter for CSRF protection.

### Pending edits cache

When a user edits a cell:
1. PATCH to ACC `:batch-update` endpoint via `postCustomItemDetails`.
2. On HTTP 2xx, `markCellEdited()` writes `{value, timestamp}` into `localStorage[pendingEdits_<projectID>]`.
3. On every page load after enrichment, `applyPendingEdits()` overlays any entry whose `timestamp > fileData.updated` (i.e., edits made after PA's last extract). Older entries are dropped — PA has caught up.

This is what bridges the 30-minute PA extract gap.

---

## File map

```
Project_Dashboards/
├── index.html                    Project picker
├── dashboard.html                Admin view (MIDP/DR/SHEAF)
├── dashboard_client.html         Client view (SHEAF only, read-only)
├── assets/
│   ├── css/
│   │   ├── dashboards.css        Admin view styles + Tabulator overrides
│   │   ├── main.css              Index page
│   │   ├── userBox.css           Top-bar profile dropdown
│   │   └── feedback.css          Bug-report widget
│   └── media/
└── js/
    ├── variables.js              Globals, attribute name → field map, hidden columns config
    ├── login.js                  PKCE OAuth, token refresh, getUserDetails, checkIsClient
    ├── acc_functions.js          Project list fetch, project gallery rendering
    ├── default.js                Feedback button + modal
    ├── index_main.js             index.html bootstrap
    ├── main.js                   dashboard.html bootstrap, openTab routing, edit-mode toggle
    ├── main_client.js            dashboard_client.html bootstrap (single-tab variant)
    ├── data_processing.js        files[] population, enrichment, loading panel, pending edits
    ├── get_data.js               PA + APS HTTP calls
    ├── post_data.js              PATCH custom attribute (returns {ok, status, body})
    ├── output_data.js            Excel export — delegates to Tabulator if present
    ├── chart_generation.js       Compliance gauges + bar charts (Chart.js)
    ├── table_generation.js       LEGACY — most functions unused after the Tabulator migration; kept around for the few helpers (chartChecks, runChecks, getCustomDetailsData) that data_processing.js still calls
    └── tabulator_setup.js        ALL Tabulator config, formatters, editors, filters, edit hook, version expand, pending edits
```

---

## Key globals (in `variables.js`)

| Global | Purpose |
|---|---|
| `files[]` | Source of truth for table data — array of file rows. All Tabulators bind to this. |
| `fileData` | `{updated, folderData, files_list}` — the raw PA payload, with `updated` driving the pending-edits expiry logic. |
| `projectID` | Bare GUID (no `b.` prefix). |
| `apsClientId` | PKCE public APS app ID. |
| `accesToken` | Latest Autodesk access token. |
| `customAttributes` | ACC custom-attribute *definitions* (id, name, type, arrayValues for dropdowns). Populated by `getCustomDetailsData()` when edit mode is first enabled. |
| `columnNamesDefault` | Maps our short field name (`status`) to ACC attribute UUID (`columnId`). Used by the cell-edited PATCH. |
| `ATTR_NAME_MAP` | Maps ACC display names (`"Title Line 1"`) to our short field names (`title_line_1`). Drives the batch-get response → file row mapping. |
| `tabulators` | `{MIDP, DR, DRSHEAF}` — the Tabulator instances per tab. |
| `tabulatorEditMode` | Boolean toggled by the edit button; gates `editable` per cell. |

---

## Building / running

No build step. Static server only:

```bash
py -m http.server 8000 --bind 127.0.0.1
```

Then open `http://localhost:8000/index.html`.

For OAuth to work locally, the localhost URLs must be registered as redirect URIs on the APS app:
```
http://localhost:8000/index.html
http://localhost:8000/dashboard.html
http://localhost:8000/dashboard_client.html
```

---

## Migration history

This file was created at the end of a session that did a full rewrite of the table system and several supporting changes. Captured below for context on why things look the way they do.

### Done in this migration

#### Security
- **PKCE OAuth flow** ([login.js](js/login.js)) replacing the previous Basic-auth-with-client-secret flow. The client secret was leaking to anyone who opened DevTools. Old confidential-client APS app should be deleted from APS console (it's still active as of last check; remove it once you're confident the migration's stable).
- **OAuth state parameter** for CSRF protection.
- **Defensive `tableType?.includes()`** in `getCustomDetailsData()`.

#### Data architecture
- Migrated source of truth from `all_versions_file_list` (PA-derived) to `files_list` (lighter PA payload). PA is no longer enriching custom attrs on the server side — we fetch on demand client-side via `versions:batch-get`.
- Added `getItemVersions()` for lazy version-history expand.
- Added `getCustomDetailsBatch()` (POST `versions:batch-get`).
- New `lastModifiedTime` / `lastModifiedUserName` / `createUserName` fields wired in once PA started returning them.
- Fixed pre-existing bug: `created_by` (in files[]) vs `created_by_user` (in template) field-name mismatch.

#### UI
- Replaced custom DOM table system with **Tabulator** ([tabulator-tables@5.6.1](https://tabulator.info)) across all four (now three) active tabs.
- Multi-step loading panel: Auth → Files → Metadata → Render with green-tick progress.
- Per-tab Reset Filters button (highlights orange when any filter / search / chart-click is active).
- Smart cell editor: ACC custom-attribute dropdowns (`type: "array"`, `arrayValues: [...]`) render as `<select>`; free-text attributes render as `<input>`. Uses `showPicker()` to auto-open the dropdown on click.
- Lazy version expand with green-bordered, italic, dimmed child rows.
- Aureos green theme overrides for Tabulator.
- Compliance gauge fix: `<= 1` boundary so 100% → green not red.
- Charts hide → table grows to fill via body class + CSS variables.
- Removed MDR tab (superseded by MIDP).
- Removed Transmittal Register references (was hidden anyway).
- File URL format matches Forma's deep-link pattern (regional `.eu`, lineage URN, encoded folderUrn, view-mode params).

#### Pending edits cache
- `localStorage[pendingEdits_<projectID>]` overlays cell edits onto loaded data until PA's 30-minute extract catches up.
- Auto-expiry: entries older than `fileData.updated` are dropped on next load.

### Outstanding tech debt (from the original code review)

These were flagged at the start of the session and **not** fixed yet. Roughly priority-ordered.

#### Critical — security

1. **Power Automate flow URLs are unauthenticated.** Every flow URL with embedded `?sig=…` SAS signature in `get_data.js` / `acc_functions.js` / `default.js` is effectively a public, unauthenticated endpoint. Anyone with the URL can call them. The `userID` body parameter is purely advisory — a caller can put any userID and the flow returns that user's projects.
   - **Fix:** require an Authorization header (the user's Autodesk access token) inside the flows themselves, validate it, derive `userID` from the token rather than from the request body.

2. **Client-side `isClient` is not real access control.** [login.js:231](js/login.js#L231) does `userEmail.includes("aureos") || userEmail.includes("keltbray")`. Trivially bypassable by typing `isClient = false` in the console. Acceptable as a UI hint only — the actual write authorisation lives in ACC (which validates the user's access token on PATCH). The current substring check would also misidentify e.g. `keltbray@some-other-domain.com`. Use `endsWith("@aureos.com") || endsWith("@keltbray.co.uk")` and document that this is cosmetic.

3. **XSS via `innerHTML`** in any code path that hasn't been migrated yet. `tabulator_setup.js`'s formatters call `escapeHtml()` so the migrated tabs are safe. `table_generation.js` (legacy, mostly dead) still has unsafe `innerHTML` paths.
   - **Fix:** delete the unused legacy code; for any remaining surfaces, route through `escapeHtml`.
   - **Mitigation:** add a `Content-Security-Policy` meta tag to both HTML files.

4. **Refresh token in `localStorage`.** Survives browser close, reachable by any XSS payload. Move to `sessionStorage` (sacrifices auto-login convenience but limits blast radius) or an httpOnly cookie set by the OAuth-exchange Power Automate flow.

#### High — correctness

5. **`forEach(async ...)` antipattern** at [data_processing.js:346](js/data_processing.js#L346) (`generateArrays`). The outer doesn't await, so `processData` returns before all `addToFilesArray` pushes complete. Works in practice because `addToFilesArray` is synchronous-bodied, but at high file counts (10k+) the order isn't guaranteed deterministic. Replace with `for…of` loop.

6. **Implicit globals** — many variables are assigned without `let`/`const` (`signedURLData`, `responseData`, `convertedData`, `userDetails`, `userAccessToken`, `userRefreshToken`, `rawProjectID`, …). Pollutes `window`, race-prone when async paths overlap.
   - **Fix:** add explicit declarations; consider switching to ES modules and `"use strict"`.

7. **`sessionStorage.setItem('projectData', fileData)`** at [data_processing.js:13](js/data_processing.js#L13) stores `[object Object]` — needs `JSON.stringify`. Same bug with `userDetails` in [login.js:8](js/login.js#L8). Currently harmless because nothing reads them back, but if anything starts to it'll silently fail.

8. **`getProjectFromURL` parsing** at [main.js:194](js/main.js#L194): `url.split("id=")[1]`. If the URL gains another query param after `id`, the trailing `&foo=bar` becomes part of the projectID. Use `new URLSearchParams(window.location.search).get('id')`.

#### Medium — maintainability

9. **No build, no modules, polluted global scope.** Every script appends to `window`. Wrapping each file in an IIFE (or migrating to ES modules with `<script type="module">`) would make data flow much easier to follow.

10. **Hardcoded project IDs in three places.** [variables.js:94-115](js/variables.js#L94) lists projects per register. [get_data.js:144,265](js/get_data.js#L144) and `tabulator_setup.js` repeat the GUIDs (`76c59b97-…`). Refactor to a single per-project config object: `{ id, name, registers: [...], hasSeries: true }`.

11. **Header-array duplication.** `defaultHeaders`, `a66Headers`, `drawingRegisterHeaders` etc. in `variables.js` are 90% the same content. Compose them: a base list + small per-register overrides. (Largely obsoleted by Tabulator now — the column configs live in `tabulator_setup.js` instead. The legacy header arrays are dead code; safe to delete.)

12. **Dead / commented-out code** throughout. Most of `table_generation.js` is no longer reachable after the Tabulator migration. `dashboard.html` and `index.html` have dead commented blocks. `main.js` has commented-out logout button wiring at lines 25-28, 50-54, 80-94. Strip when you next pass through the file.

13. **~80 `console.log` calls left in.** Several log full file datasets which can be MB-sized. Wrap in a `DEBUG` flag in `variables.js`.

14. **Typos baked into identifiers.** `accesToken` (should be `accessToken`) — appears 12+ times. `orginalACCExport`, `revisionFormatCheckInvaildCount`, `loaclRefreshToken`, `Vaild`. Painful to grep for. One-shot rename pass.

15. **CSV BOM bug.** [data_processing.js:301,327](js/data_processing.js#L301) — the key `"ï»¿id"` is a UTF-8 BOM (`EF BB BF`) being mis-decoded as Latin-1 by Papa Parse. Strip the BOM before parsing: `Papa.parse(text.replace(/^﻿/, ''), …)`.

16. **`statusCounts` and `folderCount` are accumulators** but only `folderCount` is reset in `resetValues()`. `statusCounts` was added to `resetValues` during this session (was the cause of "1556 missing" ghost counts on the bar chart). Worth auditing for any other accumulators that escape the reset.

#### Low — polish

17. **`isClient = true` default** ([variables.js:21](js/variables.js#L21)). If `getUserDetails` fails, an Aureos user gets locked out as a "client". Default should be set after the email check.

18. **Mixed FontAwesome versions.** `dashboard.html:10` loads FA 6.0.0-beta3, line 284 loads 6.5.1. Pick one and put it in `<head>`.

19. **`index.html` and `dashboard.html` duplicate top-bar / profile menu HTML.** Drift between the two over time. Server-side include or a small JS template helper would fix.

20. **Older-version expand uses lineage URN for file_url** (so the View link goes to the latest version of the file, not the specific older version the row represents). If users need to actually view older versions from the expanded rows, swap `entityId` to the version URN for child rows.

21. **No `dataFiltered` debounce** — typing in the search box triggers a `dataFiltered` event per keystroke, which updates the Reset button's active class. Cheap right now, but if it ever feels laggy on big datasets a 100ms debounce helps.

22. **No max-age cleanup on pending edits.** If PA goes down and never updates, edits accumulate forever. localStorage is ~5MB so unlikely to be a problem, but a 7-day TTL would be a sensible safeguard.

---

## How to do common things

### Add a new editable column

1. Add the ACC display name → field key mapping in `ATTR_NAME_MAP` (`variables.js`).
2. Add a column entry in `buildMidpColumns()` / `buildDrawingRegisterColumns()` in `tabulator_setup.js` with `editor: smartCellEditor, editable, cellEdited, formatter: missingFormatter`.
3. Update `columnNamesDefault` in `getCustomDetailsData()` (`get_data.js`) to include the field's ACC attribute UUID (or the dashboard-edit will skip it with "Update skipped").

### Bust the custom-attributes cache

DevTools → Application → Session Storage → `localhost:8000` → delete `customAttrs_<projectID>`. Refresh — full re-fetch from ACC.

### Bust pending edits

DevTools → Application → Local Storage → `localhost:8000` → delete `pendingEdits_<projectID>`.

### Test with a different project

URL parameter `?id=<bareGUID>` on dashboard.html. Project IDs:
- HI7411: `76c59b97-feaf-413c-9bd0-43cf8aaa3133`
- DT1117: `2e6449f9-ce25-4a9c-8835-444cb5ea03bf`
- DT1116: `7c7ca0c5-bfc3-4ef1-9396-c72c6270f457`

### Force a fresh OAuth login

DevTools → Application → Local Storage → set `user_refresh_token` to `blank` (or delete). Reload — sends you to Autodesk login.

---

## Tabulator quick reference

| Need | How |
|---|---|
| Add a column | Edit the `buildXColumns()` function in `tabulator_setup.js` |
| Make a cell editable | `editor: smartCellEditor, editable, cellEdited` |
| Format empty cells as "Missing" | `formatter: missingFormatter` (red) or `missingFormatterYellow` |
| Format a date | `formatter: dateFormatter` |
| Format an external link | `formatter: fileUrlFormatter` |
| Per-column header filter | `headerFilter: "input"` (text) or `"list"` with `headerFilterParams: { valuesLookup: "all" }` (dropdown of distinct values) |
| Programmatic filter (chart click) | `tabulators[tab].setFilter(predicate)` |
| Clear all filters on a tab | `tabulatorClearFiltersAny(tab)` |
| Re-render after data change | `tabulators[tab].replaceData(newArray)` |

---

## Appendix: APS endpoints used

| Endpoint | What | Where |
|---|---|---|
| `POST /authentication/v2/authorize` | OAuth code redirect | `login.js → signin()` |
| `POST /authentication/v2/token` | Code exchange + refresh (PKCE, no secret) | `login.js → getAuthorisation()` / `refreshToken()` |
| `GET /api.userprofile.autodesk.com/userinfo` | User details | `login.js → getUserDetails()` |
| `GET /project/v1/hubs/{hub}/projects/b.{project}/topFolders` | Project root folders | `get_data.js → getProjectTopFolder()` |
| `GET /bim360/docs/v1/projects/{project}/folders/{folder}/custom-attribute-definitions` | Custom attribute schema (id, name, type, arrayValues) | `get_data.js → getItemDetails()` |
| `POST /bim360/docs/v1/projects/{project}/versions:batch-get` | Get custom attribute values for many versions in one call (max 200/req) | `get_data.js → getCustomDetailsBatch()` |
| `POST /bim360/docs/v1/projects/{project}/versions/{urn}/custom-attributes:batch-update` | PATCH a single attribute value | `post_data.js → postCustomItemDetails()` |
| `GET /data/v1/projects/b.{project}/items/{lineage}/versions` | All versions of a file | `get_data.js → getItemVersions()` |
| `GET /data/v1/projects/b.{project}/folders/{folder}` | Folder details (used to derive naming-standard ID) | `get_data.js → getFolderDetails()` |
| `GET /bim360/docs/v1/projects/{project}/naming-standards/{ns}` | Naming standard definition (Discipline / Function / Form options) | `get_data.js → getNamingStandardforproject()` |
