// Parses the Power Automate project extract into one flat structure.
//
// The flow returns { type, data: [record, …] }. For "framework" projects
// there's one Parent record (Framework_lineage "Parent") for the framework
// itself plus one Child record per region; otherwise usually a single
// record. Each record carries JSON-encoded string columns (sometimes
// nested several levels deep):
//   files_list                 — file index entries
//   folder_array_deliverables  — deliverable folders
//   additional_MIDP_folders    — optional extra folders to crawl live
// plus Title / Modified / ProjectName and, for framework children,
// Sub_folder_name (the region, e.g. "Axminster"). Sub-projects are the
// top-level folders inside a region (see data/subProjects.js).

// The string columns are JSON arrays whose elements may themselves be
// JSON strings or nested arrays. Flattens all of it into one array of
// objects. Tolerates null/empty/already-parsed input.
export function parseNestedJson(value) {
  if (value == null || value === "") return [];
  const unwrap = (v) => {
    if (typeof v === "string") {
      try {
        return unwrap(JSON.parse(v));
      } catch {
        return [];
      }
    }
    if (Array.isArray(v)) return v.flatMap(unwrap);
    return v && typeof v === "object" ? [v] : [];
  };
  return unwrap(value);
}

// Returns:
//   {
//     projectName, title,
//     updated,            ISO timestamp of the extract (oldest record's,
//                         so pending edits survive until every record
//                         has caught up)
//     items,              file index entries, each tagged with _region
//                         ("" for the framework Parent: framework-wide)
//     deliverableFolders,
//     additionalFolders,  [{ folderID, folderName, includeSubFolders,
//                           _region }]
//     regions,            [{ name }] — framework regions in record order,
//                         de-duplicated ([] otherwise)
//   }
export function parseExtract(raw) {
  const records = Array.isArray(raw?.data) ? raw.data : [];
  const isFramework = raw?.type === "framework";
  const parent = records.find(isParentRecord) || records[0] || {};
  const items = [];
  const deliverableFolders = [];
  const additionalFolders = [];
  const regions = [];
  let updated = null;

  for (const record of records) {
    const region = isFramework ? regionName(record, parent) : "";
    for (const item of parseNestedJson(record.files_list)) {
      items.push({ ...item, _region: region });
    }
    deliverableFolders.push(...parseNestedJson(record.folder_array_deliverables));
    for (const folder of parseNestedJson(record.additional_MIDP_folders)) {
      additionalFolders.push({ ...folder, _region: region });
    }
    if (region && !regions.some((r) => r.name === region)) regions.push({ name: region });

    const modified = record.Modified ? new Date(record.Modified) : null;
    if (modified && !isNaN(modified) && (!updated || modified < updated)) updated = modified;
  }

  return {
    type: raw?.type || "single",
    projectName: parent.ProjectName || "",
    title: parent.Title || "",
    updated: updated ? updated.toISOString() : null,
    items,
    deliverableFolders,
    additionalFolders: additionalFolders.filter((f) => f && f.folderID),
    regions,
  };
}

// Framework_lineage is a SharePoint choice column: { Value: "Parent" }.
function lineage(record) {
  const v = record?.Framework_lineage;
  return String((v && typeof v === "object" ? v.Value : v) || "");
}

function isParentRecord(record) {
  return lineage(record) === "Parent";
}

// A Child record's region: Sub_folder_name, else its ProjectName with the
// Parent's name taken off the front ("ARE - SSE - GSP Axminster" →
// "Axminster"). The Parent record isn't a region ("").
function regionName(record, parent) {
  if (isParentRecord(record)) return "";
  const folder = String(record.Sub_folder_name || "").trim();
  if (folder) return folder;
  const name = String(record.ProjectName || "").trim();
  const parentName = record === parent ? "" : String(parent.ProjectName || "").trim();
  if (parentName && name.startsWith(parentName)) {
    const rest = name.slice(parentName.length).replace(/^[\s\-–:]+/, "");
    if (rest) return rest;
  }
  return name;
}
