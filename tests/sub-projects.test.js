import { test } from "node:test";
import assert from "node:assert/strict";
import {
  subProjectFolder,
  subProjectLabel,
  isTrainingFolder,
  buildScopes,
  hasScopeChoice,
  scopeFiles,
  scopeLabel,
  validScope,
  regionKey,
  subProjectKey,
} from "../src/data/subProjects.js";
import { mergeDuplicateFiles, loadProjectFiles } from "../src/data/project.js";
import { fromExtractItem } from "../src/data/fileRows.js";

test("subProjectFolder takes the top folder, skipping the region folder and container folders", () => {
  assert.equal(subProjectFolder("AX027_Milborne_Port (PS009789) / 0E.SHARED_AX027", "Axminster"), "AX027_Milborne_Port (PS009789)");
  assert.equal(subProjectFolder("Axminster / AX027_Milborne_Port (PS009789) / 0C.WIP", "Axminster"), "AX027_Milborne_Port (PS009789)");
  assert.equal(subProjectFolder("Project Files / Axminster / AX027_Milborne_Port / 0C.WIP", "Axminster"), "AX027_Milborne_Port");
  assert.equal(subProjectFolder("0E.SHARED / Drawings", "Axminster"), "");
  assert.equal(subProjectFolder("Z.PROJECT_ADMIN / 1.Pre-contract", "Axminster"), "");
  assert.equal(subProjectFolder("", "Axminster"), "");
});

test("subProjectLabel tidies folder names", () => {
  assert.equal(subProjectLabel("AX027_Milborne_Port (PS009789)"), "AX027 Milborne Port (PS009789)");
  assert.equal(subProjectLabel("MA503 - Salisbury GIS Board (PS009222)"), "MA503 Salisbury GIS Board (PS009222)");
  assert.equal(subProjectLabel("AX001_Stalbridge (PKEUN296) CANCELLED"), "AX001 Stalbridge (PKEUN296)");
  assert.equal(subProjectLabel("ME305_Chippenham_33kV_(Forest_Gate)  (PS009350)"), "ME305 Chippenham 33kV (Forest Gate) (PS009350)");
});

test("isTrainingFolder spots XX0000 folders", () => {
  assert.equal(isTrainingFolder("XX0000_Training_Example"), true);
  assert.equal(isTrainingFolder("AX027_Milborne_Port"), false);
  assert.equal(isTrainingFolder(""), false);
});

const row = (id, regions, sub_project) => ({ id, regions, sub_project });
const FILES = [
  row("fw", [], ""),
  row("n-lvl", ["North"], ""),
  row("n1", ["North"], "NO10_Alder"),
  row("n2", ["North"], "NO2_Birch (P1) CANCELLED"),
  row("n3", ["North"], "NO3_Cedar"),
  row("s1", ["South"], "SO1_Dock"),
  row("ns", ["North", "South"], "SO1_Dock"),
  row("plain", undefined, undefined),
];
const SCOPES = buildScopes([{ name: "North" }, { name: "South" }, { name: "Empty" }], FILES);

test("buildScopes groups sub-projects by region, sorted with cancelled last", () => {
  assert.deepEqual(
    SCOPES.map((g) => [g.region, g.key, g.subProjects.map((s) => [s.label, s.cancelled])]),
    [
      ["North", "region:North", [["NO3 Cedar", false], ["NO10 Alder", false], ["SO1 Dock", false], ["NO2 Birch (P1)", true]]],
      ["South", "region:South", [["SO1 Dock", false]]],
      ["Empty", "region:Empty", []],
    ]
  );
  assert.equal(SCOPES[0].subProjects[0].key, subProjectKey("North", "NO3_Cedar"));
});

test("the picker only appears when there's a choice", () => {
  assert.equal(hasScopeChoice(SCOPES), true);
  assert.equal(hasScopeChoice(buildScopes([{ name: "Solo" }], [row("a", ["Solo"], "A1")])), false);
  assert.equal(hasScopeChoice(buildScopes([{ name: "Solo" }], [row("a", ["Solo"], "A1"), row("b", ["Solo"], "B1")])), true);
  assert.equal(hasScopeChoice(undefined), false);
});

test("scopeFiles: a region keeps its files plus framework-wide ones", () => {
  assert.deepEqual(scopeFiles(FILES, regionKey("South")).map((f) => f.id), ["fw", "s1", "ns", "plain"]);
  assert.equal(scopeFiles(FILES, ""), FILES);
});

