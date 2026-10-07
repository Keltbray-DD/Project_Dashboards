// dashboard.html — one project: sign in, load its data, route between
// views (dashboard.html?id=<project>#/midp | #/drawings | #/compliance).

import { signOut } from "../auth/pkce.js";
import { APP_NAME, projectFeatures, bareProjectId, SECTIONS } from "../core/config.js";
import { log } from "../core/log.js";
import { startRouter } from "../core/router.js";
import { store } from "../core/store.js";
import { loadProjectFiles, enrichProjectFiles } from "../data/project.js";
import { stackDocuments } from "../data/stacking.js";
import { buildScopes, hasScopeChoice, scopeFiles, scopeLabel, validScope } from "../data/subProjects.js";
import { local } from "../core/storage.js";
import { startSession, findUserProject } from "../session.js";
import { createShell, stateCard } from "../views/shell.js";
import { midpView, drawingRegisterView } from "../views/registers.js";
import { isClientVisible } from "../data/registers.js";
import { complianceView } from "../views/compliance.js";
import { evaluate } from "../compliance/engine.js";
import { h, icon, mount } from "../ui/dom.js";
import { formatNumber, formatWhen } from "../ui/format.js";
import { toast } from "../ui/toast.js";

// PA republishes the extract roughly every 30 minutes.
const EXTRACT_INTERVAL_MS = 30 * 60 * 1000;

const VIEWS = {
  midp: { label: "MIDP", icon: "layer-group", render: midpView },
  drawings: { label: "Drawing Register", icon: "compass-drafting", render: drawingRegisterView },
  compliance: { label: "Compliance", icon: "clipboard-check", render: complianceView },
};

const shell = createShell({ onRefresh: () => load(), onSignOut: signOut });
let ctx = null; // { aps, user, project }
let routerStarted = false;
let currentCleanup = null;
let loading = false;

const STEP_LABELS = ["Signing in with Autodesk", "Finding the project", "Loading project files"];
function showSteps(activeIndex, error) {
  mount(
    shell.content,
    stateCard({
      eyebrow: APP_NAME,
      title: error ? "Something went wrong" : "Opening project",
      steps: STEP_LABELS.map((label, i) => ({
        label,
        state: i < activeIndex ? "done" : i === activeIndex ? (error ? "error" : "active") : "pending",
      })),
      error,
      actions: error && [
        h("button", { class: "btn primary", onclick: () => location.reload() }, icon("rotate"), "Try again"),
        h("a", { class: "btn", href: "index.html" }, "All projects"),
      ],
    })
  );
}

async function start() {
  showSteps(0);
  const { aps, user } = await startSession();
  shell.setUser(user);

  // Read the project id only after sign-in: the OAuth round trip
  // restores the original ?id=… here.
  const projectId = new URLSearchParams(location.search).get("id");
  if (!projectId) {
    location.replace("index.html");
    return;
  }

  showSteps(1);
  const found = await findUserProject(user.id, projectId);
  if (!found) {
    showSteps(1, "This project isn't in your project list. You may not have access to it in Forma, or it isn't set up for the dashboard.");
    return;
  }
  const features = projectFeatures(projectId);
  const project = { id: bareProjectId(projectId), name: found.name, code: found.code || features.code || "", features };
  store.set({ project });
  shell.setProject({ ...project, readOnly: !user.isInternal });

  const routes = ["midp"];
  if (features.registers.includes("drawingRegister")) routes.push("drawings");
  if (user.isInternal) routes.push("compliance");
  shell.setNav(
    SECTIONS.map((section) => ({
      label: section.label,
      items: section.views.filter((route) => routes.includes(route)).map((route) => ({ route, ...VIEWS[route] })),
    }))
  );

  ctx = { aps, user, project, routes, retryMetadata: () => retryMetadata() };

  // Red count of documents with gaps on the Compliance nav item, kept
  // current as metadata loads and edits are made.
  if (routes.includes("compliance")) {
    store.subscribe((state, changed) => {
      if (!changed.includes("documents") && !changed.includes("editsVersion")) return;
      const loaded = state.documents.some((d) => d.current.attrs_loaded);
      shell.setNavCount("compliance", loaded ? evaluate(state.documents).totals.withGaps : null);
    });
  }
  await load();
}

// (Re)loads the project's data. Safe to call again from Refresh.
async function load() {
  if (!ctx || loading) return;
  loading = true;
  try {
    await loadData();
  } finally {
    loading = false;
  }
}

