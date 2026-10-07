import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, applicableRules } from "../src/compliance/rules.js";
import { evaluate, breakdown, biggestGap, lifecycleOf, isDeliverable } from "../src/compliance/engine.js";

const good = {
  title_line_1: "Layout",
  revision: "P01",
  file_description: "Drainage layout",
  status: "S2",
  classification: "Official",
  form: "DR",
  originator: "ARP",
  function: "DRN",
  spatial: "",
  folder_path: "Project Files / 02 SHARED",
  attrs_loaded: true,
};
const doc = (overrides) => ({ current: { ...good, ...overrides } });

const rule = (id) => RULES.find((r) => r.id === id);

test("rules: revision must be ISO, description must not be the placeholder", () => {
  assert.equal(rule("revision").test({ revision: "P01.02" }), true);
  assert.equal(rule("revision").test({ revision: "Rev A" }), false);
  assert.equal(rule("revision").reason({ revision: "Rev A" }), "Not ISO format (Rev A)");
  assert.equal(rule("revision").reason({ revision: "" }), "Missing");
  assert.equal(rule("file_description").test({ file_description: "TIDP Placeholder File" }), false);
  assert.equal(rule("file_description").reason({ file_description: "TIDP Placeholder File" }), "TIDP placeholder");
});

test("the five checks: Revision, Status, File Description, Title Line 1, Document Classification", () => {
  assert.deepEqual(RULES.map((r) => r.id), ["revision", "status", "file_description", "title_line_1", "classification"]);
  assert.equal(rule("classification").test({ classification: "" }), false);
  assert.equal(rule("classification").test({ classification: "Official" }), true);
  // Originator, Function, Form and Spatial aren't checked.
  assert.equal(evaluate([doc({ originator: "", function: "", form: "", spatial: "" })]).totals.compliant, 1);
});

test("naming-group rules are skipped when no document uses the field; core rules never are", () => {
  const custom = [...RULES, { id: "spatial", field: "spatial", group: "naming", test: (r) => !!r.spatial }];
  assert.equal(applicableRules([good, { ...good, spatial: "" }], custom).find((r) => r.id === "spatial").skipped, true);
  assert.equal(applicableRules([{ title_line_1: "" }]).find((r) => r.id === "title_line_1").skipped, false);
});

test("evaluate: totals are per document and per check", () => {
  const docs = [
    doc({}),
    doc({ status: "", revision: "Rev A" }),
    doc({ title_line_1: "", status: "", file_description: "", folder_path: "Project Files / 01 WIP" }),
    doc({ attrs_loaded: false }), // metadata not loaded → not checked
  ];
  const ev = evaluate(docs);
  assert.equal(ev.activeRules.length, 5);
  assert.equal(ev.pending, 1);
  assert.deepEqual(
    { documents: ev.totals.documents, compliant: ev.totals.compliant, withGaps: ev.totals.withGaps, checks: ev.totals.checks, passed: ev.totals.passed },
    { documents: 3, compliant: 1, withGaps: 2, checks: 15, passed: 10 }
  );
  assert.equal(Math.round(ev.totals.compliantPct), 33);
  const status = ev.byRule.find((b) => b.rule.id === "status");
  assert.deepEqual([status.pass, status.fail], [1, 2]);
  assert.deepEqual(biggestGap(ev).rule.id, "status");
});

test("evaluate: lifecycle bands, statuses and revision formats", () => {
  const ev = evaluate([
    doc({}),
    doc({ status: "", revision: "Rev A" }),
    doc({ title_line_1: "", status: "", file_description: "", folder_path: "01 WIP" }),
    doc({ status: "A1", revision: "", folder_path: "03 PUBLISHED" }),
  ]);
  assert.deepEqual(ev.byLifecycle, [
    { key: "WIP", total: 1, ok: 0, minor: 0, major: 1 },
    { key: "SHARED", total: 2, ok: 1, minor: 1, major: 0 },
    { key: "PUBLISHED", total: 1, ok: 0, minor: 1, major: 0 },
  ]);
  assert.deepEqual(ev.statuses, [["A1", 1], ["S2", 1], ["", 2]]);
  assert.deepEqual(ev.revisions, { valid: 2, missing: 1, invalid: 1 });
});

test("evaluate: a lifecycle scope limits the documents checked", () => {
  const docs = [doc({ folder_path: "03 PUBLISHED" }), doc({ folder_path: "01 WIP", status: "" })];
  const ev = evaluate(docs, { scope: "WIP" });
  assert.equal(ev.totals.documents, 1);
  assert.deepEqual(ev.results[0].failed, ["status"]);
  assert.equal(lifecycleOf({ folder_path: "Archive" }), "Other");
});

test("only deliverable folders are checked; the rest are counted as not checked", () => {
  assert.equal(isDeliverable({ folder_path: "0F.SHARED_TO_CLIENT / Drawings" }), true);
  assert.equal(isDeliverable({ folder_path: "0C.WIP / JAC - Jacobs" }), true);
  assert.equal(isDeliverable({ folder_path: "RAMS" }), false);
  const docs = [doc({}), doc({ folder_path: "RAMS", status: "" }), doc({ folder_path: "RAMS / Old", attrs_loaded: false })];
  const ev = evaluate(docs);
  assert.equal(ev.totals.documents, 1);
  assert.equal(ev.totals.withGaps, 0);
  assert.equal(ev.pending, 0, "an unloaded file outside the deliverable folders isn't pending");
  assert.equal(ev.notChecked, 2);
  assert.equal(evaluate(docs, { scope: "SHARED" }).notChecked, 0);
});

test("breakdown groups by a field with per-rule pass rates", () => {
  const ev = evaluate([doc({}), doc({ originator: "KEL", status: "" }), doc({ originator: "KEL" })]);
  const rows = breakdown(ev, "originator");
  assert.deepEqual(rows.map((r) => [r.value, r.total, Math.round(r.compliantPct)]), [["KEL", 2, 50], ["ARP", 1, 100]]);
  assert.equal(rows[0].perRule.status, 50);
  assert.equal(rows[0].perRule.title_line_1, 100);
});

test("everything passing has no biggest gap; empty input is safe", () => {
  assert.equal(biggestGap(evaluate([doc({})])), null);
  const ev = evaluate([]);
  assert.equal(ev.totals.compliantPct, 0);
  assert.deepEqual(ev.byLifecycle, []);
});