test("scopeFiles: a sub-project keeps its files, its region's region-level files and framework-wide ones", () => {
  assert.deepEqual(scopeFiles(FILES, subProjectKey("North", "NO10_Alder")).map((f) => f.id), ["fw", "n-lvl", "n1", "plain"]);
  assert.deepEqual(scopeFiles(FILES, subProjectKey("South", "SO1_Dock")).map((f) => f.id), ["fw", "s1", "ns", "plain"]);
});

test("validScope and scopeLabel", () => {
  assert.equal(validScope(regionKey("North"), SCOPES), "region:North");
  assert.equal(validScope(subProjectKey("North", "NO3_Cedar"), SCOPES), "sub:North|NO3_Cedar");
  assert.equal(validScope(subProjectKey("North", "Gone"), SCOPES), "");
  assert.equal(validScope("North", SCOPES), "");
  assert.equal(validScope("", SCOPES), "");
  assert.equal(scopeLabel(regionKey("South"), SCOPES), "South");
  assert.equal(scopeLabel(subProjectKey("North", "NO10_Alder"), SCOPES), "NO10 Alder");
  assert.equal(scopeLabel("", SCOPES), "");
});

test("mergeDuplicateFiles keeps one row per version and records every region", () => {
  const rows = [
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:v1?version=1", _region: "North", folderPath: "N1 / 0E.SHARED" }, "p"),
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:v1?version=1", _region: "South", folderPath: "N1 / 0E.SHARED" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:v2?version=1", _region: "South" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:v2?version=1", _region: "South" }, "p"),
  ];
  const merged = mergeDuplicateFiles(rows);
  assert.deepEqual(merged.map((r) => [r.id, r.regions, r.sub_project]), [["urn:v1?version=1", ["North", "South"], "N1"], ["urn:v2?version=1", ["South"], ""]]);
});

test("mergeDuplicateFiles keeps a file framework-wide if any listing is", () => {
  const rows = [
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:a?version=1", _region: "North", folderPath: "N1 / WIP" }, "p"),
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:a?version=1" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:b?version=1" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:b?version=1", _region: "South" }, "p"),
  ];
  const merged = mergeDuplicateFiles(rows);
  assert.deepEqual(merged.map((r) => [r.id, r.regions, r.region, r.sub_project]), [["urn:a?version=1", [], "", ""], ["urn:b?version=1", [], "", ""]]);
});

test("loadProjectFiles tags regions and sub-projects, crawls additional folders and drops training files", async () => {
  const record = (region, files, extra = {}) => ({
    ProjectName: "FW " + region,
    Framework_lineage: { Value: "Child" },
    Modified: "2026-10-06T10:00:00Z",
    Sub_folder_name: region,
    files_list: JSON.stringify(files),
    ...extra,
  });
  const raw = {
    type: "framework",
    data: [
      record(
        "North",
        [
          { Name: "n.pdf", itemIdVersion: "urn:n?version=1", folderPath: "NO1_Alder / 0C.WIP" },
          { Name: "s.pdf", itemIdVersion: "urn:shared?version=1", folderPath: "NO1_Alder / 0E.SHARED" },
          { Name: "t.pdf", itemIdVersion: "urn:t?version=1", folderPath: "XX0000_Training_Example / 0C.WIP" },
        ],
        { additional_MIDP_folders: JSON.stringify([{ folderID: "urn:rams", folderName: "RAMS" }]) }
      ),
      record("South", [{ Name: "s.pdf", itemIdVersion: "urn:shared?version=1", folderPath: "NO1_Alder / 0E.SHARED" }]),
    ],
  };
  const aps = {
    walkFolders: async () => ({
      files: [{ item: { id: "urn:lin", attributes: { displayName: "r.pdf" } }, tipVersion: { id: "urn:r?version=1", attributes: {} }, folderPath: "NO2_Birch / RAMS", folderId: "urn:rams", root: 0 }],
      failed: [],
    }),
  };
  const { extract, files } = await loadProjectFiles({ aps, projectId: "p", projectName: "FW", fetchExtractImpl: async () => raw });
  assert.equal(extract.source, "extract", "frameworks keep the extract's file list");
  assert.deepEqual(extract.regions, [{ name: "North" }, { name: "South" }]);
  assert.deepEqual(
    files.map((f) => [f.name, f.regions.join("+"), f.sub_project]),
    [["n.pdf", "North", "NO1_Alder"], ["s.pdf", "North+South", "NO1_Alder"], ["r.pdf", "North", "NO2_Birch"]]
  );
});
