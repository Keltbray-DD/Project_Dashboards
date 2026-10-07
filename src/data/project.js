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
import { fromExtractItem, fromFolderItem, regionFields } from "./fileRows.js";
import { isTrainingFolder } from "./subProjects.js";
import { enrichRows, sessionAttributeCache } from "./enrich.js";
import { createPendingEdits } from "./pendingEdits.js";
import { stackDocuments } from "./stacking.js";

// Returns { extract: { projectName, title, updated, type, regions }, files }.
// Files in training sub-projects (XX0000_…) are left out.
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
      Object.assign(row, regionFields(folder._region, row.folder_path));
      files.push(row);
    }
  });

  return {
    extract: {
      projectName: extract.projectName,
      title: extract.title,
      updated: extract.updated,
      type: extract.type,
      regions: extract.regions,
    },
    files: mergeDuplicateFiles(files.filter((f) => !isTrainingFolder(f.sub_project))),
  };
}

// In a framework the same file (same version URN) can be listed under
// more than one region, e.g. a shared folder. Keep one row and record
// every region it belongs to, so it isn't counted twice. A file that's
// also listed framework-wide (no region) stays framework-wide: it shows
// in every scope.
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
    if (existing.regions.length === 0) continue;
    if (row.regions.length === 0) {
      Object.assign(existing, regionFields("", ""));
      continue;
    }
    for (const r of row.regions) if (!existing.regions.includes(r)) existing.regions.push(r);
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
