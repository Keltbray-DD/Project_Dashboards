import { test } from "node:test";
import assert from "node:assert/strict";
import { loadProjectFiles, LIVE_EPOCH_MS } from "../src/data/project.js";

// A single-project extract: one record with a start folder, a stale file
// list and one additional MIDP folder.
const extractRaw = () => ({
  type: "single",
  data: [
    {
      ProjectName: "A66",
      Title: "guid",
      Modified: "2026-10-06T11:00:00Z",
      start_folder_id: "urn:start",
      files_list: JSON.stringify([{ Name: "stale.pdf", itemIdVersion: "urn:stale?version=1", folderPath: "0C.WIP" }]),
      additional_MIDP_folders: JSON.stringify([{ folderID: "urn:rams", folderName: "RAMS" }]),
    },
  ],
});

const entry = (name, folderPath, root) => ({
  item: { id: `urn:lineage:${name}`, attributes: { displayName: name } },
  tipVersion: { id: `urn:${name}?version=2`, attributes: { versionNumber: 2 } },
  folderPath,
  folderId: `urn:f:${folderPath}`,
  root,
});

// Fake APS client: findFolders returns the MIDP containers; walkFolders
// records the roots it was given and returns canned results.
function fakeAps({ midp = [{ id: "urn:wip", path: "0C.WIP" }, { id: "urn:pub", path: "0G.PUBLISHED" }], walk, findError } = {}) {
  const calls = { roots: null };
  return {
    calls,
    async findFolders(projectId, startFolderId, pattern) {
      calls.find = { startFolderId, pattern: String(pattern) };
      if (findError) throw findError;
      return midp;
    },
    async walkFolders(projectId, roots) {
      calls.roots = roots;
      return walk ? walk(roots) : { files: [], failed: [] };
    },
  };
}

const NOW = Date.parse("2026-10-07T09:47:00Z");

test("single projects read their files live: MIDP folders plus additional folders in one walk", async () => {
  const aps = fakeAps({
    walk: () => ({
      files: [entry("a.pdf", "0C.WIP / JAC - Jacobs", 0), entry("b.pdf", "0G.PUBLISHED", 1), entry("r.pdf", "RAMS", 2)],
      failed: [],
    }),
  });
  const { extract, files, failedFolders } = await loadProjectFiles({ aps, projectId: "p", projectName: "A66", fetchExtractImpl: async () => extractRaw(), now: NOW });

  assert.equal(aps.calls.find.startFolderId, "urn:start");
  assert.deepEqual(aps.calls.roots.map((r) => [r.id, r.path]), [["urn:wip", "0C.WIP"], ["urn:pub", "0G.PUBLISHED"], ["urn:rams", "RAMS"]]);
  assert.equal(extract.source, "live");
  assert.equal(extract.updated, new Date(NOW).toISOString());
  assert.equal(extract.cacheEpoch, "2026-10-07T09:30:00.000Z", "cache epoch is the start of the 30-minute window");
  assert.equal(Date.parse(extract.cacheEpoch) % LIVE_EPOCH_MS, 0);
  assert.deepEqual(files.map((f) => [f.name, f.id, f.folder_path]), [
    ["a.pdf", "urn:a.pdf?version=2", "0C.WIP / JAC - Jacobs"],
    ["b.pdf", "urn:b.pdf?version=2", "0G.PUBLISHED"],
    ["r.pdf", "urn:r.pdf?version=2", "RAMS"],
  ]);
  assert.deepEqual(failedFolders, []);
});

test("folders the user can't open are skipped quietly; other failures are reported", async () => {
  const aps = fakeAps({
    walk: () => ({
      files: [entry("b.pdf", "0G.PUBLISHED", 1)],
      failed: [
        { folderId: "urn:wip", folderPath: "0C.WIP", status: 403, message: "HTTP 403" },
        { folderId: "urn:x", folderPath: "0G.PUBLISHED / Old", status: 500, message: "HTTP 500" },
      ],
    }),
  });
  const { extract, files, failedFolders } = await loadProjectFiles({ aps, projectId: "p", projectName: "A66", fetchExtractImpl: async () => extractRaw(), now: NOW });
  assert.equal(extract.source, "live");
  assert.deepEqual(files.map((f) => f.name), ["b.pdf"]);
  assert.deepEqual(failedFolders, [{ folderPath: "0G.PUBLISHED / Old", status: 500, message: "HTTP 500" }]);
});

test("falls back to the extract's file list when Forma can't be read", async () => {
  for (const aps of [
    fakeAps({ findError: new Error("HTTP 500") }),
    fakeAps({ midp: [] }),
    fakeAps({ walk: () => ({ files: [], failed: [{ folderPath: "0C.WIP", status: 0, message: "timed out" }] }) }),
  ]) {
    const realWalk = aps.walkFolders;
    // The fallback still crawls the additional folders.
    aps.walkFolders = async (projectId, roots) =>
      roots.length === 1 && roots[0].id === "urn:rams" ? { files: [entry("r.pdf", "RAMS", 0)], failed: [] } : realWalk(projectId, roots);
    const { extract, files } = await loadProjectFiles({ aps, projectId: "p", projectName: "A66", fetchExtractImpl: async () => extractRaw(), now: NOW });
    assert.equal(extract.source, "extract");
    assert.equal(extract.updated, "2026-10-06T11:00:00.000Z");
    assert.equal(extract.cacheEpoch, extract.updated);
    assert.deepEqual(files.map((f) => f.name), ["stale.pdf", "r.pdf"]);
  }
});

test("source: \"extract\" skips the live read", async () => {
  const aps = fakeAps();
  aps.findFolders = async () => assert.fail("shouldn't read Forma live");
  const { extract } = await loadProjectFiles({ aps, projectId: "p", projectName: "A66", source: "extract", fetchExtractImpl: async () => extractRaw() });
  assert.equal(extract.source, "extract");
});

test("an extract without a start folder uses its file list", async () => {
  const raw = extractRaw();
  delete raw.data[0].start_folder_id;
  const aps = fakeAps();
  aps.findFolders = async () => assert.fail("shouldn't read Forma live");
  const { extract } = await loadProjectFiles({ aps, projectId: "p", projectName: "A66", fetchExtractImpl: async () => raw });
  assert.equal(extract.source, "extract");
});
