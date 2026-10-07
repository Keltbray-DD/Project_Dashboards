import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRegionFolders, scopeParts, scopeLabel, validScope, FRAMEWORK_SCOPE, regionKey, subProjectKey } from "../src/data/subProjects.js";
import { loadFrameworkCatalogue, loadScopeFiles } from "../src/data/project.js";

test("classifyRegionFolders: sub-projects (sorted, cancelled last, no training) and the region's own MIDP folders", () => {
  const { subProjects, containers } = classifyRegionFolders("Axminster", [
    { id: "f1", name: "AX027_Milborne_Port (PS009789)" },
    { id: "f2", name: "AX001_Stalbridge (PKEUN296) CANCELLED" },
    { id: "f3", name: "AX008_Bunford_Park (ESL360)" },
    { id: "f4", name: "XX0000_Training_Example" },
    { id: "f5", name: "0E.SHARED" },
    { id: "f6", name: "Z.PROJECT_ADMIN" },
    { id: "f7", name: "" },
  ]);
  assert.deepEqual(subProjects.map((s) => [s.label, s.cancelled, s.id, s.key]), [
    ["AX008 Bunford Park (ESL360)", false, "f3", "sub:Axminster|AX008_Bunford_Park (ESL360)"],
    ["AX027 Milborne Port (PS009789)", false, "f1", "sub:Axminster|AX027_Milborne_Port (PS009789)"],
    ["AX001 Stalbridge (PKEUN296)", true, "f2", "sub:Axminster|AX001_Stalbridge (PKEUN296) CANCELLED"],
  ]);
  assert.deepEqual(containers, [{ id: "f5", path: "0E.SHARED" }]);
});

const CATALOGUE = [
  { region: "North", key: regionKey("North"), containers: [{ id: "n-shared", path: "0E.SHARED" }], subProjects: [
    { key: subProjectKey("North", "NO1_Alder"), folder: "NO1_Alder", label: "NO1 Alder", cancelled: false, id: "no1" },
    { key: subProjectKey("North", "NO2_Birch"), folder: "NO2_Birch", label: "NO2 Birch", cancelled: false, id: "no2" },
  ] },
  { region: "South", key: regionKey("South"), containers: [], subProjects: [
    { key: subProjectKey("South", "SO1_Dock"), folder: "SO1_Dock", label: "SO1 Dock", cancelled: false, id: "so1" },
  ] },
];

test("scopeParts, scopeLabel and validScope cover sub-projects, regions and the whole framework", () => {
  assert.deepEqual(scopeParts(subProjectKey("North", "NO2_Birch"), CATALOGUE).map((p) => [p.group.region, p.subProjects.map((s) => s.id)]), [["North", ["no2"]]]);
  assert.deepEqual(scopeParts(regionKey("North"), CATALOGUE).map((p) => [p.group.region, p.subProjects.map((s) => s.id)]), [["North", ["no1", "no2"]]]);
  assert.deepEqual(scopeParts(FRAMEWORK_SCOPE, CATALOGUE).map((p) => p.group.region), ["North", "South"]);
  assert.deepEqual(scopeParts("sub:Gone|X", CATALOGUE), []);
  assert.equal(scopeLabel(FRAMEWORK_SCOPE, CATALOGUE), "Whole framework");
  assert.equal(validScope(FRAMEWORK_SCOPE, CATALOGUE), FRAMEWORK_SCOPE);
  assert.equal(validScope("sub:Gone|X", CATALOGUE), "");
});

