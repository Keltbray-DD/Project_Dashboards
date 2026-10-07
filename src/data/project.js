// Loads a project's data end to end:
//   1. the Power Automate extract  → project settings (start folders,
//                                     additional MIDP folders) and the
//                                     fallback file list
//   2. the file list               → read live from Forma: single projects
//                                     whole (loadProjectFiles); frameworks
//                                     one chosen scope at a time
//                                     (loadFrameworkCatalogue, then
//                                     loadScopeFiles). Falls back to the
//                                     extract's list
//   3. custom attributes           → enrichment (separate step so the
//                                     table can render before it finishes)
//   4. pending edits overlay
//   5. stacking into documents
//
// Views call loadProjectFiles() then enrichProjectFiles(), and publish
// the results to the store.

import { MIDP_FOLDER_PATTERN } from "../core/config.js";
import { log } from "../core/log.js";
import { fetchExtract } from "../api/powerAutomate.js";
import { parseExtract } from "./extract.js";
import { fromExtractItem, fromFolderItem, regionFields } from "./fileRows.js";
import { isTrainingFolder, classifyRegionFolders, regionKey, scopeParts } from "./subProjects.js";
import { enrichRows, sessionAttributeCache } from "./enrich.js";
import { createPendingEdits } from "./pendingEdits.js";
import { stackDocuments } from "./stacking.js";

// Live loads bucket the cache epoch (see below) into 30-minute windows,
// matching the old extract cadence: reloads within a window reuse the
// cached attributes, and edits made since the window started are still
// overlaid by pending edits.
export const LIVE_EPOCH_MS = 30 * 60 * 1000;

// Returns
//   {
//     extract: { projectName, title, type, regions,
//                source,       "live" | "extract" — where the files came from
//                updated,      ISO time the file list is as of
//                cacheEpoch }, ISO key for the attribute / history caches
//                              and the pending-edits cutoff
//     files,
//     failedFolders,           [{ folderPath, status, message }] — folders
//                              that couldn't be read (not access-denied)
//   }
// Files in training sub-projects (XX0000_…) are left out.
// options:
//   source            "auto" (live for single projects) | "extract"
//   onProgress        ({ done, queued, files }) while folders are read
//   parsed            an already-fetched fetchProjectExtract() result
//   fetchExtractImpl, now — injectable for tests
export async function loadProjectFiles({ aps, projectId, projectName, source = "auto", onProgress, parsed, fetchExtractImpl = fetchExtract, now = Date.now() }) {
  const extract = parsed || (await fetchProjectExtract({ projectName, fetchExtractImpl }));
  const meta = extractMeta(extract);

  if (source !== "extract" && extract.type !== "framework" && extract.startFolderId) {
    try {
      const { files, failedFolders } = await readLive({ aps, projectId, extract, onProgress });
      return { extract: { ...meta, ...liveTimes(now) }, files: finish(files), failedFolders };
    } catch (e) {
      log.warn("Couldn't read the project live from Forma; using the extract's file list", e);
    }
  }

  const files = extract.items.map((item) => fromExtractItem(item, projectId));
  // Folders the extract doesn't cover, crawled live.
  const { files: crawled, failedFolders } = await walk(aps, projectId, additionalRoots(extract), onProgress);
  for (const entry of crawled) {
    const row = fromFolderItem(entry, projectId);
    Object.assign(row, regionFields(entry.rootInfo.region, row.folder_path));
    files.push(row);
  }
  return {
    extract: { ...meta, source: "extract", updated: extract.updated, cacheEpoch: extract.updated },
    files: finish(files),
    failedFolders,
  };
}

// The Power Automate extract, parsed (data/extract.js).
export async function fetchProjectExtract({ projectName, fetchExtractImpl = fetchExtract }) {
  return parseExtract(await fetchExtractImpl(projectName));
}

const extractMeta = (extract) => ({ projectName: extract.projectName, title: extract.title, type: extract.type, regions: extract.regions });

const liveTimes = (now) => ({
  source: "live",
  updated: new Date(now).toISOString(),
  cacheEpoch: new Date(Math.floor(now / LIVE_EPOCH_MS) * LIVE_EPOCH_MS).toISOString(),
});

// ---------- frameworks, live ----------

// The framework's sub-project chooser, without loading any files: each
// region's start folder is listed once and its top-level folders sorted
// into sub-projects and region-level containers. Returns groups in the
// extract's region order (the same shape as buildScopes, so scopeLabel /
// validScope work on it):
//   [{ region, key, startFolderId, containers, subProjects, error? }]
// A region that can't be listed keeps error and no sub-projects.
export async function loadFrameworkCatalogue({ aps, projectId, extract }) {
  return mapPool(extract.regions, 3, async (r) => {
    const group = { region: r.name, key: regionKey(r.name), startFolderId: r.startFolderId, containers: [], subProjects: [] };
    if (!r.startFolderId) return { ...group, error: "No start folder in the extract" };
    try {
      const { data } = await aps.folderContents(projectId, r.startFolderId);
      const folders = data
        .filter((e) => e.type === "folders")
        .map((e) => ({ id: e.id, name: e.attributes?.displayName || e.attributes?.name || "" }));
      return { ...group, ...classifyRegionFolders(r.name, folders) };
    } catch (e) {
      log.warn(`Couldn't list the sub-projects of ${r.name}`, e);
      return { ...group, error: e?.message || String(e) };
    }
  });
}

