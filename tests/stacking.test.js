import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDocNumber,
  revisionRank,
  folderRank,
  compareByCreation,
  pickCurrent,
  stackDocuments,
} from "../src/data/stacking.js";

const row = (name, folder, revision, extra = {}) => ({
  name,
  folder_path: folder,
  revision,
  version: 1,
  last_modified_date: "2026-01-01T00:00:00Z",
  ...extra,
});

test("parseDocNumber splits on the last dot and lowercases the extension", () => {
  assert.deepEqual(parseDocNumber("ABC-DR-001.PDF"), { docNo: "ABC-DR-001", ext: "pdf" });
  assert.deepEqual(parseDocNumber("A.B.dwg"), { docNo: "A.B", ext: "dwg" });
  assert.deepEqual(parseDocNumber("noext"), { docNo: "noext", ext: "" });
});

test("revisionRank follows the ISO 19650 lifecycle", () => {
  const order = ["P01.01", "P01.02", "P01", "C01", "P02.01", "P02", "C02"];
  const ranks = order.map(revisionRank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
  assert.equal(revisionRank(""), -1);
  assert.equal(revisionRank(undefined), -1);
  assert.equal(revisionRank("Rev A"), 0);
});

test("folderRank: PUBLISHED > SHARED > WIP > other", () => {
  assert.equal(folderRank("Project Files / 03 PUBLISHED / X"), 3);
  assert.equal(folderRank("Project Files / 02 shared"), 2);
  assert.equal(folderRank("01 WIP"), 1);
  assert.equal(folderRank("Archive"), 0);
});

test("pickCurrent: PUBLISHED C01 stays current over a newer SHARED P02, flagged as newer in progress", () => {
  const pub = row("D.pdf", "03 PUBLISHED", "C01");
  const shared = row("D.pdf", "02 SHARED", "P02");
  const { current, hasNewerRevision } = pickCurrent([shared, pub]);
  assert.equal(current, pub);
  assert.equal(hasNewerRevision, true);
});

test("pickCurrent: SHARED beats a WIP draft, and the draft flags a newer revision", () => {
  const shared = row("D.pdf", "02 SHARED", "P01");
  const wip = row("D.pdf", "01 WIP", "P02.01");
  const { current, hasNewerRevision } = pickCurrent([wip, shared]);
  assert.equal(current, shared);
  assert.equal(hasNewerRevision, true);
});

test("pickCurrent: approved row with nothing newer is not flagged", () => {
  const shared = row("D.pdf", "02 SHARED", "P02");
  const wip = row("D.pdf", "01 WIP", "P01.03");
  assert.equal(pickCurrent([wip, shared]).hasNewerRevision, false);
});

test("pickCurrent: WIP-only documents take the highest revision, then the latest date", () => {
  const a = row("D.pdf", "01 WIP", "P01.01");
  const b = row("D.pdf", "01 WIP", "P01.02");
  assert.equal(pickCurrent([b, a]).current, b);
  const older = row("E.pdf", "01 WIP", "", { last_modified_date: "2026-01-01" });
  const newer = row("E.pdf", "01 WIP", "", { last_modified_date: "2026-02-01" });
  assert.equal(pickCurrent([older, newer]).current, newer);
  assert.equal(pickCurrent([older, newer]).hasNewerRevision, false);
});

test("stackDocuments groups by doc number + extension and never mutates rows", () => {
  const rows = [
    row("A-001.pdf", "01 WIP", "P01.01"),
    row("A-001.pdf", "02 SHARED", "P01"),
    row("A-001.dwg", "02 SHARED", "P01"),
    row("B-002.pdf", "01 WIP", "P01.01", { version: 3 }),
    { name: "", folder_path: "x" },
  ];
  const snapshot = JSON.stringify(rows);
  const docs = stackDocuments(rows);
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(docs.map((d) => d.key), ["A-001|pdf", "A-001|dwg", "B-002|pdf"]);

  const a = docs[0];
  assert.equal(a.current.folder_path, "02 SHARED");
  assert.equal(a.siblings.length, 1);
  assert.equal(a.hasHistory, true);
  assert.equal(docs[1].hasHistory, false); // single version, no siblings
  assert.equal(docs[2].hasHistory, true); // version 3 has older versions
});

test("compareByCreation prefers upload time, then revision rank", () => {
  const c01 = row("D.pdf", "03 PUBLISHED", "C01", { created_at: "2026-03-01" });
  const p02 = row("D.pdf", "02 SHARED", "P02", { created_at: "2026-02-01" });
  // Uploaded earlier, so P02 sorts first even though C01 ranks lower.
  assert.deepEqual([c01, p02].sort(compareByCreation), [p02, c01]);
  const x = row("D.pdf", "01 WIP", "P01.02");
  const y = row("D.pdf", "01 WIP", "P01.01");
  assert.deepEqual([x, y].sort(compareByCreation), [y, x]);
});
