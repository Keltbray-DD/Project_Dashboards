// Power Automate flows. These don't take an auth header today (see
// docs/v2-plan.md, open items), so no token is sent.

import { PA_FLOWS } from "../core/config.js";
import { request } from "./http.js";

// Projects the user can access: [{ id, name, code, image }, …]
export async function fetchProjects(userId, { fetch } = {}) {
  const res = await request(PA_FLOWS.projects, {
    method: "POST",
    json: { userID: userId, requestType: "docsDashboard" },
    fetch,
  });
  return Array.isArray(res) ? res : [];
}

// The SharePoint-cached file extract for a project, as returned by the
// flow — parse it with data/extract.js.
export function fetchExtract(projectName, { fetch } = {}) {
  return request(PA_FLOWS.extract, { method: "POST", json: { project_Name: projectName }, fetch });
}
