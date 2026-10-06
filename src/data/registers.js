// Which documents each register lists, and what external clients see.

// Drawing Register (v1 rule): a client-approved drawing — revision
// contains "C" and the Form is DR — or anything flagged Deliverable = Yes.
// Applied to each document's current (approved) row.
export function isDrawingRegisterRow(row) {
  const rev = String(row?.revision || "");
  const form = String(row?.form || "");
  const deliverable = String(row?.deliverable || "");
  return (rev.includes("C") && form.includes("DR")) || deliverable.includes("Yes");
}

// External clients only see files in client-facing folders: PUBLISHED,
// or a SHARED_TO_CLIENT folder (e.g. "0F.SHARED_TO_CLIENT").
// Cosmetic only — ACC enforces what a client's token can actually read.
export function isClientVisible(row) {
  const fp = String(row?.folder_path || "").toUpperCase();
  return fp.includes("PUBLISHED") || fp.includes("SHARED_TO_CLIENT");
}
