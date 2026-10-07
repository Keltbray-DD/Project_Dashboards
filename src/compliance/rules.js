// Compliance rules. Each checks one thing about a document's current row.
//
//   id        stable key
//   label     shown on the Compliance page
//   hint      small print under the label
//   field     the row field it reads (also used for MIDP click-through)
//   group     "core" — always applies
//             "naming" — naming-standard field; skipped for a project
//             where no document has that field filled in at all (the
//             project's naming standard doesn't use it)
//   test      (row) => true when the document passes
//   reason    (row) => short text for why it failed (exports)

import { ISO_REVISION_PATTERN, PLACEHOLDER_DESCRIPTION } from "../core/config.js";
import { isBlank } from "../data/fileRows.js";

const present = (field) => (row) => !isBlank(row[field]);
const missing = () => "Missing";

// The five checks for files in the deliverable (MIDP) folders — see
// isDeliverable in compliance/engine.js. Originator, Function, Form and
// Spatial aren't checked (the Compliance page still groups by them).
export const RULES = [
  {
    id: "revision",
    label: "Revision",
    hint: "ISO 19650 format",
    field: "revision",
    group: "core",
    test: (row) => !isBlank(row.revision) && ISO_REVISION_PATTERN.test(row.revision),
    reason: (row) => (isBlank(row.revision) ? "Missing" : `Not ISO format (${row.revision})`),
  },
  { id: "status", label: "Status", field: "status", group: "core", test: present("status"), reason: missing },
  {
    id: "file_description",
    label: "File Description",
    hint: "not the TIDP placeholder",
    field: "file_description",
    group: "core",
    test: (row) => !isBlank(row.file_description) && row.file_description !== PLACEHOLDER_DESCRIPTION,
    reason: (row) => (isBlank(row.file_description) ? "Missing" : "TIDP placeholder"),
  },
  { id: "title_line_1", label: "Title Line 1", field: "title_line_1", group: "core", test: present("title_line_1"), reason: missing },
  { id: "document_classification", label: "Document Classification", field: "document_classification", group: "core", test: present("document_classification"), reason: missing },
];

// The rules that apply to this set of rows: every core rule, plus the
// naming-standard rules for fields at least one document uses.
export function applicableRules(rows, rules = RULES) {
  return rules.map((rule) => ({
    ...rule,
    skipped: rule.group === "naming" && !rows.some((r) => !isBlank(r[rule.field])),
  }));
}
