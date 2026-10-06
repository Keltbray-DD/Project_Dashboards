// Compliance view: how complete the project's document metadata is,
// measured on one row per document (the same stacked rows the MIDP
// shows). Every number is clickable and opens the MIDP filtered to
// exactly those documents.

import { sectionOf } from "../core/config.js";
import { navigate } from "../core/router.js";
import { store } from "../core/store.js";
import { evaluate, breakdown, biggestGap, lifecycleOf, LIFECYCLES } from "../compliance/engine.js";
import { h, icon, mount } from "../ui/dom.js";
import { formatNumber } from "../ui/format.js";
import { kpi, passBar, stackedBar, countBars, heatCell, roundPct } from "../ui/charts.js";
import { toast } from "../ui/toast.js";
import { setMidpExternalFilter } from "./midp/index.js";

// Remembered while the page is open.
let scope = "all";
let groupField = "originator";

const GROUP_FIELDS = [
  ["originator", "Originator"],
  ["function", "Function"],
  ["form", "Form"],
];

export function complianceView(container, ctx) {
  const { project } = ctx;
  const root = h("div", {});
  mount(container, root);

  const draw = () => render(root, project, store.get().documents || [], draw);
  draw();
  const unsubscribe = store.subscribe((_s, changed) => {
    if (changed.includes("documents") || changed.includes("editsVersion") || changed.includes("metadataProgress")) draw();
  });
  return unsubscribe;
}

