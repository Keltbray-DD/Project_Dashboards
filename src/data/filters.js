// Document filtering for the MIDP search panel — pure functions over
// file rows, so the logic is unit-tested and shared with Compliance
// click-through. Ported from v1.8's midp_search_panel.js.
//
// Filter state:
//   {
//     search: "drainage",                 substring of any field
//     folderMode: "all" | "selected",
//     folders: Set("Project Files / 01 WIP", …)   normalised paths
//     subfolders: true,                   selected folders include children
//     values: Map(field → Set(value)),    "" = (Blank)
//     external: { label, predicate } | null   e.g. a Compliance click
//   }

import { isBlank } from "./fileRows.js";
import { parseTags } from "./tags.js";

export const BLANK = "";

export function emptyFilterState() {
  return { search: "", folderMode: "all", folders: new Set(), subfolders: true, values: new Map(), external: null };
}

// "A /B/ C" and "A / B / C" both → "A / B / C".
export function normaliseFolderPath(p) {
  return String(p || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

// Every folder and ancestor folder containing at least one row, sorted
// so children follow their parent.
export function folderList(rows) {
  const paths = new Set();
  for (const row of rows) {
    const parts = normaliseFolderPath(row.folder_path).split(" / ").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join(" / "));
  }
  return [...paths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Fields holding a list ("A; B"): filtered and counted per item, so a
// row with tags A and B matches a filter on A.
export const LIST_FIELDS = new Set(["tags"]);

// A row's filter values for a field: [BLANK], [value] or, for list
// fields, each item.
export function filterValues(row, field) {
  if (LIST_FIELDS.has(field)) {
    const items = parseTags(row[field]);
    return items.length ? items : [BLANK];
  }
  return [isBlank(row[field]) ? BLANK : String(row[field])];
}

// [[value, count], …] for one field, alphabetical (numeric-aware) with
// (Blank) last.
export function valueCounts(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    for (const v of filterValues(row, field)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[0] === BLANK) return 1;
    if (b[0] === BLANK) return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });
}

// Fields skipped by free-text search (internal keys and URLs).
const NOT_SEARCHED = new Set(["file_url", "id", "item_id", "folder_id", "attrs_loaded"]);

// A row predicate for the state, or null when nothing is filtering.
export function buildPredicate(state) {
  const preds = [];

  const q = String(state.search || "").trim().toLowerCase();
  if (q) {
    preds.push((row) => {
      for (const k in row) {
        if (k.startsWith("_") || NOT_SEARCHED.has(k)) continue;
        const v = row[k];
        if (v != null && String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }

  if (state.folderMode === "selected" && state.folders.size) {
    const selected = [...state.folders];
    const subfolders = state.subfolders;
    preds.push((row) => {
      const p = normaliseFolderPath(row.folder_path);
      return selected.some((f) => p === f || (subfolders && p.startsWith(f + " / ")));
    });
  }

  for (const [field, values] of state.values) {
    if (!values.size) continue;
    preds.push((row) => filterValues(row, field).some((v) => values.has(v)));
  }

  if (state.external?.predicate) preds.push(state.external.predicate);

  return preds.length ? (row) => preds.every((p) => p(row)) : null;
}

// Number of independent active filters (for the Filters badge).
export function activeFilterCount(state) {
  let n = 0;
  if (String(state.search || "").trim()) n++;
  if (state.folderMode === "selected" && state.folders.size) n++;
  for (const values of state.values.values()) if (values.size) n++;
  if (state.external) n++;
  return n;
}
