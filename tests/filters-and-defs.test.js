import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFilterState,
  normaliseFolderPath,
  folderList,
  valueCounts,
  buildPredicate,
  activeFilterCount,
} from "../src/data/filters.js";
import { optionsOf, indexDefinitions } from "../src/data/attributeDefs.js";

const rows = [
  { name: "A-DR-1.pdf", form: "DR", originator: "ARP", folder_path: "Project Files / 01 WIP / Drainage", title_line_1: "Drainage layout", file_url: "https://x/drainage" },
  { name: "A-DR-2.pdf", form: "DR", originator: "KEL", folder_path: "Project Files/02 SHARED", title_line_1: "Outfall" },
  { name: "A-M3-3.rvt", form: "M3", originator: "ARP", folder_path: "Project Files / 03 PUBLISHED", title_line_1: "" },
  { name: "A-XX-4.pdf", form: "", originator: "ARP", folder_path: "Project Files / 01 WIP", title_line_1: "Drainage section", _private: "drainage" },
];

test("normaliseFolderPath and folderList build a sorted tree of every ancestor", () => {
  assert.equal(normaliseFolderPath(" A /B/  C "), "A / B / C");
  assert.deepEqual(folderList(rows), [
    "Project Files",
    "Project Files / 01 WIP",
    "Project Files / 01 WIP / Drainage",
    "Project Files / 02 SHARED",
    "Project Files / 03 PUBLISHED",
  ]);
});

test("valueCounts sorts values with (Blank) last", () => {
  assert.deepEqual(valueCounts(rows, "form"), [["DR", 2], ["M3", 1], ["", 1]]);
});

test("empty state filters nothing", () => {
  const s = emptyFilterState();
  assert.equal(buildPredicate(s), null);
  assert.equal(activeFilterCount(s), 0);
});

test("search matches any field but not URLs or underscore fields", () => {
  const s = { ...emptyFilterState(), search: " Drainage " };
  const p = buildPredicate(s);
  assert.deepEqual(rows.filter(p).map((r) => r.name), ["A-DR-1.pdf", "A-XX-4.pdf"]);
  const s2 = { ...emptyFilterState(), search: "x/drainage" };
  assert.deepEqual(rows.filter(buildPredicate(s2)), []);
});

test("value filters combine OR within a field and AND across fields, with Blank", () => {
  const s = emptyFilterState();
  s.values.set("form", new Set(["DR", ""]));
  s.values.set("originator", new Set(["ARP"]));
  assert.deepEqual(rows.filter(buildPredicate(s)).map((r) => r.name), ["A-DR-1.pdf", "A-XX-4.pdf"]);
  assert.equal(activeFilterCount(s), 2);
});

test("folder filter honours the subfolders switch and normalises paths", () => {
  const s = { ...emptyFilterState(), folderMode: "selected", folders: new Set(["Project Files / 01 WIP"]) };
  assert.deepEqual(rows.filter(buildPredicate(s)).map((r) => r.name), ["A-DR-1.pdf", "A-XX-4.pdf"]);
  s.subfolders = false;
  assert.deepEqual(rows.filter(buildPredicate(s)).map((r) => r.name), ["A-XX-4.pdf"]);
  // "Selected" with nothing picked doesn't filter.
  assert.equal(buildPredicate({ ...emptyFilterState(), folderMode: "selected" }), null);
});

test("external (e.g. Compliance) predicate stacks with the rest", () => {
  const s = { ...emptyFilterState(), search: "a-", external: { label: "Missing Title Line 1", predicate: (r) => !r.title_line_1 } };
  assert.deepEqual(rows.filter(buildPredicate(s)).map((r) => r.name), ["A-M3-3.rvt"]);
  assert.equal(activeFilterCount(s), 2);
});

test("optionsOf reads Forma dropdown definitions and ignores free text", () => {
  assert.deepEqual(optionsOf({ type: "array", arrayValues: ["S0", "S2", ""] }), ["S0", "S2"]);
  assert.deepEqual(optionsOf({ type: "list", options: [{ value: "A" }, { displayName: "B" }] }), ["A", "B"]);
  assert.equal(optionsOf({ type: "string" }), null);
  assert.equal(optionsOf(undefined), null);
});

test("indexDefinitions maps Forma names to field keys", () => {
  const byField = indexDefinitions([
    { id: 1, name: "Status", type: "array", arrayValues: ["S2"] },
    { id: 2, name: "Title Line 1", type: "string" },
    { id: 3, name: "Project PIN", type: "string" },
    { id: 5, name: "Classification", type: "string" },
    { id: 4, name: "Document Classification", type: "array", arrayValues: ["Official"] },
  ]);
  assert.deepEqual(byField.status, { id: 1, name: "Status", type: "array", options: ["S2"] });
  assert.equal(byField.title_line_1.options, null);
  assert.equal(byField.project_pin.id, 3);
  assert.deepEqual(byField.classification, { id: 4, name: "Document Classification", type: "array", options: ["Official"] });
  assert.equal(byField.revision, undefined);
});