test("loadFrameworkCatalogue lists each region's start folder; a region that fails keeps an error", async () => {
  const listings = {
    "urn:north": [{ type: "folders", id: "no1", attributes: { displayName: "NO1_Alder" } }, { type: "folders", id: "ns", attributes: { displayName: "0E.SHARED" } }, { type: "items", id: "x" }],
  };
  const aps = {
    async folderContents(projectId, id) {
      if (!listings[id]) throw Object.assign(new Error("HTTP 500"), { status: 500 });
      return { data: listings[id] };
    },
  };
  const extract = { regions: [{ name: "North", startFolderId: "urn:north" }, { name: "South", startFolderId: "urn:south" }, { name: "East", startFolderId: "" }] };
  const cat = await loadFrameworkCatalogue({ aps, projectId: "p", extract });
  assert.deepEqual(cat.map((g) => [g.region, g.subProjects.map((s) => s.id), g.containers.map((c) => c.id), Boolean(g.error)]), [
    ["North", ["no1"], ["ns"], false],
    ["South", [], [], true],
    ["East", [], [], true],
  ]);
});

const entry = (name, folderPath, root) => ({
  item: { id: `urn:lineage:${name}`, attributes: { displayName: name } },
  tipVersion: { id: `urn:${name}?version=1`, attributes: {} },
  folderPath,
  folderId: `urn:f:${folderPath}`,
  root,
});

test("loadScopeFiles: one sub-project loads its MIDP folders plus its region's region-level and additional folders", async () => {
  const calls = { find: [], roots: null };
  const aps = {
    async findFolders(projectId, id) {
      calls.find.push(id);
      return id === "no2" ? [{ id: "no2-wip", path: "0C.WIP" }] : [];
    },
    async walkFolders(projectId, roots) {
      calls.roots = roots;
      return {
        files: [entry("w.pdf", "NO2_Birch / 0C.WIP", 0), entry("r.pdf", "0E.SHARED", 1), entry("rams.pdf", "RAMS", 2)],
        failed: [],
      };
    },
  };
  const extract = {
    projectName: "FW", title: "t", type: "framework", regions: [],
    additionalFolders: [{ folderID: "urn:rams", folderName: "RAMS", _region: "North" }, { folderID: "urn:south-extra", folderName: "Extra", _region: "South" }],
  };
  const { extract: meta, files, failedFolders } = await loadScopeFiles({ aps, projectId: "p", extract, catalogue: CATALOGUE, scope: subProjectKey("North", "NO2_Birch"), gapMs: 0, now: Date.parse("2026-10-07T10:10:00Z") });
  assert.deepEqual(calls.find, ["no2"]);
  assert.deepEqual(calls.roots.map((r) => [r.id, r.path, r.region]), [
    ["no2-wip", "NO2_Birch / 0C.WIP", "North"],
    ["n-shared", "0E.SHARED", "North"],
    ["urn:rams", "RAMS", "North"],
  ]);
  assert.deepEqual(files.map((f) => [f.name, f.regions.join(), f.sub_project]), [
    ["w.pdf", "North", "NO2_Birch"],
    ["r.pdf", "North", ""],
    ["rams.pdf", "North", "RAMS"],
  ]);
  assert.equal(meta.source, "live");
  assert.equal(meta.cacheEpoch, "2026-10-07T10:00:00.000Z");
  assert.deepEqual(failedFolders, []);
});

test("loadScopeFiles: the whole framework finds every sub-project's folders; failures are reported except 403s", async () => {
  const aps = {
    async findFolders(projectId, id) {
      if (id === "no1") throw Object.assign(new Error("HTTP 403"), { status: 403 });
      if (id === "so1") throw Object.assign(new Error("HTTP 500"), { status: 500 });
      return [{ id: `${id}-wip`, path: "0C.WIP" }];
    },
    async walkFolders(projectId, roots) {
      return { files: [], failed: [], roots };
    },
  };
  const progress = [];
  const extract = { projectName: "FW", title: "t", type: "framework", regions: [], additionalFolders: [] };
  const { failedFolders } = await loadScopeFiles({ aps, projectId: "p", extract, catalogue: CATALOGUE, scope: FRAMEWORK_SCOPE, gapMs: 0, onProgress: (p) => progress.push(p) });
  assert.deepEqual(failedFolders.map((f) => [f.folderPath, f.status]), [["SO1_Dock", 500]]);
  assert.deepEqual(progress.filter((p) => p.phase === "finding").map((p) => p.done), [1, 2, 3]);
});
