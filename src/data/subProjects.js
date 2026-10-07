// Region / sub-project scope for framework projects.
//
// A framework extract has a Parent record for the framework itself and one
// Child record per region (e.g. "Axminster"). Inside a region, each
// top-level folder is a sub-project ("AX027_Milborne_Port (PS009789)").
//
// Read live (the default), a framework opens on a sub-project chooser and
// only the chosen scope — one sub-project, a region or the whole
// framework — is loaded. A region's top-level folders are listed first
// (classifyRegionFolders) to build the chooser without loading any files.
//
// From the extract (?source=extract, or if Forma can't be listed), every
// file is loaded and the scope filters them in memory (buildScopes,
// scopeFiles). There, framework-wide files (from the Parent record) show
// in every scope.
//
// Either way a sub-project's scope includes its region's region-level
// files (in the region but not in a sub-project folder).
//
// Rows carry `regions` (every region the file is listed under; [] =
// framework-wide) and `sub_project` (its sub-project folder name; "" =
// region-level).
//
// Scope keys (persisted per project, and in the URL as ?scope=):
//   ""                          none chosen (extract mode: whole framework)
//   "framework"                 whole framework
//   "region:<region>"           one region
//   "sub:<region>|<folder>"     one sub-project

import { MIDP_FOLDER_PATTERN } from "../core/config.js";

// Standard container folders (0C.WIP, 0E.SHARED, Z.PROJECT_ADMIN, …) at the
// top of a region aren't sub-projects; files in them are region-level.
const CONTAINER_FOLDER = /^\d*[A-Z]\.[A-Z]/;
const isContainer = (name) => CONTAINER_FOLDER.test(name) || MIDP_FOLDER_PATTERN.test(name);

// Training / example sub-projects (XX0000_Training_Example) are dropped.
export const isTrainingFolder = (folder) => /^XX0000/i.test(folder || "");

const CANCELLED = /\s*\bCANCELLED\s*$/i;

export const FRAMEWORK_SCOPE = "framework";

// A row's sub-project folder: the first segment of its folder path, after
// the ACC root ("Project Files") and the region's own folder if the path
// includes them.
//   ("AX027_Milborne_Port (PS009789) / 0E.SHARED_AX027", "Axminster") → "AX027_Milborne_Port (PS009789)"
export function subProjectFolder(folderPath, region) {
  const parts = String(folderPath || "").split(" / ").map((s) => s.trim()).filter(Boolean);
  if (parts[0] === "Project Files") parts.shift();
  if (region && parts[0] === region) parts.shift();
  const top = parts[0] || "";
  return top && !isContainer(top) ? top : "";
}

// "MA503 - Salisbury_GIS_Board (PS009222) CANCELLED" → "MA503 Salisbury GIS Board (PS009222)"
export function subProjectLabel(folder) {
  return String(folder || "")
    .replace(CANCELLED, "")
    .replace(/_/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const isCancelled = (folder) => CANCELLED.test(folder || "");

export const regionKey = (region) => `region:${region}`;
export const subProjectKey = (region, folder) => `sub:${region}|${folder}`;

const byLabel = (a, b) => a.cancelled - b.cancelled || a.label.localeCompare(b.label, undefined, { numeric: true });
const subProjectEntry = (region, folder, id) => ({
  key: subProjectKey(region, folder),
  folder,
  label: subProjectLabel(folder),
  cancelled: isCancelled(folder),
  ...(id ? { id } : {}),
});

// Sorts one region's top-level folders ([{ id, name }]) into
//   subProjects: [{ key, folder, label, cancelled, id }] — by label,
//                cancelled last; training folders left out
//   containers:  [{ id, path }] — the region's own WIP / SHARED /
//                PUBLISHED folders (region-level files); other container
//                folders (Z.PROJECT_ADMIN, …) are ignored
export function classifyRegionFolders(region, folders) {
  const subProjects = [];
  const containers = [];
  for (const { id, name } of folders || []) {
    if (!name) continue;
    if (isContainer(name)) {
      if (MIDP_FOLDER_PATTERN.test(name)) containers.push({ id, path: name });
    } else if (!isTrainingFolder(name)) {
      subProjects.push(subProjectEntry(region, name, id));
    }
  }
  return { subProjects: subProjects.sort(byLabel), containers };
}

// Extract mode: picker groups from the loaded files, in the extract's
// region order; sub-projects by label with cancelled ones last:
//   [{ region, key, subProjects: [{ key, folder, label, cancelled }] }]
export function buildScopes(regions, files) {
  const folders = new Map((regions || []).map((r) => [r.name, new Set()]));
  for (const f of files || []) {
    if (!f.sub_project) continue;
    for (const r of f.regions || []) folders.get(r)?.add(f.sub_project);
  }
  return [...folders].map(([region, set]) => ({
    region,
    key: regionKey(region),
    subProjects: [...set].map((folder) => subProjectEntry(region, folder)).sort(byLabel),
  }));
}

// The picker only appears when there's a real choice.
export function hasScopeChoice(scopes) {
  const list = scopes || [];
  return list.length >= 2 || list.some((g) => g.subProjects.length >= 2);
}

// Files in scope. "", "framework" (or an unknown key) keeps everything.
export function scopeFiles(files, key) {
  const parsed = parseKey(key);
  if (!parsed) return files;
  return files.filter((f) => {
    const regions = f.regions || [];
    if (regions.length === 0) return true;
    if (!regions.includes(parsed.region)) return false;
    return !parsed.folder || !f.sub_project || f.sub_project === parsed.folder;
  });
}

// A remembered scope is only honoured if it still exists.
export function validScope(key, scopes) {
  return key && scopeLabel(key, scopes) ? key : "";
}

// Display name for a scope key ("" when none or unknown).
export function scopeLabel(key, scopes) {
  if (key === FRAMEWORK_SCOPE) return "Whole framework";
  for (const g of scopes || []) {
    if (g.key === key) return g.region;
    const sp = g.subProjects.find((s) => s.key === key);
    if (sp) return sp.label;
  }
  return "";
}

// What a scope covers: [{ group, subProjects }] — the regions it touches
// and, in each, the sub-projects to load (all of them for a region or the
// whole framework). [] for an unknown key.
export function scopeParts(key, scopes) {
  const groups = scopes || [];
  if (key === FRAMEWORK_SCOPE) return groups.map((group) => ({ group, subProjects: group.subProjects }));
  for (const group of groups) {
    if (group.key === key) return [{ group, subProjects: group.subProjects }];
    const sp = group.subProjects.find((s) => s.key === key);
    if (sp) return [{ group, subProjects: [sp] }];
  }
  return [];
}

function parseKey(key) {
  if (!key) return null;
  if (key.startsWith("region:")) return { region: key.slice(7), folder: "" };
  if (key.startsWith("sub:")) {
    const rest = key.slice(4);
    const i = rest.indexOf("|");
    return i < 0 ? null : { region: rest.slice(0, i), folder: rest.slice(i + 1) };
  }
  return null;
}
