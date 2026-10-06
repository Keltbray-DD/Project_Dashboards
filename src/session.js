// Shared page start-up: sign in, build the APS client, load the user.
// Used by both index.html (project picker) and dashboard.html.

import { completeSignIn, getAccessToken } from "./auth/pkce.js";
import { isInternalEmail } from "./auth/roles.js";
import { createAps } from "./api/aps.js";
import { fetchProjects } from "./api/powerAutomate.js";
import { bareProjectId } from "./core/config.js";
import { session } from "./core/storage.js";
import { store } from "./core/store.js";

const PROJECTS_KEY = "v2.projects";

// Resolves once the user is signed in (may redirect to Autodesk first).
// Returns { aps, user }.
export async function startSession() {
  await completeSignIn();
  const aps = createAps({ getToken: getAccessToken });
  const info = await aps.userInfo();
  const user = {
    id: info.sub,
    name: info.name || [info.given_name, info.family_name].filter(Boolean).join(" ") || info.email,
    email: info.email || "",
    picture: info.picture || "",
    isInternal: isInternalEmail(info.email),
  };
  store.set({ user });
  return { aps, user };
}

// The user's projects, cached for the browser session so the dashboard
// can resolve a project's name without another flow call. Pass
// refresh: true to bypass the cache.
export async function userProjects(userId, { refresh = false } = {}) {
  const cached = session.get(PROJECTS_KEY, null);
  if (!refresh && cached?.userId === userId && Array.isArray(cached.projects)) return cached.projects;
  const projects = await fetchProjects(userId);
  session.set(PROJECTS_KEY, { userId, projects });
  return projects;
}

// Finds one of the user's projects by id ("b."-prefixed or bare). Falls
// back to a fresh project list if the cached one doesn't have it.
export async function findUserProject(userId, projectId) {
  const match = (list) => list.find((p) => bareProjectId(p.id) === bareProjectId(projectId));
  return match(await userProjects(userId)) || match(await userProjects(userId, { refresh: true })) || null;
}
