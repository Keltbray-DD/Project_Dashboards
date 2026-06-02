// Tabulator-based table system. Batch 1: handles the MIDP tab only.
// Drawing Register / SHEAF / MDR continue to render via the legacy
// table_generation code until batch 2.
//
// Public surface used by the rest of the app:
//   initMidpTable()           — (re)render the MIDP table from `files[]`
//   tabulatorSearch(query)    — wired to the MIDP search input
//   tabulatorExport(name)     — wired to the MIDP export button
//   tabulatorToggleEdit()     — wired to the MIDP edit-mode toggle button
//
// Globals consumed (existing): files, projectID, accesToken, isClient,
// columnNamesDefault, defaultHiddenColumns, postCustomItemDetails,
// getAccessToken, getCustomDetailsData, getItemVersions,
// getCustomDetailsBatch, ATTR_NAME_MAP, applyAttrsToFile.

const tabulators = {};
let tabulatorEditMode = false;
const ISO_REVISION_PATTERN = /^[A-Z]\d{2}(\.\d{2})?$/;

// ---------- formatters ----------

// Renders empty/null cells as a red "Missing" pill, otherwise the value.
function missingFormatter(cell) {
  const v = cell.getValue();
  if (v === undefined || v === null || v === "") {
    return '<span class="highlight">Missing</span>';
  }
  return escapeHtml(v);
}

// Same as missingFormatter but uses the yellow style (used for fields
// that aren't strictly mandatory but we still flag when blank).
function missingFormatterYellow(cell) {
  const v = cell.getValue();
  if (v === undefined || v === null || v === "") {
    return '<span class="highlightYellow">Missing</span>';
  }
  return escapeHtml(v);
}

// Revision: red "Missing" if blank, yellow with a tooltip if present but
// not in ISO 19650 format (e.g. "P01", "C02", "P02.03"), otherwise plain.
function revisionFormatter(cell) {
  const v = cell.getValue();
  if (v === undefined || v === null || v === "") {
    return '<span class="highlight">Missing</span>';
  }
  if (!ISO_REVISION_PATTERN.test(v)) {
    const folder = (cell.getRow().getData().folder_path || "").toString();
    let reason = "Incorrect format. Use formats like P01, C02, or P02.03";
    if (folder.includes("PUBLISHED")) {
      reason = "Files in PUBLISHED must use the format C##";
    } else if (folder.includes("SHARED")) {
      reason = "Files in SHARED must use the format P##";
    }
    return `<span class="highlightYellow" title="${escapeHtml(reason)}">${escapeHtml(v)}</span>`;
  }
  return escapeHtml(v);
}

// File description: red Missing, yellow if it's the placeholder text.
function fileDescriptionFormatter(cell) {
  const v = cell.getValue();
  if (v === undefined || v === null || v === "") {
    return '<span class="highlight">Missing</span>';
  }
  if (v === "TIDP Placeholder File") {
    return `<span class="highlightYellow">${escapeHtml(v)}</span>`;
  }
  return escapeHtml(v);
}

// "Forma System" placeholder for empty user fields, matches old MissingUser.
function userFormatter(cell) {
  const v = cell.getValue();
  if (v === undefined || v === null || v === "") return "Forma System";
  return escapeHtml(v);
}

