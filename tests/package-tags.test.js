import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTags, addTag, removeTags } from "../src/data/tags.js";
import {
  makePackageTag,
  isValidPackageTag,
  isPackageTag,
  previewTagWrite,
  addPackageTag,
  clearPackageTags,
  failureReason,
  writeTags,
} from "../src/data/packageTags.js";
import { indexDefinitions } from "../src/data/attributeDefs.js";
import { emptyFilterState, buildPredicate, valueCounts } from "../src/data/filters.js";

test("parseTags splits on ; or , and drops blanks and repeats", () => {
  assert.deepEqual(parseTags(" A; B,C;; A "), ["A", "B", "C"]);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags(null), []);
});

test("addTag appends once; removeTags keeps the rest", () => {
  assert.equal(addTag("REVIEW-01", "PKG-X"), "REVIEW-01; PKG-X");
  assert.equal(addTag("", "PKG-X"), "PKG-X");
  assert.equal(addTag("PKG-X; REVIEW-01", "PKG-X"), null);
  assert.equal(removeTags("PKG-A; REVIEW-01; PKG-B", isPackageTag), "REVIEW-01");
  assert.equal(removeTags("REVIEW-01", isPackageTag), null);
  assert.equal(removeTags("PKG-A", isPackageTag), "");
});

test("makePackageTag uses the project code and local date-time", () => {
  const d = new Date(2026, 9, 8, 14, 32);
  assert.equal(makePackageTag("HI7411", d), "PKG-HI7411-261008-1432");
  assert.equal(makePackageTag("ex 0001", d), "PKG-EX0001-261008-1432");
  assert.equal(makePackageTag("", d), "PKG-261008-1432");
  assert.ok(isValidPackageTag(makePackageTag("HI7411", d)));
});

test("isValidPackageTag needs PKG- and no spaces or separators", () => {
  assert.ok(isValidPackageTag("PKG-HI7411-0007"));
  assert.ok(!isValidPackageTag("HI7411-0007"));
  assert.ok(!isValidPackageTag("PKG-a b"));
  assert.ok(!isValidPackageTag("PKG-a;b"));
  assert.ok(!isValidPackageTag("PKG-"));
});

test("the Tags attribute is found under either spelling", () => {
  assert.equal(indexDefinitions([{ id: "7", name: "Tags", type: "string" }]).tags.id, "7");
  assert.equal(indexDefinitions([{ id: "8", name: "tags", type: "string" }]).tags.id, "8");
  assert.equal(indexDefinitions([{ id: "1", name: "Revision", type: "string" }]).tags, undefined);
});

const rows = [
  { id: "v1", attrs_loaded: true, tags: "" },
  { id: "v2", attrs_loaded: true, tags: "REVIEW-01" },
  { id: "v3", attrs_loaded: true, tags: "PKG-OLD; REVIEW-01" },
  { id: "v4", attrs_loaded: true, tags: "PKG-NEW" },
  { id: "v5", attrs_loaded: false },
];

test("previewTagWrite: adding a tag", () => {
  const p = previewTagWrite(rows, "PKG-NEW");
  assert.equal(p.change, 4); // v1, v2, v3, v5 (unknown)
  assert.equal(p.same, 1);
  assert.equal(p.unknown, 1);
  assert.deepEqual([...p.inOther], [["PKG-OLD", 1]]);
});

test("previewTagWrite: clearing package tags", () => {
  const p = previewTagWrite(rows, null);
  assert.equal(p.change, 3); // v3, v4, v5 (unknown)
  assert.equal(p.same, 2);
  assert.deepEqual([...p.inOther], [["PKG-OLD", 1], ["PKG-NEW", 1]]);
});

test("the Tags filter matches any one tag in the list", () => {
  const s = emptyFilterState();
  s.values.set("tags", new Set(["REVIEW-01"]));
  const pred = buildPredicate(s);
  assert.deepEqual(rows.filter(pred).map((r) => r.id), ["v2", "v3"]);
  assert.deepEqual(valueCounts(rows, "tags"), [["PKG-NEW", 1], ["PKG-OLD", 1], ["REVIEW-01", 2], ["", 2]]);
});

test("failureReason gives plain reasons", () => {
  assert.match(failureReason({ status: 403 }), /permission/);
  assert.match(failureReason({ status: 423 }), /locked/);
  assert.match(failureReason({ status: 0 }), /didn't respond/);
});

// Fake APS: Forma's current values (which may differ from the loaded rows)
// and a log of writes. Writing to "v-denied" gets 403; reading "v-gone"
// reports it unavailable.
function fakeAps(current) {
  const writes = [];
  return {
    writes,
    async batchGetVersions(_p, urns) {
      return {
        results: urns.filter((u) => u !== "v-gone").map((urn) => ({ urn, customAttributes: current[urn] === undefined ? [] : [{ name: "Tags", value: current[urn] }] })),
        errors: urns.filter((u) => u === "v-gone").map((urn) => ({ urn })),
      };
    },
    async updateCustomAttributes(_p, urn, values) {
      if (urn === "v-denied") throw Object.assign(new Error("HTTP 403"), { status: 403 });
      writes.push([urn, values[0].value]);
      current[urn] = values[0].value;
      return { ok: true, failed: [] };
    },
  };
}

test("writeTags adds to each file's current tags, read fresh from Forma", async () => {
  // Forma has a tag the stale row doesn't know about.
  const aps = fakeAps({ a: "REVIEW-02", b: "PKG-X", c: undefined, "v-denied": "" });
  const target = ["a", "b", "c", "v-denied", "v-gone"].map((id) => ({ id, name: id }));
  const progress = [];
  const res = await writeTags({ aps, projectId: "p", attrId: "7", rows: target, change: addPackageTag("PKG-X"), onProgress: (p) => progress.push(p.done) });
  assert.deepEqual(aps.writes.sort(), [["a", "REVIEW-02; PKG-X"], ["c", "PKG-X"]]);
  assert.deepEqual(res.written.map((w) => w.row.id).sort(), ["a", "c"]);
  assert.deepEqual(res.skipped.map((r) => r.id), ["b"]);
  assert.deepEqual(res.failed.map((f) => [f.row.id, f.reason]).sort(), [
    ["v-denied", "No permission to edit this file in Forma"],
    ["v-gone", "File not found in Forma"],
  ]);
  assert.equal(progress.at(-1), 5);
});

test("writeTags clearing removes only package tags", async () => {
  const aps = fakeAps({ a: "PKG-1; REVIEW-01; PKG-2", b: "REVIEW-01" });
  const res = await writeTags({ aps, projectId: "p", attrId: "7", rows: [{ id: "a" }, { id: "b" }], change: clearPackageTags() });
  assert.deepEqual(aps.writes, [["a", "REVIEW-01"]]);
  assert.equal(res.skipped.length, 1);
});
