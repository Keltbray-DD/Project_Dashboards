// Builds file rows — one per file version — from each data source, so
// everything downstream (stacking, tables, compliance) sees one shape:
//
//   id                 version URN (…?version=N) — key for attributes/edits
//   item_id            lineage URN — key for version history
//   name, version, file_type, file_url
//   folder_path, folder_id
//   last_modified_user, last_modified_date, created_by_user, created_at
//   sub_project, sub_program          (framework projects)
//   attrs_loaded       false until enrichment has filled the attributes
//   …every field in ATTR_NAME_MAP     (title_line_1, revision, status, …)
//
// v1 had three slightly different hand-written row literals (and a
// created_by / created_by_user mismatch); these builders replace them.

import { ATTR_NAME_MAP, bareProjectId } from "../core/config.js";

const ATTR_FIELDS = [...new Set(Object.values(ATTR_NAME_MAP))];

export const isBlank = (v) => v === undefined || v === null || v === "";

// "Drawing-01.pdf" → "PDF"; "" when there's no extension.
export function fileTypeFromName(name) {
  const s = String(name || "");
  const i = s.lastIndexOf(".");
  return i < 0 ? "" : s.slice(i + 1).toUpperCase();
}

// Deep link in the format Forma's web UI uses: .eu host for EMEA-hosted
// projects (URNs contain "wipemea"), lineage URN as entityId so it opens
// the latest version, URI-encoded folderUrn.
export function fileUrl(projectId, folderId, itemId) {
  if (!folderId || !itemId) return "";
  const region = String(itemId).includes("wipemea") ? "eu" : "com";
  return (
    `https://acc.autodesk.${region}/docs/files/projects/${bareProjectId(projectId)}` +
    `?folderUrn=${encodeURIComponent(folderId)}&entityId=${encodeURIComponent(itemId)}&viewModel=detail&moduleId=folders`
  );
}

function versionFromUrn(urn) {
  const m = String(urn || "").match(/[?&]version=(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function baseRow(fields) {
  const row = {
    id: "",
    item_id: "",
    name: "",
    version: 1,
    file_type: "",
    file_url: "",
    folder_path: "",
    folder_id: "",
    last_modified_user: "",
    last_modified_date: "",
    created_by_user: "",
    created_at: "",
    sub_project: "",
    sub_program: "",
    attrs_loaded: false,
  };
  for (const f of ATTR_FIELDS) row[f] = "";
  Object.assign(row, fields);
  row.file_type = fileTypeFromName(row.name);
  return row;
}

// From a Power Automate extract entry (see data/extract.js).
export function fromExtractItem(item, projectId) {
  return baseRow({
    id: item.itemIdVersion || "",
    item_id: item.itemID || "",
    name: item.Name || "",
    version: versionFromUrn(item.itemIdVersion),
    file_url: fileUrl(projectId, item.folderID, item.itemID),
    folder_path: item.folderPath || "",
    folder_id: item.folderID || "",
    last_modified_user: item.lastModifiedUserName || "",
    last_modified_date: item.lastModifiedTime || "",
    created_by_user: item.createUserName || "",
    sub_project: item._subProject || "",
    sub_program: item._subProgram || "",
  });
}

// From an aps.walkFolder() entry (additional MIDP folders crawled live).
export function fromFolderItem({ item, tipVersion, folderPath, folderId }, projectId) {
  const ia = item?.attributes || {};
  const va = tipVersion?.attributes || {};
  return baseRow({
    id: tipVersion?.id || "",
    item_id: item?.id || "",
    name: ia.displayName || va.displayName || "",
    version: va.versionNumber || versionFromUrn(tipVersion?.id),
    file_url: fileUrl(projectId, folderId, item?.id),
    folder_path: folderPath || "",
    folder_id: folderId || "",
    last_modified_user: va.lastModifiedUserName || "",
    last_modified_date: va.lastModifiedTime || "",
    created_by_user: ia.createUserName || "",
    created_at: va.createTime || "",
  });
}

// From an aps.itemVersions() entry. Folder and lineage context come from
// the row that owns the lineage (versions don't carry them).
export function fromVersion(version, context, projectId) {
  const va = version?.attributes || {};
  return baseRow({
    id: version?.id || "",
    item_id: context?.item_id || "",
    name: va.displayName || "",
    version: va.versionNumber || versionFromUrn(version?.id),
    file_url: fileUrl(projectId, context?.folder_id, context?.item_id),
    folder_path: context?.folder_path || "",
    folder_id: context?.folder_id || "",
    last_modified_user: va.lastModifiedUserName || "",
    last_modified_date: va.lastModifiedTime || "",
    created_by_user: va.createUserName || "",
    // createTime is when this version was uploaded into its folder — the
    // reliable lifecycle signal (lastModifiedTime moves on metadata edits).
    created_at: va.createTime || "",
    sub_project: context?.sub_project || "",
    sub_program: context?.sub_program || "",
  });
}

// One versions:batch-get result → { "Title Line 1": "…", … }
export function attributesFromResult(result) {
  const attrs = {};
  for (const a of result?.customAttributes || []) attrs[a.name] = a.value;
  return attrs;
}

// Copies Forma attribute values onto a row (in place) via ATTR_NAME_MAP.
// Attributes absent from `attrs` leave the row's value untouched.
export function applyAttributes(row, attrs) {
  for (const [accName, field] of Object.entries(ATTR_NAME_MAP)) {
    if (attrs[accName] !== undefined) row[field] = attrs[accName] ?? "";
  }
  row.attrs_loaded = true;
  return row;
}
