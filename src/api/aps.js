// Autodesk Platform Services endpoints used by the dashboard. Every call
// runs with the signed-in user's own token (see docs/v2-plan.md), so ACC
// enforces that user's folder permissions.
//
// createAps({ getToken, fetch }) — getToken is async and returns a valid
// access token (auth/pkce.js getAccessToken); fetch is injectable so the
// data layer can be unit-tested without a network.

import { APS_BASE, APS_USERINFO_URL, HUB_ID, bareProjectId } from "../core/config.js";
import { request } from "./http.js";

export function createAps({ getToken, fetch: fetchImpl = globalThis.fetch, retryDelayMs } = {}) {
  async function call(url, options = {}) {
    return request(url, { ...options, token: await getToken(), fetch: fetchImpl, retryDelayMs });
  }

  // Data Management API responses are paged via links.next.href — v1
  // ignored it, which silently truncated big folders / version lists.
  async function collectPages(url) {
    const data = [];
    const included = [];
    let next = url;
    while (next) {
      const page = await call(next);
      data.push(...(page?.data || []));
      included.push(...(page?.included || []));
      next = page?.links?.next?.href || null;
    }
    return { data, included };
  }

  const dm = (projectId) => `${APS_BASE}/data/v1/projects/b.${bareProjectId(projectId)}`;
  const docs = (projectId) => `${APS_BASE}/bim360/docs/v1/projects/${bareProjectId(projectId)}`;

  return {
    // Signed-in user's profile: { sub, name, email, picture, … }
    userInfo() {
      return call(APS_USERINFO_URL);
    },

    async topFolders(projectId) {
      const res = await call(`${APS_BASE}/project/v1/hubs/${HUB_ID}/projects/b.${bareProjectId(projectId)}/topFolders`);
      return res?.data || [];
    },

    folder(projectId, folderId) {
      return call(`${dm(projectId)}/folders/${encodeURIComponent(folderId)}`);
    },

    // One folder level: { data: [items + folders], included: [tip versions] }
    folderContents(projectId, folderId) {
      return collectPages(`${dm(projectId)}/folders/${encodeURIComponent(folderId)}/contents?includeHidden=false`);
    },

    // Every file under a folder (recursively unless recurse === false),
    // sub-folders fetched in parallel. Returns
    //   [{ item, tipVersion, folderPath: "Root / Sub", folderId }]
    async walkFolder(projectId, rootFolderId, rootName, { recurse = true } = {}) {
      const found = [];
      const walk = async (folderId, pathParts) => {
        const { data, included } = await this.folderContents(projectId, folderId);
        const tipById = new Map(included.map((v) => [v.id, v]));
        const folderPath = pathParts.join(" / ");
        const children = [];
        for (const entry of data) {
          if (entry.type === "items") {
            const tip = tipById.get(entry.relationships?.tip?.data?.id);
            if (tip) found.push({ item: entry, tipVersion: tip, folderPath, folderId });
          } else if (entry.type === "folders" && recurse) {
            const name = entry.attributes?.displayName || entry.attributes?.name || "";
            children.push(walk(entry.id, [...pathParts, name]));
          }
        }
        await Promise.all(children);
      };
      await walk(rootFolderId, [rootName]);
      return found;
    },

    // Every version of one file lineage, newest first (as APS returns them).
    async itemVersions(projectId, itemId) {
      const { data } = await collectPages(`${dm(projectId)}/items/${encodeURIComponent(itemId)}/versions`);
      return data;
    },

    // Custom attribute values for up to 200 version URNs. Returns the
    // results array ([{ urn, customAttributes: [{ name, value }] }]).
    async batchGetVersions(projectId, urns) {
      const res = await call(`${docs(projectId)}/versions:batch-get`, { method: "POST", json: { urns } });
      return res?.results || [];
    },

    // Attribute definitions for a folder: [{ id, name, type, arrayValues }]
    async customAttributeDefinitions(projectId, folderId) {
      const res = await call(`${docs(projectId)}/folders/${encodeURIComponent(folderId)}/custom-attribute-definitions?limit=200`);
      return res?.results || [];
    },

    // Sets attribute values on one version. Forma reports per-attribute
    // outcomes in body.results even on HTTP 200, so both are checked.
    async updateCustomAttributes(projectId, versionUrn, values) {
      const body = await call(`${docs(projectId)}/versions/${encodeURIComponent(versionUrn)}/custom-attributes:batch-update`, {
        method: "POST",
        json: values,
      });
      const failed = (Array.isArray(body?.results) ? body.results : []).filter(
        (r) => r.status && (r.status < 200 || r.status >= 300)
      );
      return { ok: failed.length === 0, failed, body };
    },

    // Naming standard fields: [{ name, options: [...] }, …]
    async namingStandard(projectId, namingStandardId) {
      const res = await call(`${docs(projectId)}/naming-standards/${encodeURIComponent(namingStandardId)}`);
      return res?.definition?.fields || [];
    },
  };
}
