// MIDP column definitions and cell formatters. Formatters return DOM
// nodes built with textContent (never HTML strings), so attribute values
// from Forma can't inject markup.

import { ISO_REVISION_PATTERN, PLACEHOLDER_DESCRIPTION } from "../../core/config.js";
import { folderRank } from "../../data/stacking.js";
import { isBlank } from "../../data/fileRows.js";
import { h, icon } from "../../ui/dom.js";
import { formatDateTime } from "../../ui/format.js";

// Field keys shown/hidden by default (the column picker overrides).
export const HIDDEN_BY_DEFAULT = new Set([
  "title_line_2",
  "title_line_3",
  "title_line_4",
  "activity_code",
  "last_modified_user",
  "last_modified_date",
  "created_by_user",
  "spatial",
]);

// Fields the inline editor may change (when Forma defines them).
export const EDITABLE_FIELDS = [
  "revision",
  "file_description",
  "title_line_1",
  "title_line_2",
  "title_line_3",
  "title_line_4",
  "status",
  "activity_code",
  "series",
];

const LIFECYCLE = { 3: ["pub", "PUBLISHED"], 2: ["shared", "SHARED"], 1: ["wip", "WIP"] };

// ---------- formatters ----------

// Before enrichment finishes, blank attribute cells show a quiet "…"
// rather than flashing red "Missing".
function pending(row) {
  return !row.attrs_loaded && !row._child;
}

export function missing(level = "bad") {
  return h("span", { class: `missing ${level}` }, icon(level === "bad" ? "circle-exclamation" : "circle-minus"), "Missing");
}

const loadingDots = () => h("span", { class: "muted" }, "…");
const notLoaded = () => h("span", { class: "muted", title: "Couldn't load this file's metadata from Forma — use Retry above the table" }, "—");
// Placeholder for a blank attribute cell that hasn't been filled in yet.
const placeholder = (row) => (row.attrs_error ? notLoaded() : loadingDots());

function text(level) {
  return (cell) => {
    const v = cell.getValue();
    if (!isBlank(v)) return document.createTextNode(String(v));
    return pending(cell.getRow().getData()) ? placeholder(cell.getRow().getData()) : missing(level);
  };
}

function revision(cell) {
  const v = cell.getValue();
  const row = cell.getRow().getData();
  if (isBlank(v)) return pending(row) ? placeholder(row) : missing("bad");
  if (ISO_REVISION_PATTERN.test(v)) return document.createTextNode(v);
  const rank = folderRank(row.folder_path);
  const reason =
    rank === 3 ? "Files in PUBLISHED must use the format C##" :
    rank === 2 ? "Files in SHARED must use the format P##" :
    "Not ISO 19650 format — use P01, C02 or P02.03";
  return h("span", { class: "missing warn", title: reason }, icon("triangle-exclamation"), v);
}

function description(cell) {
  const v = cell.getValue();
  if (v === PLACEHOLDER_DESCRIPTION) return h("span", { class: "missing warn", title: "TIDP placeholder — replace with a real description" }, icon("triangle-exclamation"), v);
  return text("bad")(cell);
}

function status(cell) {
  const v = cell.getValue();
  if (isBlank(v)) return pending(cell.getRow().getData()) ? placeholder(cell.getRow().getData()) : missing("bad");
  return h("span", { class: `pill ${/^A/i.test(v) ? "ok" : "info"}` }, v);
}

// Lifecycle tag + the path below the lifecycle folder; full path on hover.
// A branch icon flags "newer revision in progress" on the current row.
function folder(cell) {
  const v = String(cell.getValue() || "");
  const row = cell.getRow().getData();
  const [cls, label] = LIFECYCLE[folderRank(v)] || ["other", ""];
  const parts = v.split("/").map((s) => s.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => /WIP|SHARED|PUBLISHED/i.test(p));
  const rest = idx >= 0 ? parts.slice(idx + 1).join(" / ") : parts.slice(1).join(" / ") || v;
  return h(
    "span",
    { class: "folder", title: v },
    label && h("span", { class: `lc ${cls}` }, label),
    rest && h("span", { class: "folder-rest" }, rest),
    row._hasNewerRevision && h("span", { class: "newer", title: "A newer revision is in progress" }, icon("code-branch"))
  );
}

