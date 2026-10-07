import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNestedJson, parseExtract } from "../src/data/extract.js";
import {
  fromExtractItem,
  fromFolderItem,
  fromVersion,
  applyAttributes,
  attributesFromResult,
  fileTypeFromName,
  fileUrl,
} from "../src/data/fileRows.js";

const PID = "b.2e6449f9-ce25-4a9c-8835-444cb5ea03bf";

test("parseNestedJson flattens doubly-encoded arrays and tolerates junk", () => {
  const inner = JSON.stringify([{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseNestedJson(JSON.stringify([inner, [{ a: 3 }]])), [{ a: 1 }, { a: 2 }, { a: 3 }]);
  assert.deepEqual(parseNestedJson(""), []);
  assert.deepEqual(parseNestedJson(null), []);
  assert.deepEqual(parseNestedJson("not json"), []);
  assert.deepEqual(parseNestedJson([{ b: 1 }]), [{ b: 1 }]);
});

test("parseExtract merges framework records, tags sub-projects and keeps the oldest timestamp", () => {
  const raw = {
    type: "framework",
    data: [
      {
        Title: "T",
        ProjectName: "ARE - SSE - GSP",
        Framework_lineage: { Value: "Parent" },
        Modified: "2026-10-06T11:00:00Z",
        files_list: JSON.stringify([{ Name: "fw.pdf" }]),
      },
      {
        Title: "T",
        ProjectName: "ARE - SSE - GSP Axminster",
        Framework_lineage: { Value: "Child" },
        Sub_folder_name: "Axminster",
        subProgramName: "Prog A",
        Modified: "2026-10-06T10:30:00Z",
        files_list: JSON.stringify([JSON.stringify([{ Name: "a.pdf" }])]),
        folder_array_deliverables: "[]",
        additional_MIDP_folders: JSON.stringify([{ folderID: "urn:f1", folderName: "RAMS" }, { folderName: "no id" }]),
      },
      {
        ProjectName: "ARE - SSE - GSP Melksham",
        Framework_lineage: { Value: "Child" },
        Modified: "2026-10-06T10:00:00Z",
        files_list: JSON.stringify([{ Name: "b.pdf" }]),
      },
    ],
  };
  const ex = parseExtract(raw);
  assert.equal(ex.projectName, "ARE - SSE - GSP");
  assert.equal(ex.updated, "2026-10-06T10:00:00.000Z");
  assert.deepEqual(ex.items.map((i) => [i.Name, i._subProject]), [["fw.pdf", ""], ["a.pdf", "Axminster"], ["b.pdf", "Melksham"]]);
  assert.equal(ex.items[1]._subProgram, "Prog A");
  assert.deepEqual(ex.additionalFolders, [{ folderID: "urn:f1", folderName: "RAMS", _subProject: "Axminster", _subProgram: "Prog A" }]);
  assert.deepEqual(ex.subProjects, [{ name: "Axminster", program: "Prog A" }, { name: "Melksham", program: "" }]);
});

test("parseExtract takes the project name from the Parent record wherever it is", () => {
  const ex = parseExtract({
    type: "framework",
    data: [
      { ProjectName: "FW North", Framework_lineage: { Value: "Child" }, Sub_folder_name: "North" },
      { ProjectName: "FW", Framework_lineage: { Value: "Parent" } },
    ],
  });
  assert.equal(ex.projectName, "FW");
  assert.deepEqual(ex.subProjects.map((s) => s.name), ["North"]);
});

test("parseExtract ignores sub-project fields on a non-framework extract", () => {
  const ex = parseExtract({ type: "single", data: [{ ProjectName: "P", Sub_folder_name: "X", files_list: JSON.stringify([{ Name: "a.pdf" }]) }] });
  assert.deepEqual(ex.subProjects, []);
  assert.equal(ex.items[0]._subProject, "");
});

test("parseExtract copes with an empty or missing payload", () => {
  const ex = parseExtract(undefined);
  assert.deepEqual(ex.items, []);
  assert.equal(ex.updated, null);
});

test("fromExtractItem builds a complete row", () => {
  const r = fromExtractItem(
    {
      Name: "DT-ARP-DR-001.pdf",
      itemIdVersion: "urn:adsk.wipemea:fs.file:vf.X?version=4",
      itemID: "urn:adsk.wipemea:dm.lineage:X",
      folderID: "urn:adsk.wipemea:fs.folder:co.F",
      folderPath: "Project Files / 01 WIP",
      lastModifiedUserName: "Jo",
      lastModifiedTime: "2026-09-01T00:00:00Z",
      createUserName: "Sam",
      _subProject: "North",
    },
    PID
  );
  assert.equal(r.version, 4);
  assert.equal(r.file_type, "PDF");
  assert.equal(r.created_by_user, "Sam");
  assert.equal(r.sub_project, "North");
  assert.equal(r.attrs_loaded, false);
  assert.equal(r.title_line_1, "");
  assert.equal(r.project_pin, "");
  assert.match(r.file_url, /^https:\/\/acc\.autodesk\.eu\/docs\/files\/projects\/2e6449f9-/);
  assert.match(r.file_url, /folderUrn=urn%3Aadsk/);
});

test("fileUrl uses the .com host outside EMEA and is blank without ids", () => {
  assert.match(fileUrl(PID, "urn:f", "urn:adsk.wip:dm.lineage:Y"), /acc\.autodesk\.com/);
  assert.equal(fileUrl(PID, "", "x"), "");
});

test("fromFolderItem and fromVersion read APS attributes and inherit context", () => {
  const r = fromFolderItem(
    {
      item: { id: "urn:lin", attributes: { displayName: "x.dwg", createUserName: "A" } },
      tipVersion: { id: "urn:v?version=2", attributes: { versionNumber: 2, createTime: "2026-01-01" } },
      folderPath: "RAMS / Sub",
      folderId: "urn:fold",
    },
    PID
  );
  assert.deepEqual([r.name, r.version, r.file_type, r.folder_path, r.created_at], ["x.dwg", 2, "DWG", "RAMS / Sub", "2026-01-01"]);

  const v = fromVersion({ id: "urn:v?version=1", attributes: { displayName: "x.dwg", versionNumber: 1 } }, r, PID);
  assert.equal(v.item_id, "urn:lin");
  assert.equal(v.folder_path, "RAMS / Sub");
  assert.equal(v.version, 1);
});

test("applyAttributes maps both Project PIN spellings and marks the row loaded", () => {
  const r = fromExtractItem({ Name: "a.pdf" }, PID);
  applyAttributes(r, attributesFromResult({ customAttributes: [
    { name: "Title Line 1", value: "Drainage" },
    { name: "Project PIN", value: "123" },
    { name: "Status", value: null },
  ] }));
  assert.equal(r.title_line_1, "Drainage");
  assert.equal(r.project_pin, "123");
  assert.equal(r.status, "");
  assert.equal(r.attrs_loaded, true);
});

test("fileTypeFromName", () => {
  assert.equal(fileTypeFromName("a.b.Rvt"), "RVT");
  assert.equal(fileTypeFromName("README"), "");
});