// Loads one framework scope live: for each sub-project in it, its MIDP
// folders (found under the sub-project folder); plus, for each region it
// touches, the region's own MIDP containers (region-level files) and its
// additional MIDP folders. Framework-wide (Parent) files aren't loaded.
// Returns { extract, files, failedFolders } like loadProjectFiles.
//   catalogue    loadFrameworkCatalogue() result
//   scope        a scope key (see data/subProjects.js)
//   onProgress   ({ phase: "finding", done, total }) while sub-project
//                folders are found, then walk progress ({ done, queued,
//                files })
export async function loadScopeFiles({ aps, projectId, extract, catalogue, scope, onProgress, gapMs = 150, now = Date.now() }) {
  const parts = scopeParts(scope, catalogue);
  const subProjects = parts.flatMap(({ group, subProjects }) => subProjects.map((sp) => ({ sp, region: group.region })));

  // Each sub-project's MIDP folders, a few sub-projects at a time and
  // paced like the walk (see aps.walkFolders) to stay under Forma's limit.
  const failedFolders = [];
  let found = 0;
  const midpRoots = await mapPool(subProjects, 3, async ({ sp, region }) => {
    try {
      const folders = await aps.findFolders(projectId, sp.id, MIDP_FOLDER_PATTERN);
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
      return folders.map((f) => ({ id: f.id, path: `${sp.folder} / ${f.path}`, region }));
    } catch (e) {
      if (e?.status !== 403 && e?.status !== 404) failedFolders.push({ folderPath: sp.folder, status: e?.status ?? 0, message: e?.message || String(e) });
      return [];
    } finally {
      onProgress?.({ phase: "finding", done: ++found, total: subProjects.length });
    }
  });

  const roots = [
    ...midpRoots.flat(),
    ...parts.flatMap(({ group }) => group.containers.map((c) => ({ ...c, region: group.region }))),
    ...additionalRoots(extract).filter((f) => parts.some(({ group }) => group.region === f.region)),
  ];
  const walked = await walk(aps, projectId, roots, onProgress);
  failedFolders.push(...walked.failedFolders);
  const files = walked.files.map((entry) => {
    const row = fromFolderItem(entry, projectId);
    return Object.assign(row, regionFields(entry.rootInfo.region, row.folder_path));
  });
  return { extract: { ...extractMeta(extract), ...liveTimes(now) }, files: finish(files), failedFolders };
}

// Runs fn over items with at most `limit` in flight; results in order.
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- single projects, live ----------

// Single project, live: the MIDP folders under the start folder plus the
// additional MIDP folders, in one walk. Throws (so the caller falls back
// to the extract) if there's nothing to walk or nothing could be read.
async function readLive({ aps, projectId, extract, onProgress }) {
  const midp = await aps.findFolders(projectId, extract.startFolderId, MIDP_FOLDER_PATTERN);
  if (!midp.length) throw new Error("No WIP / SHARED / PUBLISHED folders under the project's start folder");
  const roots = [...midp.map((f) => ({ ...f, region: "" })), ...additionalRoots(extract)];
  const { files, failedFolders } = await walk(aps, projectId, roots, onProgress);
  if (!files.length && failedFolders.length) throw new Error(`None of the project's folders could be read (${failedFolders[0].message})`);
  return { files: files.map((entry) => fromFolderItem(entry, projectId)), failedFolders };
}

function additionalRoots(extract) {
  return extract.additionalFolders.map((f) => ({
    id: f.folderID,
    path: f.folderName || "",
    recurse: f.includeSubFolders !== false,
    region: f._region || "",
  }));
}

// Walks `roots`; each file entry gets `rootInfo` (its root). Folders the
// user isn't allowed to open (403 / 404 — normal for clients) are dropped
// quietly; anything else is returned as failedFolders.
async function walk(aps, projectId, roots, onProgress) {
  if (!roots.length) return { files: [], failedFolders: [] };
  const { files, failed } = await aps.walkFolders(projectId, roots, { onProgress });
  for (const entry of files) entry.rootInfo = roots[entry.root];
  const failedFolders = failed
    .filter((f) => f.status !== 403 && f.status !== 404)
    .map(({ folderPath, status, message }) => ({ folderPath, status, message }));
  if (failedFolders.length) log.warn("Some folders couldn't be read", failedFolders);
  return { files, failedFolders };
}

const finish = (files) => mergeDuplicateFiles(files.filter((f) => !isTrainingFolder(f.sub_project)));

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
    cache: sessionAttributeCache(projectId, extract.cacheEpoch),
    onProgress,
  });
  const edits = createPendingEdits(projectId).overlay(files, extract.cacheEpoch);
  log.debug("enrich", stats, "pending edits", edits);
  return { documents: stackDocuments(files), stats: { ...stats, edits } };
}
