// Forma custom-attribute definitions — what the inline editor needs to
// PATCH a value (the attribute id) and whether to show a dropdown.
//
// Definitions are read from the project's "Project Files" folder, as v1
// did; sub-folders inherit them.

import { FIELD_ATTR_NAME } from "../core/config.js";

// Dropdown options for a definition, or null for free text. Forma
// exposes dropdowns as { type: "array", arrayValues: [...] }; the other
// spellings are tolerated in case the schema shifts.
export function optionsOf(def) {
  if (!def) return null;
  const isList = ["array", "list", "drop", "dropdown"].includes(def.type);
  if (!isList) return null;
  const raw = def.arrayValues || def.metadata?.list?.options || def.dropdownOptions || def.options;
  if (!Array.isArray(raw)) return null;
  return raw
    .map((o) => (typeof o === "string" ? o : o?.value || o?.displayName || o?.name || o?.label || ""))
    .filter((v) => v !== "");
}

// field key → { id, name, type, options }
export function indexDefinitions(defs) {
  const byName = new Map((defs || []).map((d) => [d.name, d]));
  const byField = {};
  for (const [field, name] of Object.entries(FIELD_ATTR_NAME)) {
    // project_pin has two spellings across projects.
    const def = byName.get(name) || (field === "project_pin" ? byName.get("Project PIN") : undefined);
    if (def) byField[field] = { id: def.id, name: def.name, type: def.type, options: optionsOf(def) };
  }
  return byField;
}

export async function loadAttributeDefinitions(aps, projectId) {
  const top = await aps.topFolders(projectId);
  const projectFiles = top.find((f) => (f.attributes?.name || f.attributes?.displayName) === "Project Files");
  if (!projectFiles) throw new Error('No "Project Files" folder found in this project');
  return indexDefinitions(await aps.customAttributeDefinitions(projectId, projectFiles.id));
}
