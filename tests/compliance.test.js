import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, applicableRules } from "../src/compliance/rules.js";
import { evaluate, breakdown, biggestGap, lifecycleOf } from "../src/compliance/engine.js";

const good = {
  title_line_1: "Layout",
  revision: "P01",
  file_description: "Drainage layout",
  status: "S2",
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

test("naming-standard rules are skipped when no document uses the field", () => {
  const rules = applicableRules([good, { ...good, spatial: "" }]);
  assert.equal(rules.find((r) => r.id === "spatial").skipped, true);
  assert.equal(rules.find((r) => r.id === "form").skipped, false);
  // Core rules never skip, even if every value is blank.
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
  // spatial is unused by every doc → 7 active rules
  assert.equal(ev.activeRules.length, 7);
  assert.equal(ev.pending, 1);
  assert.deepEqual(
    { documents: ev.totals.documents, compliant: ev.totals.compliant, withGaps: ev.totals.withGaps, checks: ev.totals.checks, passed: ev.totals.passed },
    { documents: 3, compliant: 1, withGaps: 2, checks: 21, passed: 16 }
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

test("evaluate: scope limits documents but rule applicability uses the whole project", () => {
  const docs = [doc({ spatial: "CH01", folder_path: "03 PUBLISHED" }), doc({ folder_path: "01 WIP" })];
  const ev = evaluate(docs, { scope: "WIP" });
  assert.equal(ev.totals.documents, 1);
  // Spatial is used somewhere in the project, so the WIP doc fails it.
  assert.equal(ev.results[0].failed.includes("spatial"), true);
  assert.equal(lifecycleOf({ folder_path: "Archive" }), "Other");
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
