// Value descriptions from the project's Forma naming standard — "ARP" is
// "Arup", "DR" is "Drawing" — so the search panel's dropdowns can show
// and search them, as Forma's own filter dropdowns do.
//
// The naming standard is found the way v1 did: a deliverable folder's
// details list its namingStandardIds (extension.data), and each standard's
// definition lists fields with their allowed values.

import { ATTR_NAME_MAP, bareProjectId } from "../core/config.js";
import { session } from "../core/storage.js";

// A field option as { value, description }. Strings (no description) and
// other spellings are tolerated in case the schema varies.
export function parseOption(o) {
  if (typeof o === "string") return { value: o, description: "" };
  const value = o?.value ?? o?.name ?? o?.code ?? "";
  const description = o?.description ?? o?.displayName ?? o?.label ?? "";
  return { value: String(value), description: String(description === value ? "" : description).trim() };
}

// Naming-standard fields → { fieldKey: { value: description } }, matching
// field names to row fields through ATTR_NAME_MAP (ignoring case).
// Later standards don't overwrite a description already found.
export function indexDescriptions(fieldLists) {
  const byName = new Map(Object.entries(ATTR_NAME_MAP).map(([name, field]) => [name.toLowerCase(), field]));
  const out = {};
  for (const fields of fieldLists) {
    for (const f of fields || []) {
      const key = byName.get(String(f?.name || "").trim().toLowerCase());
      if (!key || !Array.isArray(f.options)) continue;
      for (const o of f.options) {
        const { value, description } = parseOption(o);
        if (value && description) (out[key] ||= {})[value] ??= description;
      }
    }
  }
  return out;
}

// Reads the naming standard(s) of the first of `folderIds` that has one
// (a few are tried, in order). Cached for the session per project; {} if
// none is found. Failures throw (callers carry on without descriptions).
export async function loadValueDescriptions(aps, projectId, folderIds, { maxFolders = 5 } = {}) {
  const key = `namingStandard:${bareProjectId(projectId)}`;
  const cached = session.get(key, null);
  if (cached) return cached;
  if (!folderIds.length) return {};

  let ids = [];
  for (const folderId of folderIds.slice(0, maxFolders)) {
    const res = await aps.folder(projectId, folderId);
    ids = res?.data?.attributes?.extension?.data?.namingStandardIds || [];
    if (ids.length) break;
  }
  const fieldLists = await Promise.all(ids.map((id) => aps.namingStandard(projectId, id)));
  const descriptions = indexDescriptions(fieldLists);
  session.set(key, descriptions);
  return descriptions;
}