function link(cell) {
  const v = cell.getValue();
  if (!v || !/^https?:\/\//i.test(v)) return "";
  return h("a", { class: "cell-link", href: v, target: "_blank", rel: "noopener", title: "Open in Forma" }, icon("arrow-up-right-from-square"));
}

function name(cell) {
  const row = cell.getRow().getData();
  if (row._loading) return h("span", { class: "muted" }, row.name);
  return h("span", { class: "doc-name", title: row.name }, row.name);
}

const date = (cell) => formatDateTime(cell.getValue());
// ISO timestamps; blanks sort first. (Tabulator’s "datetime" sorter needs Luxon.)
const dateSorter = (a, b) => (Date.parse(a) || 0) - (Date.parse(b) || 0);
const user = (cell) => cell.getValue() || "Forma system";

// ---------- columns ----------

// options:
//   extraFields   project-specific fields (e.g. ["series"])
//   editor        Tabulator editor function for editable cells
//   editable      (cell) => boolean
//   cellEdited    (cell) => void
//   onInfo        (rowData) => void — opens revision history
//   hidden        Set of fields hidden by default (default HIDDEN_BY_DEFAULT)
//   titles        { field: "Title" } overrides (e.g. Modified → "Issued")
export function buildColumns({ extraFields = [], editor, editable, cellEdited, onInfo, hidden = HIDDEN_BY_DEFAULT, titles = {} }) {
  const edit = { editor, editable, cellEdited };
  const cols = [
    {
      title: "",
      field: "_select",
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      titleFormatterParams: { rowRange: "active" },
      width: 40,
      widthShrink: 0,
      hozAlign: "center",
      headerHozAlign: "center",
      headerSort: false,
      download: false,
      cellClick: (e, cell) => {
        if (e.target.tagName !== "INPUT") cell.getRow().toggleSelect();
      },
    },
    {
      title: "",
      field: "_info",
      width: 40,
      widthShrink: 0,
      hozAlign: "center",
      headerSort: false,
      download: false,
      formatter: (cell) => {
        const d = cell.getRow().getData();
        return d._loading || d._child ? "" : h("button", { class: "icon-cell", type: "button", title: "All revisions" }, icon("clock-rotate-left"));
      },
      cellClick: (e, cell) => {
        const d = cell.getRow().getData();
        if (!d._loading && !d._child) onInfo(d);
      },
    },
    { title: "File Name", field: "name", widthGrow: 3, minWidth: 240, formatter: name },
    { title: "Ver.", field: "version", width: 64, hozAlign: "center", sorter: "number" },
    { title: "", field: "file_url", width: 44, hozAlign: "center", formatter: link, headerSort: false, titleDownload: "File URL" },
    { title: "Rev", field: "revision", width: 92, formatter: revision, ...edit },
    { title: "Status", field: "status", width: 92, formatter: status, ...edit },
    { title: "Folder", field: "folder_path", widthGrow: 2, minWidth: 180, formatter: folder },
    { title: "Title Line 1", field: "title_line_1", widthGrow: 3, minWidth: 200, formatter: text("bad"), ...edit },
    { title: "Title Line 2", field: "title_line_2", widthGrow: 2, minWidth: 150, formatter: text("warn"), ...edit },
    { title: "Title Line 3", field: "title_line_3", widthGrow: 2, minWidth: 150, formatter: text("warn"), ...edit },
    { title: "Title Line 4", field: "title_line_4", widthGrow: 2, minWidth: 150, formatter: text("warn"), ...edit },
    { title: "File Description", field: "file_description", widthGrow: 2, minWidth: 180, formatter: description, ...edit },
    { title: "Form", field: "form", width: 78, formatter: text("warn") },
    { title: "Originator", field: "originator", width: 100, formatter: text("warn") },
    { title: "Function", field: "function", width: 96, formatter: text("warn") },
    { title: "Spatial", field: "spatial", width: 90, formatter: text("warn") },
    { title: "Type", field: "file_type", width: 70, hozAlign: "center" },
    { title: "Activity Code", field: "activity_code", width: 120, formatter: text("warn"), ...edit },
  ];
  if (extraFields.includes("series")) {
    cols.push({ title: "Series", field: "series", width: 90, formatter: text("warn"), ...edit });
  }
  cols.push(
    { title: "Modified by", field: "last_modified_user", width: 150, formatter: user },
    { title: "Modified", field: "last_modified_date", width: 150, formatter: date, sorter: dateSorter },
    { title: "Created by", field: "created_by_user", width: 150, formatter: user }
  );
  for (const c of cols) {
    if (hidden.has(c.field)) c.visible = false;
    if (titles[c.field]) c.title = titles[c.field];
  }
  return cols;
}
