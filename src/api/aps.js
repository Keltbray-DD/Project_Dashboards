// Autodesk Platform Services endpoints used by the dashboard. Every call
// runs with the signed-in user's own token (see docs/v2-plan.md), so ACC
// enforces that user's folder permissions.
//
// createAps({ getToken, fetch }) — getToken is async and returns a valid
// access token (auth/pkce.js getAccessToken); fetch is injectable so the
// data layer can be unit-tested without a network.

import { APS_BASE, APS_USERINFO_URL, HUB_ID, bareProjectId } from "../core/config.js";
import { request } from "./http.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

    // Every file under several folder trees, read through one shared pool:
    // at most `concurrency` folder listings at a time with `gapMs` between
    // each worker's requests. Forma throttles folder listing hard — 8 at a
    // time with no gap hit 429s on a full project tree, while 3 at a time
    // with 150 ms read A66's MIDP folders (17 folders, 33 pages) in 6 s
    // with none.
    //   roots: [{ id, path, recurse = true }]
    // A folder that can't be read is skipped (its subfolders too) and
    // reported, so one bad folder — or one a client can't open — doesn't
    // lose the rest. Returns
    //   { files: [{ item, tipVersion, folderPath, folderId, root }],
    //     failed: [{ folderId, folderPath, status, message }] }
    // where `root` is the index in `roots` the file was found under.
    // onProgress({ done, queued, files }) after each folder.
    async walkFolders(projectId, roots, { concurrency = 3, gapMs = 150, onProgress } = {}) {
      const files = [];
      const failed = [];
      const queue = roots.map((r, root) => ({ id: r.id, path: r.path || "", recurse: r.recurse !== false, root }));
      let done = 0;
      let queued = queue.length;

      const readFolder = async ({ id, path, recurse, root }) => {
        let url = `${dm(projectId)}/folders/${encodeURIComponent(id)}/contents?includeHidden=false`;
        while (url) {
          const page = await call(url);
          const tipById = new Map((page?.included || []).map((v) => [v.id, v]));
          for (const entry of page?.data || []) {
            if (entry.type === "items") {
              const tip = tipById.get(entry.relationships?.tip?.data?.id);
              if (tip) files.push({ item: entry, tipVersion: tip, folderPath: path, folderId: id, root });
            } else if (entry.type === "folders" && recurse) {
              const name = entry.attributes?.displayName || entry.attributes?.name || "";
              queue.push({ id: entry.id, path: path ? `${path} / ${name}` : name, recurse: true, root });
              queued++;
            }
          }
          url = page?.links?.next?.href || null;
          if (gapMs) await sleep(gapMs);
        }
      };

      // Workers take folders off the shared queue until it's empty and no
      // worker can add more.
      let active = 0;
      await new Promise((resolve) => {
        const pump = () => {
          if (!queue.length && !active) return resolve();
          while (active < concurrency && queue.length) {
            const folder = queue.shift();
            active++;
            readFolder(folder)
              .catch((e) => failed.push({ folderId: folder.id, folderPath: folder.path, status: e?.status ?? 0, message: e?.message || String(e) }))
              .finally(() => {
                active--;
                done++;
                onProgress?.({ done, queued, files: files.length });
                pump();
              });
          }
        };
        pump();
      });
      return { files, failed };
    },

    // The MIDP containers (0C.WIP, 0E.SHARED, 0F.SHARED_TO_CLIENT,
    // 0G.PUBLISHED, …) under a project's start folder: folders whose name
    // matches `pattern`, looked for up to `maxDepth` levels down. Paths are
    // relative to the start folder, like the extract's folderPath.
    // Returns [{ id, path }].
    async findFolders(projectId, startFolderId, pattern, { maxDepth = 2 } = {}) {
      const found = [];
      let level = [{ id: startFolderId, path: "" }];
      for (let depth = 0; depth < maxDepth && level.length; depth++) {
        const next = [];
        for (const parent of level) {
          const { data } = await this.folderContents(projectId, parent.id);
          for (const entry of data) {
            if (entry.type !== "folders") continue;
            const name = entry.attributes?.displayName || entry.attributes?.name || "";
            const path = parent.path ? `${parent.path} / ${name}` : name;
            (pattern.test(name) ? found : next).push({ id: entry.id, path });
          }
        }
        level = next;
      }
      return found;
    },

    // Every version of one file lineage, newest first (as APS returns them).
    async itemVersions(projectId, itemId) {
      const { data } = await collectPages(`${dm(projectId)}/items/${encodeURIComponent(itemId)}/versions`);
      return data;
    },

    // Custom attribute values for up to 50 version URNs. Returns
    //   { results: [{ urn, customAttributes: [{ name, value }] }],
    //     errors:  [{ urn, … }] }   — files Forma couldn't return
    // options.retries overrides the default HTTP retry count.
    async batchGetVersions(projectId, urns, { retries } = {}) {
      const res = await call(`${docs(projectId)}/versions:batch-get`, { method: "POST", json: { urns }, ...(retries !== undefined ? { retries } : {}) });
      return { results: res?.results || [], errors: res?.errors || [] };
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
