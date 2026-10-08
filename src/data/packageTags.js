// Package tagging: add one package tag (PKG-…) to a set of files' Tags
// attribute so the set can be found in Forma with a single filter and
// added to a File Package there (the Packages API can't create packages
// or add files to them).
//
// There's no backend to issue sequence numbers, so a tag is the project
// code plus the date and time it was made — unique enough for one team,
// and editable before it's written. The tags on the files are the only
// record; the dashboard's Tags column / filter finds a set again.
//
// Tags is shared with other features (data/tags.js), so writes add or
// remove only PKG-… tags, working from each file's current value read
// fresh from Forma just before writing.

import { ATTR_NAME_MAP } from "../core/config.js";
import { addTag, parseTags, removeTags } from "./tags.js";

const pad = (n) => String(n).padStart(2, "0");

// PKG-<project code>-YYMMDD-HHMM in local time, e.g.
// PKG-HI7411-261008-1432. Without a code: PKG-261008-1432.
export function makePackageTag(projectCode, date = new Date()) {
  const code = String(projectCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const stamp =
    `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return ["PKG", code, stamp].filter(Boolean).join("-");
}

export const isPackageTag = (tag) => /^PKG-/i.test(String(tag || ""));

// PKG- then letters, numbers, - _ or . — no spaces, and no ; or , (they
// separate tags). Short enough to paste into Forma's filter.
export const isValidPackageTag = (tag) => /^PKG-[A-Za-z0-9._-]{1,60}$/i.test(String(tag || ""));

// Change functions for writeTags: current Tags value → new value, or
// null when the file needs no change.
export const addPackageTag = (tag) => (current) => addTag(current, tag);
export const clearPackageTags = () => (current) => removeTags(current, isPackageTag);

// Preview from the tags already loaded on the rows (the write itself
// re-reads them). For adding `tag`:
//   change      files that will gain it
//   same        files that already have it (skipped)
//   inOther     Map(other package tag → files) — they keep it as well
//   unknown     files whose tags haven't loaded yet
// For clearing (tag = null):
//   change      files that have package tags
//   same        files with none (skipped)
//   inOther     Map(package tag → files) that will be removed
export function previewTagWrite(rows, tag) {
  let change = 0;
  let same = 0;
  let unknown = 0;
  const inOther = new Map();
  for (const row of rows) {
    if (!row.attrs_loaded) {
      unknown++;
      change++;
      continue;
    }
    const pkgTags = parseTags(row.tags).filter(isPackageTag);
    for (const t of pkgTags) if (t !== tag) inOther.set(t, (inOther.get(t) || 0) + 1);
    const changes = tag ? !pkgTags.includes(tag) : pkgTags.length > 0;
    if (changes) change++;
    else same++;
  }
  return { change, same, inOther, unknown };
}

// Plain-English reason a write failed, for the per-file result list.
export function failureReason(err) {
  const status = err?.status;
  if (status === 403) return "No permission to edit this file in Forma";
  if (status === 404) return "File not found in Forma";
  if (status === 409 || status === 423) return "File is locked or in review";
  if (status === 0) return "Forma didn't respond";
  if (status) return `Forma rejected the change (HTTP ${status})`;
  return err?.message || "Forma rejected the change";
}

const TAG_ATTR_NAMES = Object.keys(ATTR_NAME_MAP).filter((name) => ATTR_NAME_MAP[name] === "tags");

// Current Tags values for version URNs, read from Forma in batches of 50.
// Returns { values: Map(urn → value), failed: Map(urn → reason) }.
export async function readTags(aps, projectId, urns) {
  const values = new Map();
  const failed = new Map();
  for (let i = 0; i < urns.length; i += 50) {
    const batch = urns.slice(i, i + 50);
    try {
      const { results, errors } = await aps.batchGetVersions(projectId, batch);
      for (const r of results) {
        const attr = (r.customAttributes || []).find((a) => TAG_ATTR_NAMES.includes(a.name));
        values.set(r.urn, attr?.value ?? "");
      }
      for (const e of errors) failed.set(e.urn, "File not found in Forma");
    } catch (err) {
      for (const urn of batch) failed.set(urn, `Couldn't read the file's current tags (${failureReason(err)})`);
    }
    for (const urn of batch) if (!values.has(urn) && !failed.has(urn)) failed.set(urn, "Couldn't read the file's current tags");
  }
  return { values, failed };
}

// Applies `change` (addPackageTag / clearPackageTags) to each row's Tags
// attribute (`attrId`) on its version (row.id): reads the current values,
// then writes the files that change, `concurrency` at a time. The HTTP
// layer backs off on 429 / 5xx. Successful writes are never rolled back.
// onProgress({ done, total, failed }) after each file.
// Returns { written: [{ row, value }], skipped: [row], failed: [{ row, reason }] }.
export async function writeTags({ aps, projectId, attrId, rows, change, concurrency = 3, onProgress }) {
  const written = [];
  const skipped = [];
  const failed = [];
  const total = rows.length;
  const progress = () => onProgress?.({ done: written.length + skipped.length + failed.length, total, failed: failed.length });

  const current = await readTags(aps, projectId, rows.map((r) => r.id));
  const toWrite = [];
  for (const row of rows) {
    if (current.failed.has(row.id)) failed.push({ row, reason: current.failed.get(row.id) });
    else {
      const value = change(current.values.get(row.id));
      if (value === null) skipped.push(row);
      else toWrite.push({ row, value });
    }
  }
  progress();

  let next = 0;
  const worker = async () => {
    while (next < toWrite.length) {
      const { row, value } = toWrite[next++];
      try {
        const result = await aps.updateCustomAttributes(projectId, row.id, [{ id: attrId, value }]);
        if (!result.ok) throw Object.assign(new Error("Forma rejected the change"), { status: result.failed?.[0]?.status });
        written.push({ row, value });
      } catch (err) {
        failed.push({ row, reason: failureReason(err) });
      }
      progress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, toWrite.length) }, worker));
  return { written, skipped, failed };
}
