// Document stacking: collapses the copies of one document that live in
// different folders (WIP / SHARED / PUBLISHED) into a single document
// with one "current" row — the version the MIDP shows and compliance
// measures — plus its siblings for the revision history.
//
// Ported from v1 tabulator_setup.js (dedupByDocNumber / pickWinner), with
// the same rules, but pure: rows are never mutated and the result is a
// separate Document structure:
//
//   {
//     key,                "<docNo>|<ext>"
//     docNo, ext,
//     current,            the row shown for this document
//     siblings,           the document's other rows (other folders)
//     hasNewerRevision,   a newer revision is in progress past an
//                         approved current row (orange folder cue)
//     hasHistory,         siblings exist or current has older versions
//   }

// "ABC-XX-DR-001.pdf" → { docNo: "ABC-XX-DR-001", ext: "pdf" }
export function parseDocNumber(filename) {
  const s = String(filename || "");
  const i = s.lastIndexOf(".");
  if (i < 0) return { docNo: s, ext: "" };
  return { docNo: s.slice(0, i), ext: s.slice(i + 1).toLowerCase() };
}

// Cycle-aware revision rank: each P-major occupies 200 slots so the
// ISO 19650 lifecycle order falls out of integer comparison.
//   slots 1-99  → P##.01 … P##.99  (WIP drafts of that major)
//   slot 100    → P##               (internally approved → SHARED)
//   slot 101    → C##               (client approved → PUBLISHED)
// -1 for blank, 0 for anything that isn't an ISO revision.
// Caveat: assumes C## was approved from the P-major of the same number;
// if a project skips a cycle the C row sorts earlier than it belongs.
export function revisionRank(rev) {
  if (rev === undefined || rev === null || rev === "") return -1;
  const m = String(rev).match(/^([CP])(\d{2})(?:\.(\d{2}))?$/);
  if (!m) return 0;
  const cycleBase = (parseInt(m[2], 10) - 1) * 200;
  if (m[1] === "P") return cycleBase + (m[3] === undefined ? 100 : parseInt(m[3], 10));
  return cycleBase + 101;
}

// PUBLISHED 3 > SHARED 2 > WIP 1 > anything else 0.
export function folderRank(folderPath) {
  const fp = String(folderPath || "").toUpperCase();
  if (fp.includes("PUBLISHED")) return 3;
  if (fp.includes("SHARED")) return 2;
  if (fp.includes("WIP")) return 1;
  return 0;
}

const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

// Negative if a is older than b. Revision rank first (WIP files get
// touched after their SHARED copy is approved, so dates mislead within a
// cycle), then last-modified date, then folder rank.
export function compareLatest(a, b) {
  return (
    revisionRank(a?.revision) - revisionRank(b?.revision) ||
    time(a?.last_modified_date) - time(b?.last_modified_date) ||
    folderRank(a?.folder_path) - folderRank(b?.folder_path)
  );
}

// For ordering revision history. created_at (upload time into the
// folder) is the most reliable lifecycle signal and handles cross-cycle
// cases revision rank can't (C01 approved from P02); falls back to
// revision rank, then last-modified date.
export function compareByCreation(a, b) {
  const ca = time(a?.created_at);
  const cb = time(b?.created_at);
  if (ca && cb && ca !== cb) return ca - cb;
  return (
    revisionRank(a?.revision) - revisionRank(b?.revision) ||
    time(a?.last_modified_date) - time(b?.last_modified_date)
  );
}

// Picks the current row for a group. SHARED and PUBLISHED are "approved"
// — what everyone downstream consumes — so the current row comes from
// there when possible, PUBLISHED beating SHARED regardless of revision
// (a client-approved C01 stays current even with a re-approved P02 in
// SHARED); revision only breaks ties within a folder rank. WIP is the
// fallback for documents not yet approved.
//
// hasNewerRevision: the current row is approved and some other row has a
// higher revision rank (a WIP draft past it, or a SHARED re-approval
// waiting on the client).
export function pickCurrent(group) {
  const approved = group.filter((r) => folderRank(r.folder_path) >= 2);
  if (approved.length) {
    const current = [...approved].sort(
      (a, b) => folderRank(b.folder_path) - folderRank(a.folder_path) || compareLatest(b, a)
    )[0];
    const rank = revisionRank(current.revision);
    return { current, hasNewerRevision: group.some((r) => r !== current && revisionRank(r.revision) > rank) };
  }
  return { current: [...group].sort((a, b) => compareLatest(b, a))[0], hasNewerRevision: false };
}

// Groups rows by document number + extension and returns one Document per
// group, in first-seen order. Rows without a name are skipped.
export function stackDocuments(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.name) continue;
    const { docNo, ext } = parseDocNumber(row.name);
    const key = `${docNo}|${ext}`;
    if (!groups.has(key)) groups.set(key, { docNo, ext, rows: [] });
    groups.get(key).rows.push(row);
  }

  const documents = [];
  for (const [key, { docNo, ext, rows: group }] of groups) {
    const { current, hasNewerRevision } = pickCurrent(group);
    const siblings = group.filter((r) => r !== current);
    documents.push({
      key,
      docNo,
      ext,
      current,
      siblings,
      hasNewerRevision,
      hasHistory: siblings.length > 0 || (current.version || 1) > 1,
    });
  }
  return documents;
}