function render(root, project, documents, redraw) {
  const ev = evaluate(documents, { scope });
  const { totals } = ev;

  // Click-through: open the MIDP filtered to the documents matching
  // `pred`, within the current scope and only those actually checked.
  const inScope = (row) => row.attrs_loaded && (scope === "all" || lifecycleOf(row) === scope);
  const show = (label, pred) => () => {
    setMidpExternalFilter({ label: scope === "all" ? label : `${label} · ${scope}`, predicate: (row) => inScope(row) && pred(row) });
    navigate("midp");
  };
  const failsAny = (row) => ev.activeRules.some((r) => !r.test(row));
  const ruleById = Object.fromEntries(ev.activeRules.map((r) => [r.id, r]));

  const scopeBtns = h(
    "div",
    { class: "segmented", role: "group", "aria-label": "Lifecycle scope" },
    ["all", ...LIFECYCLES].map((s) =>
      h("button", {
        type: "button",
        class: s === scope ? "on" : "",
        "aria-pressed": String(s === scope),
        onclick: () => {
          scope = s;
          redraw();
        },
      }, s === "all" ? "All" : s)
    )
  );

  const head = h(
    "div",
    { class: "page-head" },
    h(
      "div",
      {},
      h("div", { class: "eyebrow" }, `${project.code ? project.code + " · " : ""}${sectionOf("compliance")?.label || ""}`),
      h("h1", {}, "Compliance"),
      h("div", { class: "sub" }, `${formatNumber(totals.documents)} documents · ${ev.activeRules.length} metadata checks · click anything to see those documents in the MIDP`)
    ),
    h(
      "div",
      { class: "actions" },
      scopeBtns,
      totals.withGaps > 0 && h("button", { class: "btn outline", type: "button", onclick: show("Documents with gaps", failsAny) }, "View gaps in MIDP"),
      h("button", { class: "btn primary", type: "button", disabled: !totals.withGaps, onclick: () => exportGaps(ev, project) }, icon("file-excel"), "Export gaps")
    )
  );

  const notice =
    ev.pending > 0 &&
    h("div", { class: "notice" }, icon("hourglass-half"), `${formatNumber(ev.pending)} document${ev.pending === 1 ? "" : "s"} still loading metadata — not counted yet.`);

  if (!totals.documents) {
    mount(root, head, notice, h("div", { class: "card card-pad muted" }, ev.pending ? "Waiting for metadata…" : "No documents in this scope."));
    return;
  }

  const gap = biggestGap(ev);
  const kpis = h(
    "div",
    { class: "kpis" },
    kpi({
      hero: true,
      label: "Fully compliant",
      value: roundPct(totals.compliantPct),
      suffix: "%",
      note: `${formatNumber(totals.compliant)} of ${formatNumber(totals.documents)} documents pass every check`,
      meter: totals.compliantPct,
    }),
    kpi({
      label: "Checks passed",
      value: roundPct(totals.passedPct),
      suffix: "%",
      note: `${formatNumber(totals.passed)} of ${formatNumber(totals.checks)} individual checks`,
      meter: totals.passedPct,
    }),
    kpi({
      label: "Documents with gaps",
      value: formatNumber(totals.withGaps),
      valueTone: totals.withGaps ? "bad" : "good",
      note: totals.withGaps ? "View in MIDP ›" : "Nothing to fix",
      onClick: totals.withGaps ? show("Documents with gaps", failsAny) : undefined,
    }),
    kpi({
      label: "Biggest gap",
      value: gap ? gap.rule.label : "None",
      valueTone: gap ? "small" : "small good",
      note: gap ? `${formatNumber(gap.fail)} documents fail · view ›` : "Every check passes",
      onClick: gap ? show(`Fails: ${gap.rule.label}`, (row) => !gap.rule.test(row)) : undefined,
    })
  );

  const checksCard = h(
    "div",
    { class: "card card-pad" },
    h("h3", {}, "Checks"),
    h("div", { class: "card-hint" }, "% of documents passing each rule"),
    ev.rules.map((rule) => {
      const b = ev.byRule.find((x) => x.rule.id === rule.id);
      return passBar({
        label: rule.label,
        hint: rule.hint,
        pct: b?.pct || 0,
        fail: b?.fail || 0,
        disabled: rule.skipped,
        note: "Not used in this project",
        title: b ? `Show the ${formatNumber(b.fail)} documents failing ${rule.label}` : undefined,
        onClick: b ? show(`Fails: ${rule.label}`, (row) => !rule.test(row)) : undefined,
      });
    })
  );

  const gapsOf = (row) => ev.activeRules.filter((r) => !r.test(row)).length;
  const lifecycleCard = h(
    "div",
    { class: "card card-pad" },
    h("h3", {}, "By lifecycle"),
    h("div", { class: "card-hint" }, "Current documents by number of failed checks"),
    h(
      "div",
      { class: "lifecycle" },
      ev.byLifecycle.map((l) => {
        const at = (pred) => (row) => lifecycleOf(row) === l.key && pred(gapsOf(row));
        return h(
          "div",
          { class: "lc-row" },
          h("span", { class: `lc ${{ WIP: "wip", SHARED: "shared", PUBLISHED: "pub" }[l.key]}` }, l.key),
          stackedBar([
            { value: l.ok, cls: "ok", title: `${formatNumber(l.ok)} pass every check`, onClick: show(`${l.key}: all checks pass`, at((g) => g === 0)) },
            { value: l.minor, cls: "minor", title: `${formatNumber(l.minor)} with 1–2 gaps`, onClick: show(`${l.key}: 1–2 gaps`, at((g) => g >= 1 && g <= 2)) },
            { value: l.major, cls: "major", title: `${formatNumber(l.major)} with 3+ gaps`, onClick: show(`${l.key}: 3+ gaps`, at((g) => g >= 3)) },
          ]),
          h("span", { class: "muted lc-total" }, formatNumber(l.total))
        );
      })
    ),
    h(
      "div",
      { class: "legend" },
      h("span", {}, h("i", { class: "ok" }), "All checks pass"),
      h("span", {}, h("i", { class: "minor" }), "1–2 gaps"),
      h("span", {}, h("i", { class: "major" }), "3+ gaps")
    )
  );

  const groups = breakdown(ev, groupField);
  const groupLabel = GROUP_FIELDS.find(([f]) => f === groupField)[1];
  const heatCard = h(
    "div",
    { class: "card card-pad wide" },
    h(
      "div",
      { class: "card-head" },
      h("div", {}, h("h3", {}, `By ${groupLabel.toLowerCase()}`), h("div", { class: "card-hint" }, "% of documents passing each rule — click a cell to see the failures")),
      h(
        "div",
        { class: "segmented small" },
        GROUP_FIELDS.map(([f, label]) =>
          h("button", { type: "button", class: f === groupField ? "on" : "", onclick: () => { groupField = f; redraw(); } }, label)
        )
      )
    ),
    h(
      "div",
      { class: "heat-wrap" },
      h(
        "table",
        { class: "heat-table" },
        h("thead", {}, h("tr", {}, h("th", {}, groupLabel), ev.activeRules.map((r) => h("th", {}, r.label)), h("th", { class: "num" }, "Compliant"), h("th", { class: "num" }, "Docs"))),
        h(
          "tbody",
          {},
          groups.map((g) => {
            const name = g.value || "(Blank)";
            const inGroup = (row) => (row[groupField] || "") === g.value;
            return h(
              "tr",
              {},
              h("th", { scope: "row" }, name),
              ev.activeRules.map((r) =>
                heatCell(g.perRule[r.id], {
                  title: `${groupLabel} ${name}: ${roundPct(g.perRule[r.id])}% pass ${r.label}`,
                  onClick: show(`${groupLabel} ${name} · fails ${r.label}`, (row) => inGroup(row) && !ruleById[r.id].test(row)),
                })
              ),
              h("td", { class: "num" }, `${roundPct(g.compliantPct)}%`),
              h("td", { class: "num muted" }, formatNumber(g.total))
            );
          })
        )
      )
    )
  );

  const statusCard = h(
    "div",
    { class: "card card-pad" },
    h("h3", {}, "Status distribution"),
    h("div", { class: "card-hint" }, "Current documents by suitability / status code"),
    countBars(
      ev.statuses.map(([s, n]) => ({
        label: s || "Missing",
        value: n,
        cls: s === "" ? "bad" : /^A/i.test(s) ? "good" : "",
        title: `Show ${formatNumber(n)} documents`,
        onClick: show(s ? `Status ${s}` : "Status missing", (row) => (row.status || "") === s),
      }))
    )
  );

  const revRule = ruleById.revision;
  const revisionCard = h(
    "div",
    { class: "card card-pad" },
    h("h3", {}, "Revision format"),
    h("div", { class: "card-hint" }, "ISO 19650 revision codes — P01, P01.02, C01"),
    countBars([
      { label: "Valid", value: ev.revisions.valid, cls: "good", onClick: show("Revision valid", (row) => revRule.test(row)) },
      { label: "Not ISO", value: ev.revisions.invalid, cls: "warn", onClick: show("Revision not ISO format", (row) => !!row.revision && !revRule.test(row)) },
      { label: "Missing", value: ev.revisions.missing, cls: "bad", onClick: show("Revision missing", (row) => !row.revision) },
    ])
  );

  mount(root, head, notice, kpis, h("div", { class: "c-grid" }, checksCard, lifecycleCard, heatCard, statusCard, revisionCard));
}

function exportGaps(ev, project) {
  if (typeof window.XLSX === "undefined") {
    toast("Export unavailable", "The spreadsheet library didn't load.", { error: true });
    return;
  }
  const rows = ev.results
    .filter((r) => r.failed.length)
    .map(({ row, failed }) => ({
      Document: row.name,
      Revision: row.revision,
      Status: row.status,
      Lifecycle: lifecycleOf(row),
      Folder: row.folder_path,
      "Failed checks": failed.length,
      Gaps: failed.map((id) => {
        const rule = ev.activeRules.find((r) => r.id === id);
        return `${rule.label}: ${rule.reason(row)}`;
      }).join("; "),
      Link: row.file_url,
    }));
  const sheet = window.XLSX.utils.json_to_sheet(rows);
  const book = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(book, sheet, "Gaps");
  window.XLSX.writeFile(book, `${project.code || "Project"} compliance gaps${scope === "all" ? "" : " " + scope}.xlsx`);
}
