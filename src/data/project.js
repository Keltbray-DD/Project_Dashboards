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

// Returns { extract: { projectName, title, updated, type }, files }.
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
  for (const list of crawled) for (const entry of list) files.push(fromFolderItem(entry, projectId));

  return {
    extract: { projectName: extract.projectName, title: extract.title, updated: extract.updated, type: extract.type },
    files,
  };
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
