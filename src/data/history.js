// Full revision history for one stacked document: every version of the
// current row's lineage and of each sibling's lineage (the copies in
// other folders), with custom attributes, oldest → newest by upload time.
// Used by the expandable rows and the "All revisions" modal.

import { bareProjectId } from "../core/config.js";
import { applyAttributes, attributesFromResult, fromVersion } from "./fileRows.js";
import { compareByCreation } from "./stacking.js";

// Bump when the cached row shape or ordering changes.
const CACHE_VERSION = "v2";

function cacheKey(projectId, extractUpdated, doc) {
  // Including the extract timestamp means newly uploaded versions show
  // up once Power Automate's next extract lands, rather than being
  // hidden for the rest of the browser session.
  return `history:${CACHE_VERSION}:${bareProjectId(projectId)}:${extractUpdated || "none"}:${doc.key}`;
}

// options: { aps, projectId, extractUpdated, cache } — cache defaults to
// sessionStorage; pass { get(), set() } in tests.
export async function documentHistory(doc, options) {
  const { aps, projectId, extractUpdated, cache = sessionCache } = options;
  const key = cacheKey(projectId, extractUpdated, doc);
  const hit = cache.get(key);
  if (hit) return hit;

  // Each row in the stack is its own Forma lineage.
  const owners = [doc.current, ...doc.siblings].filter((r) => r?.item_id);
  const versionLists = await Promise.all(owners.map((r) => aps.itemVersions(projectId, r.item_id)));

  const rows = [];
  owners.forEach((owner, i) => {
    for (const v of versionLists[i] || []) rows.push(fromVersion(v, owner, projectId));
  });

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const results = await aps.batchGetVersions(projectId, chunk.map((r) => r.id));
    const byUrn = new Map(chunk.map((r) => [r.id, r]));
    results.forEach((result, j) => {
      const row = (result?.urn && byUrn.get(result.urn)) || chunk[j];
      if (row) applyAttributes(row, attributesFromResult(result));
    });
  }

  rows.sort(compareByCreation);
  cache.set(key, rows);
  return rows;
}

const sessionCache = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* best-effort */
    }
  },
};
