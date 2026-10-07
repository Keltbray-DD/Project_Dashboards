import { test } from "node:test";
import assert from "node:assert/strict";
import { subProjectGroups, hasSubProjectChoice, scopeFiles, validScope } from "../src/data/subProjects.js";
import { mergeDuplicateFiles, loadProjectFiles } from "../src/data/project.js";
import { fromExtractItem } from "../src/data/fileRows.js";

const SUBS = [
  { name: "North", program: "Programme A" },
  { name: "East", program: "Programme B" },
  { name: "South", program: "Programme A" },
  { name: "Depot", program: "" },
];

test("subProjectGroups keeps extract order and groups by programme", () => {
  assert.deepEqual(subProjectGroups(SUBS), [
    { program: "Programme A", projects: ["North", "South"] },
    { program: "Programme B", projects: ["East"] },
    { program: "", projects: ["Depot"] },
  ]);
  assert.deepEqual(subProjectGroups([]), []);
});

test("the picker only appears with two or more sub-projects", () => {
  assert.equal(hasSubProjectChoice(SUBS), true);
  assert.equal(hasSubProjectChoice([SUBS[0]]), false);
  assert.equal(hasSubProjectChoice(undefined), false);
});

test("scopeFiles keeps the sub-project's files, shared ones and framework-wide ones", () => {
  const files = [
    { id: "1", sub_projects: ["North"] },
    { id: "2", sub_projects: ["South"] },
    { id: "3", sub_projects: ["North", "South"] },
    { id: "4", sub_projects: [] },
    { id: "5" },
  ];
  assert.deepEqual(scopeFiles(files, "North").map((f) => f.id), ["1", "3", "4", "5"]);
  assert.equal(scopeFiles(files, ""), files);
});

test("validScope drops a remembered sub-project that no longer exists", () => {
  assert.equal(validScope("North", SUBS), "North");
  assert.equal(validScope("Gone", SUBS), "");
  assert.equal(validScope("", SUBS), "");
});

test("mergeDuplicateFiles keeps one row per version and records every sub-project", () => {
  const rows = [
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:v1?version=1", _subProject: "North" }, "p"),
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:v1?version=1", _subProject: "South" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:v2?version=1", _subProject: "South" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:v2?version=1", _subProject: "South" }, "p"),
  ];
  const merged = mergeDuplicateFiles(rows);
  assert.deepEqual(merged.map((r) => [r.id, r.sub_projects]), [["urn:v1?version=1", ["North", "South"]], ["urn:v2?version=1", ["South"]]]);
});

test("mergeDuplicateFiles keeps a file framework-wide if any listing is", () => {
  const rows = [
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:a?version=1", _subProject: "North" }, "p"),
    fromExtractItem({ Name: "a.pdf", itemIdVersion: "urn:a?version=1" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:b?version=1" }, "p"),
    fromExtractItem({ Name: "b.pdf", itemIdVersion: "urn:b?version=1", _subProject: "South" }, "p"),
  ];
  const merged = mergeDuplicateFiles(rows);
  assert.deepEqual(merged.map((r) => [r.id, r.sub_projects, r.sub_project]), [["urn:a?version=1", [], ""], ["urn:b?version=1", [], ""]]);
});

test("loadProjectFiles tags additional-folder files with their sub-project and merges duplicates", async () => {
  const record = (sub, program, files, extra = {}) => ({
    ProjectName: "FW " + sub,
    Framework_lineage: { Value: "Child" },
    Modified: "2026-10-06T10:00:00Z",
    Sub_folder_name: sub,
    subProgramName: program,
    files_list: JSON.stringify(files),
    ...extra,
  });
  const raw = {
    type: "framework",
    data: [
      record("North", "A", [{ Name: "n.pdf", itemIdVersion: "urn:n?version=1" }, { Name: "s.pdf", itemIdVersion: "urn:shared?version=1" }],
        { additional_MIDP_folders: JSON.stringify([{ folderID: "urn:rams", folderName: "RAMS" }]) }),
      record("South", "A", [{ Name: "s.pdf", itemIdVersion: "urn:shared?version=1" }]),
    ],
  };
  const aps = {
    walkFolder: async () => [{ item: { id: "urn:lin", attributes: { displayName: "r.pdf" } }, tipVersion: { id: "urn:r?version=1", attributes: {} }, folderPath: "RAMS", folderId: "urn:rams" }],
  };
  const { extract, files } = await loadProjectFiles({ aps, projectId: "p", projectName: "FW", fetchExtractImpl: async () => raw });
  assert.deepEqual(extract.subProjects.map((s) => s.name), ["North", "South"]);
  assert.deepEqual(files.map((f) => [f.name, f.sub_projects.join("+")]), [["n.pdf", "North"], ["s.pdf", "North+South"], ["r.pdf", "North"]]);
});