async function loadData() {
  const { aps, user, project, routes } = ctx;
  if (!routerStarted) showSteps(2);
  shell.setFreshness("loading", "Loading project files…");

  let extract, files, failedFolders;
  try {
    ({ extract, files, failedFolders } = await loadProjectFiles({
      aps,
      projectId: project.id,
      projectName: project.name,
      // ?source=extract uses the Power Automate file list instead of
      // reading Forma live (for comparing the two).
      source: new URLSearchParams(location.search).get("source") === "extract" ? "extract" : "auto",
      onProgress: (p) => shell.setFreshness("loading", `Reading Forma folders ${formatNumber(p.done)} / ${formatNumber(p.queued)}`),
    }));
    // External clients only see client-facing folders (PUBLISHED /
    // SHARED_TO_CLIENT). Filtered before stacking, so a WIP or SHARED copy
    // can never surface as a document's current revision or in its history.
    if (!user.isInternal) files = files.filter(isClientVisible);
  } catch (err) {
    log.error(err);
    if (!routerStarted) showSteps(2, `Couldn't load the project files: ${err.message}`);
    else toast("Couldn't refresh the data", err.message, { error: true });
    shell.setFreshness("error", "Data couldn't be loaded");
    return;
  }
  if (failedFolders.length) {
    const names = failedFolders.slice(0, 3).map((f) => f.folderPath || "(top folder)").join(", ");
    toast(
      `${failedFolders.length} folder${failedFolders.length === 1 ? "" : "s"} couldn't be read`,
      `Files in ${names}${failedFolders.length > 3 ? "…" : ""} may be missing. Refresh to try again.`,
      { error: true, timeout: 12000 }
    );
  }

  // Framework projects: restore the remembered region / sub-project (if
  // it still exists) and offer the picker when there's a choice. Built
  // after the client filter, so clients only see scopes they have files in.
  scopes = buildScopes(extract.regions, files);
  const scope = validScope(local.get(scopeStorageKey(), ""), scopes);
  shell.setScope(hasScopeChoice(scopes) ? { groups: scopes, value: scope, onChange: setScope } : null);

  // Render straight away with basic file data; attributes stream in.
  store.set({ extract, files, scope, scopeLabel: scopeLabel(scope, scopes), documents: stackScoped(files, scope) });
  if (!routerStarted) {
    routerStarted = true;
    startRouter({ routes, fallback: "midp", onChange: showView });
  }

  await enrichMetadata(extract, files);
}

// Fills custom attributes for the loaded files. Also run on its own by the
// "Retry" button when some files' metadata didn't load: the session cache
// already holds everything that did, so only the missing files are fetched.
async function enrichMetadata(extract, files) {
  const { aps, project } = ctx;
  // Attributes are written into the rows in place as each batch arrives.
  // Views are told at most once a second (metadataProgress) so cells fill
  // in progressively instead of all at once at the very end.
  let lastPublish = 0;
  const publish = (p, force = false) => {
    const now = Date.now();
    if (!force && now - lastPublish < 1000) return;
    lastPublish = now;
    store.set({ metadataProgress: { done: p.done, total: p.total, complete: false } });
  };
  publish({ done: 0, total: 0 }, true);
  shell.setFreshness("loading", "Loading metadata…");

  let stats = { failed: 0, unavailable: 0 };
  try {
    ({ stats } = await enrichProjectFiles({
      aps,
      projectId: project.id,
      extract,
      files,
      onProgress: (p) => {
        if (p.total) shell.setFreshness("loading", `Loading metadata ${formatNumber(p.done)} / ${formatNumber(p.total)}`);
        publish(p, p.done === 0);
      },
    }));
  } catch (err) {
    // Never leave the table half-loaded: publish whatever arrived.
    log.error(err);
    toast("Some metadata couldn't be loaded", err.message, { error: true, timeout: 12000 });
  }
  store.set({
    files: [...files],
    documents: stackScoped(files, store.get().scope),
    metadataProgress: { complete: true, failed: stats.failed, unavailable: stats.unavailable },
  });
  if (stats.failed || stats.unavailable) log.warn("Metadata load incomplete", stats);
  shell.setFreshness("ready", freshnessText(extract));
}

// Re-fetches only the files whose metadata is missing.
async function retryMetadata() {
  if (!ctx || loading) return;
  const { extract, files } = store.get();
  if (!extract) return;
  loading = true;
  try {
    for (const f of files) delete f.attrs_error;
    await enrichMetadata(extract, files);
  } finally {
    loading = false;
  }
}

// ---------- region / sub-project scope (framework projects) ----------

let scopes = [];
const scopeStorageKey = () => `v2.scope.${ctx.project.id}`;

// Documents for the current scope. Files are scoped before stacking, so a
// document's revision history only ever includes copies in scope.
function stackScoped(files, scope) {
  return stackDocuments(scopeFiles(files, scope));
}

function setScope(scope) {
  local.set(scopeStorageKey(), scope);
  store.set({ scope, scopeLabel: scopeLabel(scope, scopes), documents: stackScoped(store.get().files, scope) });
}

function freshnessText({ source, updated }) {
  if (!updated) return "Data loaded";
  if (source === "live") return `Live from Forma · ${formatWhen(updated)}`;
  const next = new Date(new Date(updated).getTime() + EXTRACT_INTERVAL_MS);
  const nextText = next > new Date() ? ` · next update ~${next.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "";
  return `Data as of ${formatWhen(updated)}${nextText}`;
}

function showView(route) {
  if (currentCleanup) currentCleanup();
  shell.setActive(route);
  const cleanup = VIEWS[route].render(shell.content, ctx);
  // Replay the page entrance animation.
  shell.content.classList.remove("view-enter");
  void shell.content.offsetWidth;
  shell.content.classList.add("view-enter");
  currentCleanup = typeof cleanup === "function" ? cleanup : null;
  shell.content.parentElement.scrollTop = 0;
}

start().catch((err) => {
  log.error(err);
  showSteps(0, err.message);
});
