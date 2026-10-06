import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichRows } from "../src/data/enrich.js";
import { createPendingEdits, MAX_AGE_MS } from "../src/data/pendingEdits.js";
import { fromExtractItem } from "../src/data/fileRows.js";

const rowsFor = (n) =>
  Array.from({ length: n }, (_, i) => fromExtractItem({ Name: `f${i}.pdf`, itemIdVersion: `urn:v${i}?version=1` }, "p"));

// Fake APS client: returns results in REVERSED order (with urns) to prove
// matching is by urn, records concurrency.
function fakeAps({ failUrn } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  return {
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
    async batchGetVersions(_pid, urns) {
      calls.push(urns);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (failUrn && urns.includes(failUrn)) throw new Error("boom");
      return urns
        .map((urn) => ({ urn, customAttributes: [{ name: "Revision", value: "R-" + urn }] }))
        .reverse();
    },
  };
}

test("enrichRows chunks, runs concurrently, and matches results by urn", async () => {
  const rows = rowsFor(25);
  const aps = fakeAps();
  const progress = [];
  const stats = await enrichRows(rows, { aps, projectId: "p", chunkSize: 4, concurrency: 3, onProgress: (p) => progress.push(p) });
  assert.equal(aps.calls.length, 7);
  assert.ok(aps.maxInFlight <= 3 && aps.maxInFlight > 1);
  assert.ok(rows.every((r) => r.revision === "R-" + r.id && r.attrs_loaded));
  assert.deepEqual(stats, { total: 25, fetched: 25, cached: 0, failedChunks: 0 });
  assert.deepEqual(progress.at(-1), { done: 25, total: 25, cached: 0 });
});

test("enrichRows uses the cache and only fetches the misses", async () => {
  const rows = rowsFor(5);
  let saved;
  const cache = {
    load: () => ({ "urn:v0?version=1": { Revision: "cached" }, "urn:v1?version=1": { Revision: "cached" } }),
    save: (s) => (saved = s),
  };
  const aps = fakeAps();
  const stats = await enrichRows(rows, { aps, projectId: "p", cache });
  assert.equal(stats.cached, 2);
  assert.equal(stats.fetched, 3);
  assert.deepEqual(aps.calls.flat().sort(), ["urn:v2?version=1", "urn:v3?version=1", "urn:v4?version=1"]);
  assert.equal(rows[0].revision, "cached");
  assert.equal(Object.keys(saved).length, 5);
});

test("enrichRows survives a failing chunk and reports it", async () => {
  const rows = rowsFor(6);
  const stats = await enrichRows(rows, { aps: fakeAps({ failUrn: "urn:v0?version=1" }), projectId: "p", chunkSize: 3 });
  assert.equal(stats.failedChunks, 1);
  assert.equal(rows[0].attrs_loaded, false);
  assert.equal(rows[5].attrs_loaded, true);
});

function memoryStorage() {
  const data = new Map();
  return {
    data,
    get: (k, fallback) => (data.has(k) ? structuredClone(data.get(k)) : fallback),
    set: (k, v) => data.set(k, structuredClone(v)),
  };
}

test("pending edits overlay until the extract catches up, then drop", () => {
  const storage = memoryStorage();
  const edits = createPendingEdits("b.p1", storage);
  const t0 = Date.parse("2026-10-06T10:00:00Z");
  edits.record("urn:a", "status", "S3", t0);
  edits.record("urn:a", "revision", "P02", t0 + 1000);

  const rows = [{ id: "urn:a", status: "S2", revision: "P01" }];
  // Extract older than both edits → both overlay and are kept.
  assert.deepEqual(edits.overlay(rows, "2026-10-06T09:30:00Z", t0 + 5000), { applied: 2, dropped: 0 });
  assert.deepEqual([rows[0].status, rows[0].revision], ["S3", "P02"]);

  // Extract between the two edits → status dropped, revision kept.
  const rows2 = [{ id: "urn:a", status: "S3", revision: "P01" }];
  assert.deepEqual(edits.overlay(rows2, new Date(t0 + 500).toISOString(), t0 + 5000), { applied: 1, dropped: 1 });
  assert.deepEqual(Object.keys(storage.data.get("pendingEdits_p1")["urn:a"]), ["revision"]);
});

test("pending edits older than the max age are dropped even if the extract never updates", () => {
  const storage = memoryStorage();
  const edits = createPendingEdits("p1", storage);
  edits.record("urn:a", "status", "S3", 1000);
  const rows = [{ id: "urn:a", status: "S2" }];
  assert.deepEqual(edits.overlay(rows, null, 1000 + MAX_AGE_MS + 1), { applied: 0, dropped: 1 });
  assert.equal(rows[0].status, "S2");
});
