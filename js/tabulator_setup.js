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
    // Tabulator auto-renders the tree-expand control in the first column
    // when dataTree is enabled, so we let it sit alongside the file name.
    { title: "File Name", field: "name", widthGrow: 3, minWidth: 220, headerFilter: "input", formatter: missingFormatter },
    { title: "Version", field: "accversion", width: 70, hozAlign: "center", headerFilter: "input" },
    { title: "File URL", field: "file_url", width: 70, hozAlign: "center", formatter: fileUrlFormatter, headerSort: false },
    { title: "Revision", field: "revision", width: 90, formatter: revisionFormatter, editor: smartCellEditor, editable, cellEdited, headerFilter: "input" },
    { title: "Folder Path", field: "folder_path", widthGrow: 2, minWidth: 140, headerFilter: "list", headerFilterParams: { valuesLookup: "all", clearable: true } },
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
  // ACC's webView link from /items/.../versions points at the specific
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

// ---------- main entry point ----------

// (Re)builds or refreshes the MIDP Tabulator from the current `files[]`.
// Called by openTab("MIDP") and again at the end of enrichment.
async function initMidpTable() {
  const host = document.getElementById("dataTable");
  if (!host) return;

  // Pre-seed _children for files where older versions might exist so
  // Tabulator shows the chevron. Tree expand fetches the real data.
  for (const f of files) {
    if (f && f.accversion > 1 && !f._versionsFetched) {
      f._children = [{ _loading: true, name: "Loading older versions…" }];
    }
  }

  if (tabulators.MIDP) {
    await tabulators.MIDP.replaceData(files);
    tabulators.MIDP.redraw(true);
  } else {
    tabulators.MIDP = new Tabulator(host, {
      data: files,
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
      // Only fire the network call once per row.
      const data = row.getData();
      if (!data._versionsFetched) loadOlderVersionsForRow(row);
    });

    // Keep the Reset Filters button's "active" state in sync with
    // whether any kind of filter is currently applied.
    tabulators.MIDP.on("dataFiltered", () => tabulatorUpdateResetButton());
  }

  // Update the file-count label that the existing layout shows next to
  // the table title.
  const countEl = document.getElementById("MIDPCount");
  if (countEl) countEl.textContent = `(${files.length} files)`;
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
  // ACC's actual schema (as exposed via /custom-attribute-definitions):
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
// out of ACC. We bridge that gap by caching successful edits in
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
