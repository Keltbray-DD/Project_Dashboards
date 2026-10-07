// Fills file rows' custom attributes (revision, status, title lines, …)
// from Forma's versions:batch-get, in batches, with a session cache.
//
// Reliability measures:
//   • Batches of 50 — the documented maximum for versions:batch-get.
//     (v1 sent 200; that mostly works but gets throttled under load.)
//   • Every request has a timeout (api/http.js), so a hung request can't
//     stall loading; 429 / 5xx / timeouts back off and retry.
//   • Batches that still fail (after the HTTP layer's own retries) get one
//     more, gentler pass — fewer in flight, one quick retry each — unless
//     every file failed, which means Forma is down: then report at once
//     rather than make the user wait through another round of back-offs.
//   • A batch Forma rejects with 400 (typically one malformed file id) is
//     split in halves until the bad file is isolated; the rest load.
//   • Results are matched to rows by their urn. Files Forma reports as
//     unavailable (deleted, no permission) are marked attrs_error rather
//     than left looking "still loading" forever. Position is only used as
//     a fallback when a response carries no urns and has one result per
//     requested file.
//   • The cache is saved at most every 2 s (and at the end) — saving it
//     after every batch re-serialised the whole thing each time.
//   • The cache is keyed by the extract timestamp, so values refresh when
//     Power Automate publishes a new extract.
//
// Rows are updated in place (applyAttributes) — callers re-publish the
// array to the store afterwards to trigger re-renders.

import { bareProjectId } from "../core/config.js";
import { log } from "../core/log.js";
import { applyAttributes, attributesFromResult } from "./fileRows.js";

const CHUNK_SIZE = 50;
const CONCURRENCY = 6;
const RETRY_CONCURRENCY = 3;
const RETRY_PAUSE_MS = 1500;
const SAVE_EVERY_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
//   onProgress   ({ done, total, cached }) as batches complete
//   chunkSize, concurrency, retryPauseMs
// Returns { total, fetched, cached, failed, unavailable }:
//   failed       files whose attributes couldn't be fetched (network /
//                server errors after retries) — worth retrying later
//   unavailable  files Forma reported it can't return (deleted, no access)
export async function enrichRows(rows, options) {
  const {
    aps,
    projectId,
    cache = { load: () => ({}), save() {} },
    onProgress = () => {},
    chunkSize = CHUNK_SIZE,
    concurrency = CONCURRENCY,
    retryPauseMs = RETRY_PAUSE_MS,
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
      for (const row of list) {
        applyAttributes(row, store[urn]);
        delete row.attrs_error;
      }
      cached++;
    }
  }

  const pending = [...byUrn.keys()].filter((urn) => !store[urn]);
  let done = 0;
  const unavailable = new Set();
  onProgress({ done, total: pending.length, cached });

  let lastSave = 0;
  const maybeSave = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSave < SAVE_EVERY_MS) return;
    lastSave = now;
    cache.save(store);
  };

  const applyResult = (urn, result) => {
    const attrs = attributesFromResult(result);
    store[urn] = attrs;
    for (const row of byUrn.get(urn) || []) {
      applyAttributes(row, attrs);
      delete row.attrs_error;
    }
  };

  // Fetches one batch. Returns the urns that should be retried.
  const fetchBatch = async (batch, retries) => {
    let response;
    try {
      response = await aps.batchGetVersions(projectId, batch, retries === undefined ? {} : { retries });
    } catch (e) {
      // 400 = Forma rejected the request, usually one malformed file id —
      // which fails the whole batch. Split it to find the bad one(s) so the
      // rest still load; a single rejected file is flagged unavailable.
      if (e.status === 400) {
        if (batch.length === 1) {
          log.warn("versions:batch-get rejected a file id", batch[0]);
          unavailable.add(batch[0]);
          for (const row of byUrn.get(batch[0]) || []) row.attrs_error = true;
          return [];
        }
        const mid = Math.ceil(batch.length / 2);
        return [...(await fetchBatch(batch.slice(0, mid), retries)), ...(await fetchBatch(batch.slice(mid), retries))];
      }
      log.warn(`versions:batch-get failed for ${batch.length} files (${e.status || e.name})`, e);
      return batch;
    }
    const { results = [], errors = [] } = response || {};
    const matched = new Set();
    const anyUrns = results.some((r) => r?.urn);
    if (anyUrns) {
      for (const result of results) {
        if (result?.urn && byUrn.has(result.urn)) {
          applyResult(result.urn, result);
          matched.add(result.urn);
        }
      }
    } else if (results.length === batch.length) {
      // No urns in the response: only trust position when it lines up 1:1.
      results.forEach((result, i) => {
        applyResult(batch[i], result);
        matched.add(batch[i]);
      });
    }
    // Forma lists files it can't return in `errors` (deleted, no access).
    for (const err of errors) {
      const urn = err?.urn;
      if (urn && byUrn.has(urn) && !matched.has(urn)) {
        unavailable.add(urn);
        matched.add(urn);
        for (const row of byUrn.get(urn)) row.attrs_error = true;
      }
    }
    // Anything neither returned nor reported gets retried.
    return batch.filter((urn) => !matched.has(urn));
  };

  const runPass = async (urns, size, workers, retries) => {
    const batches = [];
    for (let i = 0; i < urns.length; i += size) batches.push(urns.slice(i, i + size));
    const leftovers = [];
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        const retry = await fetchBatch(batch, retries);
        leftovers.push(...retry);
        done += batch.length - retry.length;
        maybeSave();
        onProgress({ done, total: pending.length, cached });
      }
    };
    await Promise.all(Array.from({ length: Math.min(workers, batches.length) }, worker));
    return leftovers;
  };

  let failed = await runPass(pending, chunkSize, concurrency);
  const outage = failed.length > 0 && failed.length === pending.length;
  if (failed.length && !outage) {
    log.warn(`Retrying metadata for ${failed.length} files`);
    await sleep(retryPauseMs);
    failed = await runPass(failed, chunkSize, RETRY_CONCURRENCY, 1);
  }
  for (const urn of failed) for (const row of byUrn.get(urn) || []) row.attrs_error = true;
  maybeSave(true);
  onProgress({ done: pending.length, total: pending.length, cached });

  return { total: byUrn.size, fetched: pending.length, cached, failed: failed.length, unavailable: unavailable.size };
}
