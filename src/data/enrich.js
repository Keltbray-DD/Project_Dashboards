// Fills file rows' custom attributes (revision, status, title lines, …)
// from Forma's versions:batch-get, in chunks, with a session cache.
//
// Changes from v1 (enrichFilesWithCustomAttributes):
//   • A pool of workers pulls chunks continuously instead of
//     fixed waves, so one slow chunk doesn't stall the rest.
//   • Results are matched by their `urn`, falling back to position — v1
//     relied on position only, which misaligned when Forma dropped an
//     unknown URN from a chunk.
//   • Row lookup is O(1) via a map (v1 did files.find per result).
//   • The cache is keyed by the extract timestamp, so values refresh
//     every time Power Automate publishes a new extract instead of
//     sticking for the whole browser session.
//
// Rows are updated in place (applyAttributes) — callers re-publish the
// array to the store afterwards to trigger re-renders.

import { bareProjectId } from "../core/config.js";
import { log } from "../core/log.js";
import { applyAttributes, attributesFromResult } from "./fileRows.js";

// 200 works in practice (docs say 50; the endpoint is more permissive).
// 4 in flight stays well under the ~300 req/min APS limit.
const CHUNK_SIZE = 200;
const CONCURRENCY = 4;

// Session cache of { versionUrn: { attrName: value } } for one project +
// extract. Older extracts' caches for the same project are discarded.
export function sessionAttributeCache(projectId, extractUpdated) {
  const prefix = `customAttrs:${bareProjectId(projectId)}:`;
  const key = prefix + (extractUpdated || "none");
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if ((k.startsWith(prefix) && k !== key) || k === `customAttrs_${bareProjectId(projectId)}`) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    /* storage unavailable — cache just won't persist */
  }
  let failed = false;
  return {
    load() {
      try {
        return JSON.parse(sessionStorage.getItem(key) || "{}");
      } catch {
        return {};
      }
    },
    save(data) {
      if (failed) return;
      try {
        sessionStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        // Quota exceeded on big projects — stop trying; next load refetches.
        failed = true;
        log.warn("Attribute cache exceeded sessionStorage quota; it won't persist this session.", e?.name);
      }
    },
  };
}

// options:
//   aps          createAps() client
//   projectId
//   cache        { load(), save(obj) } — defaults to no persistence
//   onProgress   ({ done, total, cached }) after each chunk
//   chunkSize, concurrency
// Returns { total, fetched, cached, failedChunks }.
export async function enrichRows(rows, options) {
  const {
    aps,
    projectId,
    cache = { load: () => ({}), save() {} },
    onProgress = () => {},
    chunkSize = CHUNK_SIZE,
    concurrency = CONCURRENCY,
  } = options;

  const byUrn = new Map();
  for (const row of rows) {
    if (!row.id) continue;
    if (!byUrn.has(row.id)) byUrn.set(row.id, []);
    byUrn.get(row.id).push(row);
  }

  const store = cache.load() || {};
  let cached = 0;
  for (const [urn, list] of byUrn) {
    if (store[urn]) {
      for (const row of list) applyAttributes(row, store[urn]);
      cached++;
    }
  }

  const pending = [...byUrn.keys()].filter((urn) => !store[urn]);
  const chunks = [];
  for (let i = 0; i < pending.length; i += chunkSize) chunks.push(pending.slice(i, i + chunkSize));

  let done = 0;
  let failedChunks = 0;
  onProgress({ done, total: pending.length, cached });

  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      let results = [];
      try {
        results = await aps.batchGetVersions(projectId, chunk);
      } catch (e) {
        failedChunks++;
        log.warn(`versions:batch-get failed for ${chunk.length} files`, e);
      }
      results.forEach((result, i) => {
        const urn = result?.urn && byUrn.has(result.urn) ? result.urn : chunk[i];
        const attrs = attributesFromResult(result);
        store[urn] = attrs;
        for (const row of byUrn.get(urn) || []) applyAttributes(row, attrs);
      });
      done += chunk.length;
      cache.save(store);
      onProgress({ done, total: pending.length, cached });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));

  return { total: byUrn.size, fetched: pending.length, cached, failedChunks };
}
