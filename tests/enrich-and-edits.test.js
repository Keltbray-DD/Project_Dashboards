import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichRows } from "../src/data/enrich.js";
import { createPendingEdits, MAX_AGE_MS } from "../src/data/pendingEdits.js";
import { fromExtractItem } from "../src/data/fileRows.js";

const rowsFor = (n) =>
  Array.from({ length: n }, (_, i) => fromExtractItem({ Name: `f${i}.pdf`, itemIdVersion: `urn:v${i}?version=1` }, "p"));

// Fake APS client: returns results in REVERSED order (with urns) to prove
// matching is by urn, records concurrency. Options:
//   failTimes   urn → number of times a batch containing it throws first
//   unavailable urns Forma reports in `errors`
//   noUrns      results without urns (position matching)
function fakeAps({ failTimes = {}, unavailable = [], noUrns = false } = {}) {
  const calls = [];
  const remaining = { ...failTimes };
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
      const failing = urns.find((u) => remaining[u] > 0);
      if (failing) {
        remaining[failing]--;
        throw Object.assign(new Error("boom"), { status: 503 });
      }
      const ok = urns.filter((u) => !unavailable.includes(u));
      const results = ok.map((urn) => ({ ...(noUrns ? {} : { urn }), customAttributes: [{ name: "Revision", value: "R-" + urn }] }));
      return {
        results: noUrns ? results : results.reverse(),
        errors: urns.filter((u) => unavailable.includes(u)).map((urn) => ({ urn, title: "Not found" })),
      };
    },
  };
}

const opts = (aps, extra = {}) => ({ aps, projectId: "p", retryPauseMs: 1, ...extra });

test("enrichRows batches, runs concurrently, and matches results by urn", async () => {
  const rows = rowsFor(25);
  const aps = fakeAps();
  const progress = [];
  const stats = await enrichRows(rows, opts(aps, { chunkSize: 4, concurrency: 3, onProgress: (p) => progress.push(p) }));
  assert.equal(aps.calls.length, 7);
  assert.ok(aps.maxInFlight <= 3 && aps.maxInFlight > 1);
  assert.ok(rows.every((r) => r.revision === "R-" + r.id && r.attrs_loaded && !r.attrs_error));
  assert.deepEqual(stats, { total: 25, fetched: 25, cached: 0, failed: 0, unavailable: 0 });
  assert.deepEqual(progress.at(-1), { done: 25, total: 25, cached: 0 });
});

test("enrichRows defaults to batches of 50", async () => {
  const aps = fakeAps();
  await enrichRows(rowsFor(120), opts(aps));
  assert.deepEqual(aps.calls.map((c) => c.length).sort((a, b) => b - a), [50, 50, 20]);
});

test("enrichRows uses the cache and only fetches the misses", async () => {
  const rows = rowsFor(5);
  let saved;
  const cache = {
    load: () => ({ "urn:v0?version=1": { Revision: "cached" }, "urn:v1?version=1": { Revision: "cached" } }),
    save: (s) => (saved = s),
  };
  const aps = fakeAps();
  const stats = await enrichRows(rows, opts(aps, { cache }));
  assert.equal(stats.cached, 2);
  assert.equal(stats.fetched, 3);
  assert.deepEqual(aps.calls.flat().sort(), ["urn:v2?version=1", "urn:v3?version=1", "urn:v4?version=1"]);
  assert.equal(rows[0].revision, "cached");
  assert.equal(Object.keys(saved).length, 5);
});

test("a batch that fails once is recovered by the retry pass", async () => {
  const rows = rowsFor(6);
  const aps = fakeAps({ failTimes: { "urn:v0?version=1": 1 } });
  const stats = await enrichRows(rows, opts(aps, { chunkSize: 3 }));
  assert.equal(stats.failed, 0);
  assert.ok(rows.every((r) => r.attrs_loaded && !r.attrs_error));
});

test("a batch that keeps failing is reported and its rows marked attrs_error", async () => {
  const rows = rowsFor(6);
  const aps = fakeAps({ failTimes: { "urn:v0?version=1": 99 } });
  const stats = await enrichRows(rows, opts(aps, { chunkSize: 3 }));
  // The retry pass uses smaller batches, so only the batch holding v0 fails.
  assert.ok(stats.failed >= 1 && stats.failed <= 3);
  assert.equal(rows[0].attrs_loaded, false);
  assert.equal(rows[0].attrs_error, true);
  assert.equal(rows[5].attrs_loaded, true);
});

test("a full outage is reported straight away, without a second pass", async () => {
  const rows = rowsFor(10);
  const failTimes = Object.fromEntries(rows.map((r) => [r.id, 99]));
  const aps = fakeAps({ failTimes });
  const stats = await enrichRows(rows, opts(aps, { chunkSize: 5 }));
  assert.equal(stats.failed, 10);
  assert.equal(aps.calls.length, 2); // first pass only
  assert.ok(rows.every((r) => r.attrs_error));
});

test("files Forma reports as unavailable are flagged, not retried or misaligned", async () => {
  const rows = rowsFor(4);
  const aps = fakeAps({ unavailable: ["urn:v1?version=1"] });
  const stats = await enrichRows(rows, opts(aps));
  assert.deepEqual([stats.failed, stats.unavailable], [0, 1]);
  assert.equal(aps.calls.length, 1); // no retry for unavailable files
  assert.equal(rows[1].attrs_error, true);
  assert.equal(rows[2].revision, "R-urn:v2?version=1"); // others still matched correctly
});

test("without urns in the response, position is only trusted when it lines up", async () => {
  const rows = rowsFor(3);
  await enrichRows(rows, opts(fakeAps({ noUrns: true })));
  assert.equal(rows[2].revision, "R-urn:v2?version=1");

  // A missing file shortens the results, so the first pass can't match by
  // position; the retry pass asks for just the unmatched files, where the
  // positions do line up — and every row ends up with its own values.
  const rows2 = rowsFor(3);
  const stats = await enrichRows(rows2, opts(fakeAps({ noUrns: true, unavailable: ["urn:v0?version=1"] })));
  assert.deepEqual([stats.failed, stats.unavailable], [0, 1]);
  assert.equal(rows2[1].revision, "R-urn:v1?version=1");
  assert.equal(rows2[2].revision, "R-urn:v2?version=1");
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
