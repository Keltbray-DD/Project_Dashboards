// Parses the Power Automate project extract into one flat structure.
//
// The flow returns { type, data: [record, …] }. For "framework" projects
// there's one record per sub-project; otherwise usually a single record.
// Each record carries JSON-encoded string columns (sometimes nested
// several levels deep):
//   files_list                 — file index entries
//   folder_array_deliverables  — deliverable folders
//   additional_MIDP_folders    — optional extra folders to crawl live
// plus Title / Modified / ProjectName and, for frameworks,
// subProjectName / subProgramName.

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
//     items,              file index entries, each tagged with
//                         _subProject / _subProgram
//     deliverableFolders,
//     additionalFolders,  [{ folderID, folderName, includeSubFolders }]
//   }
export function parseExtract(raw) {
  const records = Array.isArray(raw?.data) ? raw.data : [];
  const items = [];
  const deliverableFolders = [];
  const additionalFolders = [];
  let updated = null;

  for (const record of records) {
    const subProject = record.subProjectName || "";
    const subProgram = record.subProgramName || "";
    for (const item of parseNestedJson(record.files_list)) {
      items.push({ ...item, _subProject: subProject, _subProgram: subProgram });
    }
    deliverableFolders.push(...parseNestedJson(record.folder_array_deliverables));
    additionalFolders.push(...parseNestedJson(record.additional_MIDP_folders));

    const modified = record.Modified ? new Date(record.Modified) : null;
    if (modified && !isNaN(modified) && (!updated || modified < updated)) updated = modified;
  }

  const first = records[0] || {};
  return {
    type: raw?.type || "single",
    projectName: first.ProjectName || "",
    title: first.Title || "",
    updated: updated ? updated.toISOString() : null,
    items,
    deliverableFolders,
    additionalFolders: additionalFolders.filter((f) => f && f.folderID),
  };
}
