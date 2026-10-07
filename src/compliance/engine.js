// Compliance engine. Runs every applicable rule over every document's
// current row once, and derives every number on the Compliance page from
// those per-document results — no running counters to reset (v1's
// "1556 missing" ghost-count bug came from exactly that).
//
// Basis: one row per document (the stacked current revision), so the
// numbers always match what the MIDP shows.

import { ISO_REVISION_PATTERN } from "../core/config.js";
import { isBlank } from "../data/fileRows.js";
import { folderRank } from "../data/stacking.js";
import { applicableRules, RULES } from "./rules.js";

export const LIFECYCLES = ["WIP", "SHARED", "PUBLISHED"];
const LIFECYCLE_BY_RANK = { 1: "WIP", 2: "SHARED", 3: "PUBLISHED" };
export const lifecycleOf = (row) => LIFECYCLE_BY_RANK[folderRank(row.folder_path)] || "Other";

// Only documents in the deliverable folders — WIP, SHARED,
// SHARED_TO_CLIENT, PUBLISHED — are checked. Others (e.g. an additional
// MIDP folder like RAMS) are counted as "not checked".
export const isDeliverable = (row) => lifecycleOf(row) !== "Other";

const pct = (part, whole) => (whole ? (part / whole) * 100 : 0);

// documents: stacked documents (data/stacking.js)
// options.scope: "all" | "WIP" | "SHARED" | "PUBLISHED"
//
// Returns {
//   rules,          applicable rules (with .skipped)
//   activeRules,    rules actually checked
//   results,        [{ row, failed: [ruleId…] }] per checked document
//   pending,        deliverable documents whose metadata hasn't loaded
//                   (not checked yet)
//   notChecked,     documents outside the deliverable folders (scope
//                   "all" only — a lifecycle scope never includes them)
//   totals: { documents, compliant, withGaps, checks, passed,
//             compliantPct, passedPct }
//   byRule:  [{ rule, pass, fail, pct }]   (active rules, input order)
//   byLifecycle: [{ key, total, ok, minor, major }]  ok = 0 gaps,
//                minor = 1–2 gaps, major = 3+
//   statuses: [[status, count]]   most common first, "" = missing, last
//   revisions: { valid, missing, invalid }
// }
export function evaluate(documents, { scope = "all", rules = RULES } = {}) {
  const current = documents.map((d) => d.current);
  const all = current.filter(isDeliverable);
  const inScope = scope === "all" ? all : all.filter((r) => lifecycleOf(r) === scope);
  const loaded = inScope.filter((r) => r.attrs_loaded);

  const ruleSet = applicableRules(all, rules);
  const activeRules = ruleSet.filter((r) => !r.skipped);

  const results = loaded.map((row) => ({ row, failed: activeRules.filter((rule) => !rule.test(row)).map((r) => r.id) }));

  const compliant = results.filter((r) => r.failed.length === 0).length;
  const checks = results.length * activeRules.length;
  const failedChecks = results.reduce((n, r) => n + r.failed.length, 0);

  const byRule = activeRules.map((rule) => {
    const fail = results.filter((r) => r.failed.includes(rule.id)).length;
    return { rule, pass: results.length - fail, fail, pct: pct(results.length - fail, results.length) };
  });

  const byLifecycle = LIFECYCLES.map((key) => {
    const rows = results.filter((r) => lifecycleOf(r.row) === key);
    return {
      key,
      total: rows.length,
      ok: rows.filter((r) => r.failed.length === 0).length,
      minor: rows.filter((r) => r.failed.length >= 1 && r.failed.length <= 2).length,
      major: rows.filter((r) => r.failed.length >= 3).length,
    };
  }).filter((l) => l.total > 0);

  const statusCounts = new Map();
  let valid = 0;
  let missing = 0;
  let invalid = 0;
  for (const { row } of results) {
    const s = isBlank(row.status) ? "" : String(row.status);
    statusCounts.set(s, (statusCounts.get(s) || 0) + 1);
    if (isBlank(row.revision)) missing++;
    else if (ISO_REVISION_PATTERN.test(row.revision)) valid++;
    else invalid++;
  }
  const statuses = [...statusCounts.entries()].sort((a, b) => {
    if (a[0] === "") return 1;
    if (b[0] === "") return -1;
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });

  return {
    rules: ruleSet,
    activeRules,
    results,
    pending: inScope.length - loaded.length,
    notChecked: scope === "all" ? current.length - all.length : 0,
    totals: {
      documents: results.length,
      compliant,
      withGaps: results.length - compliant,
      checks,
      passed: checks - failedChecks,
      compliantPct: pct(compliant, results.length),
      passedPct: pct(checks - failedChecks, checks),
    },
    byRule,
    byLifecycle,
    statuses,
    revisions: { valid, missing, invalid },
  };
}

// Pass rate per value of `field` (e.g. originator) per active rule.
// Returns [{ value, total, compliantPct, perRule: { ruleId: pct } }],
// largest groups first. Blank values are grouped as "".
export function breakdown(evaluation, field) {
  const groups = new Map();
  for (const r of evaluation.results) {
    const v = isBlank(r.row[field]) ? "" : String(r.row[field]);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(r);
  }
  return [...groups.entries()]
    .map(([value, rows]) => ({
      value,
      total: rows.length,
      compliantPct: pct(rows.filter((r) => r.failed.length === 0).length, rows.length),
      perRule: Object.fromEntries(
        evaluation.activeRules.map((rule) => [rule.id, pct(rows.filter((r) => !r.failed.includes(rule.id)).length, rows.length)])
      ),
    }))
    .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
}

// The active rule with the most failures (null if everything passes).
export function biggestGap(evaluation) {
  const worst = [...evaluation.byRule].sort((a, b) => b.fail - a.fail)[0];
  return worst && worst.fail > 0 ? worst : null;
}
