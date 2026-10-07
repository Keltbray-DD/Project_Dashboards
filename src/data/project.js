// Loads a project's data end to end:
//   1. the Power Automate extract  → file rows
//   2. "additional MIDP folders"   → crawled live, merged in
//   3. custom attributes           → enrichment (separate step so the
//                                     table can render before it finishes)
//   4. pending edits overlay
//   5. stacking into documents
//
// Views call loadProjectFiles() then enrichProjectFiles(), and publish
// the results to the store.

import { log } from "../core/log.js";
import { fetchExtract } from "../api/powerAutomate.js";
import { parseExtract } from "./extract.js";
import { fromExtractItem, fromFolderItem } from "./fileRows.js";
import { enrichRows, sessionAttributeCache } from "./enrich.js";
import { createPendingEdits } from "./pendingEdits.js";
import { stackDocuments } from "./stacking.js";

// Returns { extract: { projectName, title, updated, type, subProjects }, files }.
// fetchExtractImpl is injectable for tests.
export async function loadProjectFiles({ aps, projectId, projectName, fetchExtractImpl = fetchExtract }) {
  const extract = parseExtract(await fetchExtractImpl(projectName));
  const files = extract.items.map((item) => fromExtractItem(item, projectId));

  // Folders the extract doesn't cover. One failing folder shouldn't sink
  // the whole load — log it and carry on.
  const crawled = await Promise.all(
    extract.additionalFolders.map((f) =>
      aps
        .walkFolder(projectId, f.folderID, f.folderName || "", { recurse: f.includeSubFolders !== false })
        .catch((e) => {
          log.warn(`Couldn't read additional MIDP folder "${f.folderName}"`, e);
          return [];
        })
    )
  );
  crawled.forEach((list, i) => {
    const folder = extract.additionalFolders[i];
    for (const entry of list) {
      const row = fromFolderItem(entry, projectId);
      if (folder._subProject) {
        row.sub_project = folder._subProject;
        row.sub_program = folder._subProgram || "";
        row.sub_projects = [folder._subProject];
      }
      files.push(row);
    }
  });

  return {
    extract: {
      projectName: extract.projectName,
      title: extract.title,
      updated: extract.updated,
      type: extract.type,
      subProjects: extract.subProjects,
    },
    files: mergeDuplicateFiles(files),
  };
}

// In a framework the same file (same version URN) can be listed under
// more than one sub-project, e.g. a shared folder. Keep one row and
// record every sub-project it belongs to, so it isn't counted twice.
// A file that's also listed framework-wide (no sub-project) stays
// framework-wide: it shows in every scope.
export function mergeDuplicateFiles(files) {
  const byId = new Map();
  const out = [];
  for (const row of files) {
    if (!row.id) {
      out.push(row);
      continue;
    }
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      out.push(row);
      continue;
    }
    if (existing.sub_projects.length === 0) continue;
    if (row.sub_projects.length === 0) {
      existing.sub_projects = [];
      existing.sub_project = "";
      existing.sub_program = "";
      continue;
    }
    for (const sp of row.sub_projects) if (!existing.sub_projects.includes(sp)) existing.sub_projects.push(sp);
  }
  return out;
}

// Fills attributes, overlays pending edits, and stacks. Returns
// { documents, stats }. onProgress as for enrichRows.
export async function enrichProjectFiles({ aps, projectId, extract, files, onProgress }) {
  const stats = await enrichRows(files, {
    aps,
    projectId,
    cache: sessionAttributeCache(projectId, extract.updated),
    onProgress,
  });
  const edits = createPendingEdits(projectId).overlay(files, extract.updated);
  log.debug("enrich", stats, "pending edits", edits);
  return { documents: stackDocuments(files), stats: { ...stats, edits } };
}