// Date cells: format as locale string, "Invalid Date" stays empty-ish.
function dateFormatter(cell) {
  const v = cell.getValue();
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

// Folder Path: highlights orange when a row past the approved parent
// exists (see pickWinner._hasNewerRevision) — either a WIP draft or a
// re-approved SHARED copy waiting on client sign-off. The cell content
// stays the same; the visual cue tells the user "yes this is the
// approved parent, but a newer revision is in flight".
function folderPathFormatter(cell) {
  const v = cell.getValue();
  const data = cell.getRow().getData();
  const escaped = v ? escapeHtml(v) : "";
  if (data && data._hasNewerRevision) {
    return `<span class="highlightOrange" title="New revision in progress">${escaped}</span>`;
  }
  return escaped;
}

// File URL: clickable "View" link, blank if no URL.
function fileUrlFormatter(cell) {
  const v = cell.getValue();
  if (!v) return "";
  // Only allow http(s) URLs to defuse javascript: injection.
  if (!/^https?:\/\//i.test(v)) return "";
  return `<a class="file-link" href="${escapeAttr(v)}" target="_blank" rel="noopener">View</a>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ---------- column definitions ----------

// Returns the MIDP column definitions for the active project. The Series
// column only appears for HI7411 (kept as a per-project concession).
function buildMidpColumns() {
  const isA66 = projectID === "76c59b97-feaf-413c-9bd0-43cf8aaa3133";

  const editable = () => tabulatorEditMode && !isClient;

  // MIDP and the Drawing Register variants share the same Forma custom-
  // attribute mapping (columnNamesDefault). MDR has its own (columnNamesMDR).
  const cellEdited = makeCellEditedHandler(() =>
    (typeof columnNamesDefault !== "undefined" ? columnNamesDefault : [])
  );

  // widthGrow gives a ratio when layout="fitColumns" — the wider/longer
  // columns (file name, descriptions, title lines) get a higher number
  // so they expand more than narrow value columns (revision, status,
  // version). minWidth keeps each column readable on smaller screens.
  const cols = [
    // Tiny info-icon column. Click opens the "All revisions" modal for
    // the row. Skipped for child rows (only the parent has a meaningful
    // group view).
    {
      title: "",
      field: "_modalIcon",
      width: 50,
      // widthShrink: 0 stops fitColumns from compressing the column to
      // hide the icon when the viewport is narrower than the sum of
      // preferred widths.
      widthShrink: 0,
      hozAlign: "center",
      headerSort: false,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        if (d && d._loading) return "";
        return '<i class="fa-solid fa-circle-info row-info-icon" title="View all revisions"></i>';
      },
      cellClick: (e, cell) => {
        const d = cell.getRow().getData();
        if (!d || d._loading) return;
        // Only the dedup parent has _groupSiblings populated; for
        // tree children, walk up to the parent row's data.
        const parent = cell.getRow().getTreeParent && cell.getRow().getTreeParent();
        const target = parent ? parent.getData() : d;
        openVersionsModal(target);
      },
    },
    // Tabulator auto-renders the tree-expand control in the first column
    // when dataTree is enabled, so we let it sit alongside the file name.
    { title: "File Name", field: "name", widthGrow: 3, minWidth: 220, headerFilter: "input", formatter: missingFormatter },
    { title: "Version", field: "accversion", width: 70, hozAlign: "center", headerFilter: "input" },
    { title: "File URL", field: "file_url", width: 70, hozAlign: "center", formatter: fileUrlFormatter, headerSort: false },
    { title: "Revision", field: "revision", width: 90, formatter: revisionFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Folder Path", field: "folder_path", widthGrow: 2, minWidth: 140, headerFilter: "list", headerFilterParams: { valuesLookup: "all", clearable: true }, formatter: folderPathFormatter },
    { title: "File Description", field: "file_description", widthGrow: 2, minWidth: 160, formatter: fileDescriptionFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Title Line 1", field: "title_line_1", widthGrow: 3, minWidth: 200, formatter: missingFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Title Line 2", field: "title_line_2", widthGrow: 2, minWidth: 140, formatter: missingFormatterYellow, editor: smartCellEditor, editable, cellEdited, visible: !defaultHiddenColumns.includes("Title Line 2") },
    { title: "Title Line 3", field: "title_line_3", widthGrow: 2, minWidth: 140, formatter: missingFormatterYellow, editor: smartCellEditor, editable, cellEdited, visible: !defaultHiddenColumns.includes("Title Line 3") },
    { title: "Title Line 4", field: "title_line_4", widthGrow: 2, minWidth: 140, formatter: missingFormatterYellow, editor: smartCellEditor, editable, cellEdited, visible: !defaultHiddenColumns.includes("Title Line 4") },
    { title: "Status", field: "status", width: 90, formatter: missingFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "list", headerFilterParams: { valuesLookup: "all", clearable: true } },
    { title: "Activity Code", field: "activity_code", widthGrow: 1, minWidth: 120, formatter: missingFormatterYellow, editor: smartCellEditor, editable, cellEdited, visible: !defaultHiddenColumns.includes("Activity Code") },
  ];

  if (isA66) {
    cols.push({ title: "Series", field: "series", width: 90, formatter: missingFormatterYellow, editor: smartCellEditor, editable, cellEdited });
  }

  cols.push(
    { title: "Last Modified User", field: "last_modified_user", width: 150, formatter: userFormatter, visible: !defaultHiddenColumns.includes("Last Modified User") },
    { title: "Last Modified Date", field: "last_modified_date", width: 160, formatter: dateFormatter, visible: !defaultHiddenColumns.includes("Last Modified Date") },
    { title: "Created by", field: "created_by_user", width: 150, formatter: userFormatter, visible: !defaultHiddenColumns.includes("Created by") },
    { title: "Spatial", field: "spatial", widthGrow: 1, minWidth: 100, formatter: missingFormatterYellow, visible: !defaultHiddenColumns.includes("Spatial") }
  );

  return cols;
}

// ---------- lazy version expand ----------

// Cache: lineageURN → array of older-version row objects (in files[] shape).
// Lives in sessionStorage so re-expanding the same row in the same tab
// session avoids a second round-trip.
function getVersionCache() {
  try {
    return JSON.parse(sessionStorage.getItem("midpVersionsCache") || "{}");
  } catch (e) {
    return {};
  }
}
function setVersionCache(c) {
  try {
    sessionStorage.setItem("midpVersionsCache", JSON.stringify(c));
  } catch (e) {
    /* quota exceeded — fine, the cache is best-effort */
  }
}

// Maps an `/items/{id}/versions` API record onto the row shape used by
// the table (matches addToFilesArray for the basic fields; custom attrs
// are filled in by a follow-up batch-get call below).
function versionToFileRow(versionItem, parentRowData) {
  const id = versionItem.id; // e.g. urn:adsk.wipemea:fs.file:vf.XXX?version=2
  const accversion =
    (versionItem.attributes && versionItem.attributes.versionNumber) ||
    parseInt((id || "").split("=")[1] || "1", 10);
  const rawProjectID = (projectID || "").replace("b.", "");
  // Forma's webView link from /items/.../versions points at the specific
  // version, but our preference is the lineage-based URL the parent row
  // uses so the View link is consistent. Fall back to webView if no parent.
  const region = (id || "").includes("wipemea") ? "eu" : "com";
  const lineageURN = (parentRowData && parentRowData.itemID) || "";
  const folderURN = (parentRowData && parentRowData.folderID) || (parentRowData && parentRowData.folderid) || "";
  const fileUrl = lineageURN && folderURN
    ? `https://acc.autodesk.${region}/docs/files/projects/${rawProjectID}?folderUrn=${encodeURIComponent(folderURN)}&entityId=${encodeURIComponent(lineageURN)}&viewModel=detail&moduleId=folders`
    : (versionItem.links && versionItem.links.webView && versionItem.links.webView.href) || "";

  return {
    name: versionItem.attributes && versionItem.attributes.displayName,
    accversion: accversion,
    file_url: fileUrl,
    revision: undefined,
    folder_path: undefined,
    folderid: undefined,
    function: "",
    file_description: undefined,
    title_line_1: undefined,
    title_line_2: undefined,
    title_line_3: undefined,
    title_line_4: undefined,
    last_modified_user:
      versionItem.attributes && versionItem.attributes.lastModifiedUserName,
    last_modified_date:
      versionItem.attributes && versionItem.attributes.lastModifiedTime,
    // Captured purely for sort ordering — createTime is when this version
    // was first uploaded into its folder, which tracks the ISO 19650
    // lifecycle. lastModifiedTime gets bumped by post-approval metadata
    // edits (comments, attribute changes) and lies about lifecycle order.
    _createTime:
      versionItem.attributes && versionItem.attributes.createTime,
    created_by_user:
      versionItem.attributes && versionItem.attributes.createUserName,
    status: "",
    activity_code: undefined,
    id: id,
    itemID: undefined, // older versions don't need their own itemID
    spatial: "",
  };
}

// Called by Tabulator when the user clicks the chevron on a row that has
// older versions. We swap the placeholder _children for the real list,
// then update the row so the tree refreshes.
async function loadOlderVersionsForRow(row) {
  const data = row.getData();
  if (data._versionsFetched || !data.itemID) return;
  data._versionsFetched = true; // optimistic — prevents double-fire

  const rawProjectID = (projectID || "").replace("b.", "");
  const cache = getVersionCache();

  let olderRows;
  if (cache[data.itemID]) {
    olderRows = cache[data.itemID];
  } else {
    if (!accesToken && typeof getAccessToken === "function") {
      accesToken = await getAccessToken("data:read data:write");
    }
    const versions = await getItemVersions(accesToken, rawProjectID, data.itemID);
    // Drop the version that's already shown as the parent row.
    const olderVersions = (versions || []).filter((v) => v.id !== data.id);
    olderRows = olderVersions.map((v) => versionToFileRow(v, data));

    // Fill in custom attributes for those older versions in one batch.
    const urns = olderRows.map((r) => r.id).filter(Boolean);
    if (urns.length && typeof getCustomDetailsBatch === "function") {
      const results = await getCustomDetailsBatch(accesToken, urns);
      const limit = Math.min(results.length, olderRows.length);
      for (let i = 0; i < limit; i++) {
        const attrs = {};
        for (const a of (results[i] && results[i].customAttributes) || []) {
          attrs[a.name] = a.value;
        }
        if (typeof applyAttrsToFile === "function") {
          applyAttrsToFile(olderRows[i], attrs);
        }
      }
    }

    cache[data.itemID] = olderRows;
    setVersionCache(cache);
  }

  // Replace the placeholder children with the real list (or an empty
  // array if the file actually only has one version after all).
  row.update({ _children: olderRows.length ? olderRows : null });
}

// Fetches the full version history for a MIDP parent row's dedup
// group (parent's lineage + every sibling's lineage), merges them into
// one list, fills in custom attributes via a single batch-get, sorts
// newest-first by createTime, and caches the result in sessionStorage.
//
// The returned list ALWAYS includes the parent's current version (the
// row that's already shown in the table). Callers that want a children-
// only view (the chevron expand) must filter it out — see
// loadGroupHistoryForRow. Callers that want the complete picture (the
// "All revisions" modal) use it as-is.
async function getGroupHistory(parentData) {
  const cache = getVersionCache();
  // Cache key includes:
  //   • a version segment — bump when the cached row shape or sort
  //     order changes, so stale entries are silently dropped.
  //   • fileData.updated — PA extract timestamp. Without this the
  //     cache survives across reloads (sessionStorage doesn't clear on
  //     refresh), so freshly-uploaded versions in Forma stay invisible
  //     until the tab is closed. New PA extract → new key → fresh fetch.
  const extractTs =
    typeof fileData !== "undefined" && fileData && fileData.updated
      ? fileData.updated
      : "noupd";
  const cacheKey = `group:v4:${extractTs}:${parentData.itemID || parentData.id}`;
  if (cache[cacheKey]) return cache[cacheKey];

  if (!accesToken && typeof getAccessToken === "function") {
    accesToken = await getAccessToken("data:read data:write");
  }

  const rawProjectID = (projectID || "").replace("b.", "");
  const siblings = Array.isArray(parentData._groupSiblings)
    ? parentData._groupSiblings
    : [];
  // Parent + each sibling are separate Forma lineages — fetch all version
  // histories in parallel.
  const lineages = [
    { context: parentData, lineage: parentData.itemID },
    ...siblings
      .filter((s) => s && s.itemID)
      .map((s) => ({ context: s, lineage: s.itemID })),
  ].filter((l) => l.lineage);

  const versionsLists = await Promise.all(
    lineages.map((l) => getItemVersions(accesToken, rawProjectID, l.lineage))
  );

  const merged = [];
  for (let i = 0; i < lineages.length; i++) {
    const { context } = lineages[i];
    for (const v of versionsLists[i] || []) {
      const r = versionToFileRow(v, context);
      // Inherit folder context from whichever sibling owns this lineage
      // so each row renders with the correct WIP/SHARED/PUBLISHED path.
      r.folder_path = context.folder_path;
      r.folderid = context.folderid || context.folderID;
      r.itemID = context.itemID;
      merged.push(r);
    }
  }

  // One batch-get pulls custom attrs (revision, status, title lines) for
  // every version row in a single round trip.
  const urns = merged.map((r) => r.id).filter(Boolean);
  if (urns.length && typeof getCustomDetailsBatch === "function") {
    const results = await getCustomDetailsBatch(accesToken, urns);
    const limit = Math.min(results.length, merged.length);
    for (let i = 0; i < limit; i++) {
      const attrs = {};
      for (const a of (results[i] && results[i].customAttributes) || []) {
        attrs[a.name] = a.value;
      }
      if (typeof applyAttrsToFile === "function") {
        applyAttrsToFile(merged[i], attrs);
      }
    }
  }

  // Newest-first by creation time. createTime is the truthful lifecycle
  // signal — revision rank can't infer when C## was approved from a
  // non-matching P-major, and lastModifiedTime gets bumped by metadata
  // edits long after the version was issued.
  merged.sort((a, b) => compareByCreation(b, a));

  cache[cacheKey] = merged;
  setVersionCache(cache);
  return merged;
}

// MIDP chevron handler. Loads the group history (cached) and feeds it
// to Tabulator's tree-expand as children, dropping the parent row's
// current version since it's already shown above the chevron.
async function loadGroupHistoryForRow(row) {
  const data = row.getData();
  if (data._versionsFetched) return;
  data._versionsFetched = true; // optimistic — prevents double-fire
  const all = await getGroupHistory(data);
  const children = all.filter((r) => r.id !== data.id);
  row.update({ _children: children.length ? children : null });
}

// "All revisions" modal: dedupes the group history to one row per
// logical revision (highest accversion wins for repeated uploads of the
// same revision), sorts ascending by revision rank so the file's
// lifecycle reads top-to-bottom, and renders Doc No / Revision /
// Folder. The approved parent gets the green row class; the highest-
// rank revision past the parent (if any) gets the orange row class.
async function openVersionsModal(parentData) {
  const modal = document.getElementById("versionsModal");
  if (!modal) return;
  const tbody = modal.querySelector("#versionsModalTable tbody");
  const titleEl = modal.querySelector("#versionsModalTitle");
  const loadingEl = modal.querySelector("#versionsModalLoading");
  const tableEl = modal.querySelector("#versionsModalTable");
  if (!tbody || !tableEl || !loadingEl) return;

  const { docNo } = parseDocNumber(parentData && parentData.name || "");
  if (titleEl) titleEl.textContent = `All revisions — ${docNo || "Document"}`;
  tbody.innerHTML = "";
  loadingEl.textContent = "Loading…";
  loadingEl.style.display = "block";
  tableEl.style.display = "none";
  modal.style.display = "block";

  let all;
  try {
    all = await getGroupHistory(parentData);
  } catch (e) {
    loadingEl.textContent = "Failed to load revisions.";
    return;
  }

  // One row per logical revision — when a single revision (e.g. P01.03)
  // has multiple Forma uploads, keep the highest accversion.
  const byRev = new Map();
  for (const r of all || []) {
    if (!r) continue;
    const key = r.revision || `__norev_${r.id}`;
    const existing = byRev.get(key);
    if (!existing || (r.accversion || 0) > (existing.accversion || 0)) {
      byRev.set(key, r);
    }
  }
  const rows = Array.from(byRev.values()).sort(
    (a, b) => revisionRank(a.revision) - revisionRank(b.revision)
  );

  // Highlight rows: green = approved parent (matched on revision +
  // folder so we don't accidentally tag a different row that shares the
  // revision); orange = single highest-rank row past the parent.
  const parentRev = parentData.revision;
  const parentFolder = parentData.folder_path;
  const parentRank = revisionRank(parentRev);
  let orangeRow = null;
  for (const r of rows) {
    if (revisionRank(r.revision) > parentRank) {
      if (!orangeRow || revisionRank(r.revision) > revisionRank(orangeRow.revision)) {
        orangeRow = r;
      }
    }
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.revision === parentRev && r.folder_path === parentFolder) {
      tr.classList.add("modal-row-approved");
    } else if (orangeRow && r === orangeRow) {
      tr.classList.add("modal-row-pending");
    }
    // Only http(s) URLs — same defence the Tabulator formatter uses.
    const docNoCell =
      r.file_url && /^https?:\/\//i.test(r.file_url)
        ? `<a class="file-link" href="${escapeAttr(r.file_url)}" target="_blank" rel="noopener">${escapeHtml(docNo)}</a>`
        : escapeHtml(docNo);
    tr.innerHTML =
      `<td>${docNoCell}</td>` +
      `<td>${escapeHtml(r.revision || "")}</td>` +
      `<td>${escapeHtml(r.folder_path || "")}</td>`;
    tbody.appendChild(tr);
  }

  loadingEl.style.display = "none";
  tableEl.style.display = "table";
}

// Wires the close button and click-outside-to-close behaviour for the
// versions modal. Idempotent — safe to call on every initMidpTable.
function wireVersionsModal() {
  const modal = document.getElementById("versionsModal");
  if (!modal || modal._wired) return;
  modal._wired = true;
  const closeBtn = modal.querySelector("#versionsModalClose");
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}

// Wires the "↻ Refresh data" button. Clicking clears the per-tab caches
// (group history, custom-attribute definitions for this project) and
// reloads the page so PA's latest extract is pulled fresh. Cache busts
// matter because sessionStorage survives reloads — without these clears
// the new extract's data would be served from stale entries until the
// tab is closed.
//
// After 30 minutes — roughly PA's extract cycle — the button picks up a
// "stale" class so users see at a glance that newer data may exist
// without having to remember when they opened the tab.
(function wireRefreshButton() {
  const btn = document.getElementById("refreshDataBtn");
  if (!btn || btn._wired) return;
  btn._wired = true;
  btn.addEventListener("click", () => {
    try {
      sessionStorage.removeItem("midpVersionsCache");
      const raw = (typeof projectID === "string" ? projectID : "").replace(
        "b.",
        ""
      );
      if (raw) sessionStorage.removeItem(`customAttrs_${raw}`);
    } catch (e) {
      /* sessionStorage unavailable — reload alone will still pull fresh PA data */
    }
    window.location.reload();
  });
  setTimeout(() => {
    btn.classList.add("stale");
    btn.title =
      "PA's data extract has likely refreshed since you opened this tab — click to reload with fresh data.";
  }, 30 * 60 * 1000);
})();

// ---------- doc-number dedup (MIDP) ----------
//
// In ISO 19650 workflows the same document exists across multiple folders
// (WIP / SHARED / PUBLISHED) at different revisions. The MIDP tab surfaces
// only the latest row per docNo + extension; older revisions of that doc
// become expandable children under the winner. "Latest" = max
// last_modified_date, with revision rank (C## > P## > P##.##) and folder
// rank (PUBLISHED > SHARED > WIP) as tiebreakers.

function parseDocNumber(filename) {
  const s = String(filename || "");
  const i = s.lastIndexOf(".");
  if (i < 0) return { docNo: s, ext: "" };
  return { docNo: s.slice(0, i), ext: s.slice(i + 1).toLowerCase() };
}

// Cycle-aware rank: each P-major occupies 200 slots so the natural
// lifecycle order falls out of integer comparison.
//   slots 1-99   →  P##.01 … P##.99   (WIP drafts of that major)
//   slot 100     →  P##                (internally approved → SHARED)
//   slot 101     →  C##                (client approved → PUBLISHED)
//   next major starts at +200
// Caveat: assumes C## was approved from the P-major of the same number.
// If a project skips an internal cycle (e.g. P01 never went to client,
// goes P01 → P02 → C01) the C row will sort earlier than it really
// belongs. Rare in practice — date acts as a soft tiebreaker.
function revisionRank(rev) {
  if (rev === undefined || rev === null || rev === "") return -1;
  const m = String(rev).match(/^([CP])(\d{2})(?:\.(\d{2}))?$/);
  if (!m) return 0;
  const letter = m[1];
  const major = parseInt(m[2], 10);
  const minor = m[3] === undefined ? null : parseInt(m[3], 10);
  const cycleBase = (major - 1) * 200;
  if (letter === "P") {
    return cycleBase + (minor !== null ? minor : 100);
  }
  return cycleBase + 101; // C##
}

function folderRank(folderPath) {
  const fp = String(folderPath || "").toUpperCase();
  if (fp.includes("PUBLISHED")) return 3;
  if (fp.includes("SHARED")) return 2;
  if (fp.includes("WIP")) return 1;
  return 0;
}

// Negative if a is older than b, positive if newer. Revision rank is the
// primary signal — WIP files can be touched after their SHARED copy is
// approved, so last_modified_date is misleading within a P-cycle. Date
// acts as a tiebreaker (and as the salvage path when revisions don't
// parse). Folder rank is the final tiebreaker.
function compareLatest(a, b) {
  const dr = revisionRank(a && a.revision) - revisionRank(b && b.revision);
  if (dr !== 0) return dr;
  const da = new Date((a && a.last_modified_date) || 0).getTime() || 0;
  const db = new Date((b && b.last_modified_date) || 0).getTime() || 0;
  if (da !== db) return da - db;
  return folderRank(a && a.folder_path) - folderRank(b && b.folder_path);
}

// Used for sorting expanded-chevron children. createTime is the most
// reliable lifecycle signal — it captures when a revision was first
// uploaded into its folder, not when someone last poked at the file. It
// also handles cross-cycle cases the revision-rank scheme can't infer
// (e.g. C01 approved from P02 instead of P01). When createTime is
// missing for whatever reason we fall back to revision rank, then
// last_modified_date.
function compareByCreation(a, b) {
  const ca = a && a._createTime ? new Date(a._createTime).getTime() : 0;
  const cb = b && b._createTime ? new Date(b._createTime).getTime() : 0;
  if (ca && cb && ca !== cb) return ca - cb;
  const dr = revisionRank(a && a.revision) - revisionRank(b && b.revision);
  if (dr !== 0) return dr;
  const da = new Date((a && a.last_modified_date) || 0).getTime() || 0;
  const db = new Date((b && b.last_modified_date) || 0).getTime() || 0;
  return da - db;
}

// Picks the parent (winner) row for a dedup group. The MIDP team treats
// SHARED and PUBLISHED as "approved" — those are the revisions everyone
// downstream consumes — so the parent always comes from there if
// possible, with WIP only used as a fallback for documents that haven't
// been approved yet.
//
// Policy currently implemented: option (b) — PUBLISHED beats SHARED
// regardless of revision rank, so a client-approved C01 stays the
// parent even if a re-approved P02 sits in SHARED. To switch to option
// (a) (highest revision rank within the approved set wins) replace the
// `approved.sort(...)` line with `approved.sort((a, b) =>
// compareLatest(b, a))`.
//
// Returns { winner, hasNewerRevision } where hasNewerRevision is true
// when *any* other row in the group has a revision rank greater than
// the approved winner's — signalling "new revision in progress" for the
// orange folder-path indicator. That covers two scenarios:
//   • WIP draft past the approved parent (P02.01 above C01)
//   • SHARED re-approval past a PUBLISHED parent (P02 above C01) — the
//     newer revision is waiting on client approval.
function pickWinner(group) {
  const approved = group.filter((r) => folderRank(r.folder_path) >= 2);
  let winner;
  let fromApproved;
  if (approved.length > 0) {
    // PUBLISHED first, then SHARED; revision rank only as a within-folder
    // tiebreaker (e.g. two PUBLISHED rows with different C revisions).
    approved.sort(
      (a, b) =>
        folderRank(b.folder_path) - folderRank(a.folder_path) ||
        compareLatest(b, a)
    );
    winner = approved[0];
    fromApproved = true;
  } else {
    const sorted = group.slice().sort((a, b) => compareLatest(b, a));
    winner = sorted[0];
    fromApproved = false;
  }
  let hasNewerRevision = false;
  if (fromApproved) {
    const winnerRank = revisionRank(winner.revision);
    hasNewerRevision = group.some(
      (r) => r !== winner && revisionRank(r.revision) > winnerRank
    );
  }
  return { winner, hasNewerRevision };
}

// Groups rows by docNo + extension, picks an approved-preferring parent
// per group (see pickWinner), and stashes the other group members on
// `_groupSiblings` for the chevron-expand handler to consume. The actual
// `_children` is just a "Loading…" placeholder until the user expands —
// at which point loadGroupHistoryForRow fetches the full lineage history
// for the parent + every sibling and replaces the placeholder with the
// merged, sorted list.
function dedupByDocNumber(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row || !row.name) continue;
    const { docNo, ext } = parseDocNumber(row.name);
    const key = `${docNo}|${ext}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const winners = [];
  for (const group of groups.values()) {
    // Reset stale tree state from any previous pass — a row that was a
    // winner before may now be a child (or vice-versa).
    for (const r of group) {
      delete r._children;
      delete r._versionsFetched;
      delete r._groupSiblings;
      delete r._hasNewerRevision;
    }
    const { winner, hasNewerRevision } = pickWinner(group);
    const rest = group.filter((r) => r !== winner);
    if (rest.length > 0) {
      // Sibling files exist in other folders — chevron will fetch the
      // full lineage history for parent + siblings on demand.
      winner._groupSiblings = rest;
      winner._children = [{ _loading: true, name: "Loading revisions…" }];
    } else if (winner.accversion > 1) {
      // Singleton document but its lineage has prior versions — keep a
      // chevron so the user can still drill into the file's history.
      winner._groupSiblings = [];
      winner._children = [{ _loading: true, name: "Loading older versions…" }];
    }
    if (hasNewerRevision) winner._hasNewerRevision = true;
    winners.push(winner);
  }
  return winners;
}

// ---------- main entry point ----------

// (Re)builds or refreshes the MIDP Tabulator from the current `files[]`.
// Called by openTab("MIDP") and again at the end of enrichment.
async function initMidpTable() {
  const host = document.getElementById("dataTable");
  if (!host) return;

  // Collapse duplicates of the same document (across WIP/SHARED/PUBLISHED)
  // into a single parent row whose chevron reveals the older revisions.
  const dedupedFiles = dedupByDocNumber(files);

  if (tabulators.MIDP) {
    await tabulators.MIDP.replaceData(dedupedFiles);
    tabulators.MIDP.redraw(true);
  } else {
    tabulators.MIDP = new Tabulator(host, {
      data: dedupedFiles,
      // fitColumns + per-column widthGrow makes the table fill the
      // viewport with weighted column widths instead of overflowing
      // off-screen.
      layout: "fitColumns",
      height: "calc(100vh - 360px)",
      placeholder: "No files",
      columns: buildMidpColumns(),
      dataTree: true,
      dataTreeStartExpanded: false,
      dataTreeChildField: "_children",
      dataTreeChildIndent: 18,
      dataTreeBranchElement: false,
      // Render the +/- tree-expand control on the File Name column so
      // it doesn't compete with the info icon for space in column 1.
      dataTreeElementColumn: "name",
      reactiveData: false,
      index: "id",
      // Tag parent rows that have children with a class so we can give
      // them a distinct background — visual cue that "this row has
      // older versions you can expand".
      rowFormatter: function (row) {
        const data = row.getData();
        if (data && data._children) {
          row.getElement().classList.add("has-children");
        } else {
          row.getElement().classList.remove("has-children");
        }
      },
    });

    tabulators.MIDP.on("dataTreeRowExpanded", (row) => {
      // Only fire the network call once per row. MIDP uses the group-
      // history loader so the chevron reveals all revisions across
      // sibling folders, not just the parent's lineage versions.
      const data = row.getData();
      if (!data._versionsFetched) loadGroupHistoryForRow(row);
    });

    // Keep the Reset Filters button's "active" state in sync with
    // whether any kind of filter is currently applied.
    tabulators.MIDP.on("dataFiltered", () => tabulatorUpdateResetButton());
  }

  // Update the file-count label that the existing layout shows next to
  // the table title — deduped count of unique documents, not raw rows.
  const countEl = document.getElementById("MIDPCount");
  if (countEl) countEl.textContent = `(${dedupedFiles.length} documents)`;

  wireVersionsModal();
}

// ---------- search / export / edit-toggle wiring ----------

function tabulatorSearch(query) {
  // Backwards-compat shim used by the MIDP openTab branch — delegates to
  // the generalised any-tab implementation.
  return tabulatorSearchAny("MIDP", query);
}

// Backwards-compat shim used by the MIDP openTab branch.
function tabulatorClearFilters() {
  return tabulatorClearFiltersAny("MIDP");
}

// Toggles the "active" styling on the Reset button for the given tab so
// it stands out while any filter (chart, header, or search) is in effect.
function tabulatorUpdateResetButton(tabKey) {
  tabKey = tabKey || "MIDP";
  const ids = TAB_TOOLBAR_IDS[tabKey];
  if (!ids) return;
  const btn = document.getElementById(ids.reset);
  const t = tabulators[tabKey];
  if (!btn || !t) return;
  const programmatic = (t.getFilters && t.getFilters().length) || 0;
  const header = (t.getHeaderFilters && t.getHeaderFilters().length) || 0;
  const search = (document.getElementById(ids.search) || {}).value || "";
  const active = programmatic > 0 || header > 0 || search.length > 0;
  btn.classList.toggle("active", active);
}

// Looks up the custom-attribute definition for a column field name and
// returns its dropdown options if it's a list-type attribute. Returns
// null for free-text attributes (or if the definitions haven't loaded
// yet — that happens before the user first toggles edit mode, when the
// editor falls back to a plain input anyway).
function getDropdownOptions(fieldName) {
  if (typeof customAttributes === "undefined" || !Array.isArray(customAttributes)) return null;
  // Reverse-lookup the Forma display name from our short field key.
  const accName = Object.keys(ATTR_NAME_MAP).find((k) => ATTR_NAME_MAP[k] === fieldName);
  if (!accName) return null;
  const attr = customAttributes.find((a) => a.name === accName);
  if (!attr) return null;
  // Forma's actual schema (as exposed via /custom-attribute-definitions):
  //   { type: "array", arrayValues: [...] }   — dropdown
  //   { type: "string" }                      — free-text
  //   { type: "date" }                        — date
  // The `list` / `drop` aliases are kept for resilience against future
  // schema shifts, but `array` + `arrayValues` is what we hit today.
  const isList =
    attr.type === "array" ||
    attr.type === "list" ||
    attr.type === "drop" ||
    attr.type === "dropdown";
  if (!isList) return null;
  const opts =
    attr.arrayValues ||
    (attr.metadata && attr.metadata.list && attr.metadata.list.options) ||
    attr.dropdownOptions ||
    attr.options;
  if (!Array.isArray(opts)) return null;
  return opts
    .map((o) => (typeof o === "string" ? o : o.value || o.displayName || o.name || o.label || ""))
    .filter((v) => v !== "");
}

// Custom Tabulator editor: shows a <select> when the field is a list-
// type Forma custom attribute, falling back to a plain text <input> for
// free-text attributes. Keeps edits aligned with what Forma will accept.
function smartCellEditor(cell, onRendered, success, cancel) {
  const fieldName = cell.getColumn().getField();
  const opts = getDropdownOptions(fieldName);

  if (opts && opts.length) {
    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.boxSizing = "border-box";
    select.style.padding = "4px";
    // Empty option lets the user clear the value if needed.
    const blank = document.createElement("option");
    blank.value = "";
    blank.text = "";
    select.appendChild(blank);
    for (const opt of opts) {
      const option = document.createElement("option");
      option.value = opt;
      option.text = opt;
      if (cell.getValue() === opt) option.selected = true;
      select.appendChild(option);
    }
    onRendered(() => {
      select.focus();
      // showPicker() pops the native dropdown open immediately so the
      // user doesn't have to click the chevron after clicking the cell.
      // Supported in Chrome 99+, Firefox 101+, Safari 16.4+. Wrapped in
      // try/catch because some browser configurations refuse it without
      // an active user gesture (we still have one from the cell click).
      if (typeof select.showPicker === "function") {
        try { select.showPicker(); } catch (e) { /* graceful fallback */ }
      }
    });
    select.addEventListener("change", () => success(select.value));
    select.addEventListener("blur", () => success(select.value));
    select.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cancel();
    });
    return select;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = cell.getValue() != null ? cell.getValue() : "";
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  input.style.padding = "4px";
  onRendered(() => {
    input.focus();
    input.select();
  });
  input.addEventListener("change", () => success(input.value));
  input.addEventListener("blur", () => success(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") success(input.value);
    if (e.key === "Escape") cancel();
  });
  return input;
}

// ---------- pending-edits cache ----------
//
// The PA extract runs on a fixed schedule (~30 min) so freshly PATCHed
// cell values don't show on a refresh until the next extract pulls them
// out of Forma. We bridge that gap by caching successful edits in
// localStorage with a timestamp, and overlaying them on the loaded data
// whenever the edit timestamp is newer than the PA extract timestamp
// (fileData.updated). Once PA catches up, the entry is older than the
// new extract and we drop it on the next load.

function pendingEditsKey() {
  const raw = (typeof projectID === "string" ? projectID : "").replace("b.", "");
  return `pendingEdits_${raw}`;
}

function loadPendingEdits() {
  try {
    return JSON.parse(localStorage.getItem(pendingEditsKey()) || "{}");
  } catch (e) {
    return {};
  }
}

function savePendingEdits(pe) {
  try {
    localStorage.setItem(pendingEditsKey(), JSON.stringify(pe));
  } catch (e) {
    console.warn("Could not persist pending edits:", e);
  }
}

// Records a successful edit so it survives until PA's next extract.
function markCellEdited(urn, fieldName, value) {
  if (!urn || !fieldName) return;
  const pe = loadPendingEdits();
  if (!pe[urn]) pe[urn] = {};
  pe[urn][fieldName] = { value: value, timestamp: Date.now() };
  savePendingEdits(pe);
}

// Walks pendingEdits, overlays any entry newer than the current PA
// extract on top of the in-memory `files[]` rows, and drops any entry
// older than the extract (PA has caught up, no overlay needed).
function applyPendingEdits() {
  if (typeof files === "undefined" || !Array.isArray(files)) return;
  const extractTs =
    typeof fileData !== "undefined" && fileData && fileData.updated
      ? new Date(fileData.updated).getTime()
      : 0;
  const pe = loadPendingEdits();
  const next = {};
  let applied = 0;
  let dropped = 0;

  for (const urn in pe) {
    const fields = pe[urn] || {};
    const fileRow = files.find((f) => f && f.id === urn);
    const keep = {};
    for (const field in fields) {
      const edit = fields[field];
      if (!edit || typeof edit.timestamp !== "number") continue;
      if (edit.timestamp > extractTs) {
        // Edit is newer than the extract — overlay it.
        if (fileRow) {
          fileRow[field] = edit.value;
          applied++;
        }
        keep[field] = edit;
      } else {
        // Extract has caught up; this entry is no longer needed.
        dropped++;
      }
    }
    if (Object.keys(keep).length > 0) next[urn] = keep;
  }

  savePendingEdits(next);
  if (applied || dropped) {
    console.log(
      `Pending edits — overlaid ${applied}, dropped ${dropped} stale (extract ts ${new Date(extractTs).toISOString()}).`
    );
  }
}

// Generic cell-edited factory. Each tab uses a different Forma custom-
// attribute mapping (columnNamesDefault for MIDP/DR/SHEAF, columnNamesMDR
// for MDR), so we close over the right one when wiring columns.
function makeCellEditedHandler(getMapping) {
  return async (cell) => {
    const file = cell.getRow().getData();
    const fieldName = cell.getColumn().getField();
    const fieldLabel = cell.getColumn().getDefinition().title || fieldName;
    const newValue = cell.getValue();
    const mapping = (typeof getMapping === "function" ? getMapping() : []) || [];
    const colDef = mapping.find((c) => c.columnName === fieldName);
    if (!colDef) {
      console.warn(`No Forma attribute mapping for field "${fieldName}" — skipping PATCH`);
      if (typeof showPopup === "function") {
        showPopup("Update skipped", `No Forma attribute mapping for &quot;${fieldLabel}&quot;`);
      }
      return;
    }
    if (typeof postCustomItemDetails !== "function") return;
    try {
      const result = await postCustomItemDetails(accesToken, colDef.columnId, newValue, file.id);
      if (typeof showPopup !== "function") return;
      if (result && result.ok) {
        // Record the edit so it survives a refresh until PA's next
        // extract reflects it back through the file_list payload.
        markCellEdited(file.id, fieldName, newValue);
        showPopup(`${file.name || "File"} updated`, `${fieldLabel} set to &quot;${newValue}&quot;`);
      } else {
        const status = result && result.status ? ` (HTTP ${result.status})` : "";
        showPopup("Update failed" + status, `${file.name || "File"} — Forma rejected the change to ${fieldLabel}`);
      }
    } catch (err) {
      if (typeof showPopup === "function") {
        showPopup("Update failed", `${file.name || "File"} — ${err && err.message ? err.message : err}`);
      }
    }
  };
}

// Common Tabulator config for all four tabs. Each tab's init wraps this
// with its own data, columns, and cellEdited mapping.
function commonMidpStyleOptions(data, columns) {
  return {
    data: data,
    layout: "fitColumns",
    height: "calc(100vh - 360px)",
    placeholder: "No files",
    columns: columns,
    dataTree: true,
    dataTreeStartExpanded: false,
    dataTreeChildField: "_children",
    dataTreeChildIndent: 18,
    dataTreeBranchElement: false,
    reactiveData: false,
    index: "id",
    rowFormatter: function (row) {
      const data = row.getData();
      if (data && data._children) {
        row.getElement().classList.add("has-children");
      } else {
        row.getElement().classList.remove("has-children");
      }
    },
  };
}

// ---------- Drawing Register columns ----------

function buildDrawingRegisterColumns(tabKey) {
  const editable = () => tabulatorEditMode && !isClient;
  const cellEdited = makeCellEditedHandler(() =>
    (typeof columnNamesDefault !== "undefined" ? columnNamesDefault : [])
  );
  return [
    { title: "File Name", field: "name", widthGrow: 3, minWidth: 220, headerFilter: "input", formatter: missingFormatter },
    { title: "Version", field: "accversion", width: 70, hozAlign: "center", headerFilter: "input" },
    { title: "File URL", field: "file_url", width: 70, hozAlign: "center", formatter: fileUrlFormatter, headerSort: false },
    { title: "Revision", field: "revision", width: 90, formatter: revisionFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Folder Path", field: "folder_path", widthGrow: 2, minWidth: 140, headerFilter: "list", headerFilterParams: { valuesLookup: "all", clearable: true } },
    { title: "File Description", field: "file_description", widthGrow: 2, minWidth: 160, formatter: fileDescriptionFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Title Line 1", field: "title_line_1", widthGrow: 3, minWidth: 200, formatter: missingFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Status", field: "status", width: 90, formatter: missingFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "list", headerFilterParams: { valuesLookup: "all", clearable: true } },
    { title: "Issued", field: "last_modified_date", width: 160, formatter: dateFormatter },
  ];
}

// Legacy filter rules from generateDrawingRegisterTable / SHEAF variant —
// keep them as data so they stay readable as the spec evolves.
function filterForDrawingRegister(rows) {
  return (rows || []).filter((item) => {
    const rev = item && item.revision;
    const form = (item && item.form) || "";
    const deliverable = (item && item.deliverable) || "";
    return (rev && String(rev).includes("C") && form.includes("DR")) || deliverable.includes("Yes");
  });
}

function filterForSheafDrawingRegister(rows) {
  let filtered = rows || [];
  if (typeof isClient !== "undefined" && isClient) {
    filtered = filtered.filter((item) => {
      const fp = (item && item.folder_path) || "";
      return fp.includes("PUBLISHED") || fp.includes("0F.SHARED_TO_CLIENT");
    });
  }
  return filtered.filter((item) => {
    const form = (item && item.form) || "";
    const deliverable = (item && item.deliverable) || "";
    return form.includes("DR") || form.includes("SH") || deliverable.includes("Yes");
  });
}

async function initDrawingRegisterTable() {
  const host = document.getElementById("dataTableDR");
  if (!host) return;
  const data = filterForDrawingRegister(files);
  for (const f of data) {
    if (f && f.accversion > 1 && !f._versionsFetched) {
      f._children = [{ _loading: true, name: "Loading older versions…" }];
    }
  }
  if (tabulators.DR) {
    await tabulators.DR.replaceData(data);
    tabulators.DR.redraw(true);
  } else {
    tabulators.DR = new Tabulator(host, commonMidpStyleOptions(data, buildDrawingRegisterColumns("DR")));
    tabulators.DR.on("dataTreeRowExpanded", (row) => {
      if (!row.getData()._versionsFetched) loadOlderVersionsForRow(row);
    });
    tabulators.DR.on("dataFiltered", () => tabulatorUpdateResetButton("DR"));
  }
  const countEl = document.getElementById("DRCount");
  if (countEl) countEl.textContent = `(${data.length} files)`;
}

async function initSheafDrawingRegisterTable() {
  const host = document.getElementById("dataTableDRSHEAF");
  if (!host) return;
  const data = filterForSheafDrawingRegister(files);
  for (const f of data) {
    if (f && f.accversion > 1 && !f._versionsFetched) {
      f._children = [{ _loading: true, name: "Loading older versions…" }];
    }
  }
  if (tabulators.DRSHEAF) {
    await tabulators.DRSHEAF.replaceData(data);
    tabulators.DRSHEAF.redraw(true);
  } else {
    tabulators.DRSHEAF = new Tabulator(host, commonMidpStyleOptions(data, buildDrawingRegisterColumns("DRSHEAF")));
    tabulators.DRSHEAF.on("dataTreeRowExpanded", (row) => {
      if (!row.getData()._versionsFetched) loadOlderVersionsForRow(row);
    });
    tabulators.DRSHEAF.on("dataFiltered", () => tabulatorUpdateResetButton("DRSHEAF"));
  }
  const countEl = document.getElementById("DRCountSHEAF");
  if (countEl) countEl.textContent = `(${data.length} files)`;
}

// ---------- per-tab toolbar wiring ----------

// Maps a tab key to its DOM ids for the toolbar (search box and reset
// button). Lets the wiring helpers stay tab-agnostic.
const TAB_TOOLBAR_IDS = {
  MIDP: { search: "searchInput", reset: "resetFiltersBtn" },
  DR: { search: "searchInputDR", reset: "resetFiltersBtnDR" },
  DRSHEAF: { search: "searchInputDRSHEAF", reset: "resetFiltersBtnDRSHEAF" },
};

function tabulatorSearchAny(tabKey, query) {
  const t = tabulators[tabKey];
  if (!t) return;
  if (!query) {
    t.clearFilter(true);
    return;
  }
  const q = query.toLowerCase();
  t.setFilter((rowData) => {
    for (const k in rowData) {
      if (k.startsWith("_")) continue;
      const v = rowData[k];
      if (v != null && String(v).toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

function tabulatorClearFiltersAny(tabKey) {
  const t = tabulators[tabKey];
  if (!t) return;
  t.clearFilter(true);
  t.clearHeaderFilter();
  const ids = TAB_TOOLBAR_IDS[tabKey];
  if (ids) {
    const search = document.getElementById(ids.search);
    if (search) search.value = "";
  }
  tabulatorUpdateResetButton(tabKey);
}

function tabulatorExport(sheetName) {
  const t = tabulators.MIDP;
  if (!t) return;
  t.download("xlsx", `${sheetName || "MIDP"}.xlsx`, { sheetName: sheetName || "MIDP" });
}

// Wires the existing "⚙️ Select Columns" modal to the MIDP Tabulator
// instance — checkboxes show/hide each column and the choice persists in
// localStorage. Mirrors columnEditing() in main.js but targets Tabulator
// columns instead of DOM <th>/<td> nodes.
function tabulatorWireColumnPicker() {
  const t = tabulators.MIDP;
  if (!t) return;
  const modal = document.getElementById("columnModal");
  const openBtn = document.getElementById("openModal");
  const closeBtn = document.querySelector("#columnModal .close");
  const applyBtn = document.getElementById("applyColumns");
  const list = document.getElementById("columnSelector");
  if (!modal || !openBtn || !applyBtn || !list) return;
  const STORAGE_KEY = "columnPreferencesMIDP";

  // Load saved column visibility into Tabulator on first call.
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { prefs = {}; }
  for (const col of t.getColumns()) {
    const f = col.getField();
    if (!f) continue;
    if (prefs[f] === false) col.hide();
    else if (prefs[f] === true) col.show();
  }

  function rebuildCheckboxes() {
    list.innerHTML = "";
    for (const col of t.getColumns()) {
      const field = col.getField();
      const title = col.getDefinition().title;
      if (!field || !title) continue; // skip the chevron column
      if (["File Name", "Version", "File URL", "Folder Path"].includes(title)) continue;
      const wrap = document.createElement("label");
      wrap.style.display = "block";
      wrap.style.padding = "4px 0";
      wrap.innerHTML = `<input type="checkbox" data-field="${field}" ${col.isVisible() ? "checked" : ""}> ${title}`;
      list.appendChild(wrap);
    }
  }

  openBtn.onclick = () => {
    rebuildCheckboxes();
    modal.style.display = "block";
  };
  if (closeBtn) closeBtn.onclick = () => { modal.style.display = "none"; };
  window.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

  applyBtn.onclick = () => {
    const next = {};
    for (const cb of list.querySelectorAll('input[type="checkbox"]')) {
      const field = cb.getAttribute("data-field");
      next[field] = cb.checked;
      const col = t.getColumn(field);
      if (col) (cb.checked ? col.show() : col.hide());
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { /* noop */ }
    modal.style.display = "none";
  };
}

async function tabulatorToggleEdit() {
  if (isClient) return;
  // The first time edit mode is enabled we need the Forma custom-attribute
  // UUIDs (so cellEdited can PATCH the right attribute); cache by calling
  // getCustomDetailsData once and reusing the resulting columnNamesDefault.
  if (!tabulatorEditMode && typeof getCustomDetailsData === "function" &&
      (!Array.isArray(columnNamesDefault) || columnNamesDefault.length === 0)) {
    try {
      await getCustomDetailsData();
    } catch (e) {
      console.error("Failed to load custom-attribute definitions:", e);
    }
  }

  tabulatorEditMode = !tabulatorEditMode;
  const btn = document.getElementById("toggleEditBtn");
  if (btn) {
    btn.textContent = tabulatorEditMode ? "✔️ Disable Edit Mode" : "✏️ Enable Edit Mode";
    btn.style.backgroundColor = tabulatorEditMode ? "orange" : "";
  }
  // Redraw every initialised Tabulator instance so the editable gate is
  // re-evaluated per cell. Cheap for the inactive tabs; their virtual
  // DOM does no work when not visible.
  for (const key of Object.keys(tabulators)) {
    try { tabulators[key].redraw(true); } catch (e) { /* tab not yet open */ }
  }
}

// Override the legacy filterTable for the MIDP tab so chart-click
// filtering keeps working through Tabulator. Other tabs continue to
// use the legacy implementation defined in table_generation.js until
// batch 2.
const _legacyFilterTable = typeof window !== "undefined" ? window.filterTable : undefined;
function filterTable(label, field) {
  if (selectedTab === "MIDP" && tabulators.MIDP) {
    const t = tabulators.MIDP;
    t.clearFilter(true);
    const isMissingLabel = (l) => l === undefined || l === null || l === "" || l === "Missing";
    if (field === "statusBar") {
      // Bars are labelled by status value, with a synthetic "Missing"
      // bucket for rows whose status is empty/undefined — match the
      // original filterTable semantics.
      if (isMissingLabel(label)) {
        t.setFilter((row) => row.status === undefined || row.status === null || row.status === "");
      } else {
        t.setFilter("status", "=", label);
      }
    } else if (field === "folderBar") {
      if (isMissingLabel(label)) {
        t.setFilter((row) => row.folder_path === undefined || row.folder_path === null || row.folder_path === "");
      } else {
        t.setFilter("folder_path", "like", label);
      }
    } else {
      // Compliance gauges — pass an inline filter mirroring the original.
      t.setFilter((row) => {
        const has = (k) => row[k] !== undefined && row[k] !== null && row[k] !== "";
        const isoOk = (v) => v && ISO_REVISION_PATTERN.test(v);
        switch (label) {
          case "Files with Title Line 1": return has("title_line_1");
          case "Files without Title Line 1": return !has("title_line_1");
          case "Files with Revision": return has("revision") && isoOk(row.revision);
          case "Files without Revision": return !has("revision");
          case "Files with Invalid ISO Revision": return has("revision") && !isoOk(row.revision);
          case "Files with Description": return has("file_description") && row.file_description !== "TIDP Placeholder File";
          case "Files without Description": return !has("file_description");
          case "Files with Placeholder Description": return row.file_description === "TIDP Placeholder File";
          case "Files with Status": return has("status");
          case "Files without Status": return !has("status");
          default: return true;
        }
      });
    }
    return;
  }
  if (typeof _legacyFilterTable === "function") return _legacyFilterTable(label, field);
}
window.filterTable = filterTable;
