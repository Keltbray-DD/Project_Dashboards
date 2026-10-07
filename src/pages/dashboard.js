// dashboard.html — one project: sign in, load its data, route between
// views (dashboard.html?id=<project>#/midp | #/drawings | #/compliance).

import { signOut } from "../auth/pkce.js";
import { APP_NAME, projectFeatures, bareProjectId, SECTIONS } from "../core/config.js";
import { log } from "../core/log.js";
import { currentRoute, startRouter } from "../core/router.js";
import { store } from "../core/store.js";
import { fetchProjectExtract, loadProjectFiles, loadFrameworkCatalogue, loadScopeFiles, enrichProjectFiles } from "../data/project.js";
import { stackDocuments } from "../data/stacking.js";
import { FRAMEWORK_SCOPE, buildScopes, hasScopeChoice, scopeFiles, scopeLabel, validScope } from "../data/subProjects.js";
import { renderSubProjectChooser } from "../views/subProjectChooser.js";
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
  const { aps, project } = ctx;
  if (!routerStarted) showSteps(2);
  shell.setFreshness("loading", "Loading project details…");
  // ?source=extract uses the Power Automate file list instead of reading
  // Forma live (for comparing the two).
  const source = new URLSearchParams(location.search).get("source") === "extract" ? "extract" : "auto";

  let parsed;
  try {
    parsed = await fetchProjectExtract({ projectName: project.name });
  } catch (err) {
    return loadFailed(err);
  }

  // Live frameworks: list the sub-projects, then load only the chosen
  // scope — the one in the URL or remembered, else ask with the chooser.
  if (parsed.type === "framework" && source !== "extract") {
    shell.setFreshness("loading", "Listing sub-projects…");
    const catalogue = await loadFrameworkCatalogue({ aps, projectId: project.id, extract: parsed });
    if (catalogue.some((g) => g.subProjects.length)) {
      framework = { parsed, catalogue };
      const wanted = new URLSearchParams(location.search).get("scope") || local.get(scopeStorageKey(), "");
      const scope = validScope(wanted, catalogue);
      if (scope) return loadScope(scope);
      return openChooser();
    }
    log.warn("Couldn't list the framework's sub-projects; loading every file from the extract");
  }
  framework = null;

  let result;
  try {
    shell.setFreshness("loading", "Loading project files…");
    result = await loadProjectFiles({
      aps,
      projectId: project.id,
      projectName: project.name,
      parsed,
      source,
      onProgress: (p) => shell.setFreshness("loading", `Reading Forma folders ${formatNumber(p.done)} / ${formatNumber(p.queued)}`),
    });
  } catch (err) {
    return loadFailed(err);
  }
  await showFiles(result);
}

function loadFailed(err) {
  log.error(err);
  if (!routerStarted) showSteps(2, `Couldn't load the project files: ${err.message}`);
  else toast("Couldn't refresh the data", err.message, { error: true });
  shell.setFreshness("error", "Data couldn't be loaded");
}

// Publishes loaded files to the store, starts (or re-renders) the views
// and fills in attributes. For a live framework, `scope` is the scope
// that was loaded; otherwise the scope picker is built from the files.
async function showFiles({ extract, files, failedFolders }, scope) {
  const { user, routes } = ctx;
  // External clients only see client-facing folders (PUBLISHED /
  // SHARED_TO_CLIENT). Filtered before stacking, so a WIP or SHARED copy
  // can never surface as a document's current revision or in its history.
  if (!user.isInternal) files = files.filter(isClientVisible);
  if (failedFolders.length) {
    const names = failedFolders.slice(0, 3).map((f) => f.folderPath || "(top folder)").join(", ");
    toast(
      `${failedFolders.length} folder${failedFolders.length === 1 ? "" : "s"} couldn't be read`,
      `Files in ${names}${failedFolders.length > 3 ? "…" : ""} may be missing. Refresh to try again.`,
      { error: true, timeout: 12000 }
    );
  }

  if (framework) {
    scopes = framework.catalogue;
    shell.setScope({ label: scopeLabel(scope, scopes), onOpen: openChooser });
  } else {
    // Extract-mode frameworks: restore the remembered region /
    // sub-project (if it still exists) and offer the dropdown when there's
    // a choice. Built after the client filter, so clients only see scopes
    // they have files in.
    scopes = buildScopes(extract.regions, files);
    scope = validScope(local.get(scopeStorageKey(), ""), scopes);
    if (scope === FRAMEWORK_SCOPE) scope = "";
    shell.setScope(hasScopeChoice(scopes) ? { groups: scopes, value: scope, onChange: setScope } : null);
  }

  // Render straight away with basic file data; attributes stream in.
  store.set({ extract, files, scope, scopeLabel: scopeLabel(scope, scopes), documents: stackScoped(files, scope) });
  if (!routerStarted) {
    routerStarted = true;
    startRouter({ routes, fallback: "midp", onChange: showView });
  } else if (framework) {
    // The view was replaced by the chooser / loading card.
    const route = currentRoute("midp");
    showView(routes.includes(route) ? route : "midp");
  }

  await enrichMetadata(extract, files);
}

// ---------- live frameworks: chooser and scoped loading ----------

let framework = null; // { parsed, catalogue } while a framework is read live

function openChooser() {
  if (!framework) return;
  if (currentCleanup) currentCleanup();
  currentCleanup = null;
  shell.setActive(null);
  // Opening the chooser abandons a scope load in progress, so it can't
  // replace the chooser when it finishes.
  scopeLoad++;
  // `scope` is only set in the store once a scope has loaded.
  const { scope: current, scopeLabel: label } = store.get();
  renderSubProjectChooser(shell.content, {
    project: ctx.project,
    catalogue: framework.catalogue,
    current,
    currentLabel: label,
    onChoose: (key) => chooseScope(key),
    onCancel: current ? () => showView(ctx.routes.includes(currentRoute("midp")) ? currentRoute("midp") : "midp") : null,
  });
  if (!current) shell.setFreshness("ready", "Choose what to load");
}

// Picking a scope always wins: it supersedes a scope load (or Refresh)
// still in progress — see scopeLoad in loadScope.
function chooseScope(key) {
  return loadScope(key);
}

let scopeLoad = 0; // bumped per scope load; an older load stops when it sees a newer one

// Loads one framework scope live and shows it.
async function loadScope(scope) {
  const { aps, project } = ctx;
  const { parsed, catalogue } = framework;
  const thisLoad = ++scopeLoad;
  const superseded = () => thisLoad !== scopeLoad;
  const label = scopeLabel(scope, catalogue);
  local.set(scopeStorageKey(), scope);
  const url = new URL(location.href);
  url.searchParams.set("scope", scope);
  history.replaceState(null, "", url);
  shell.setScope({ label, onOpen: openChooser });

  // Loading card in place of the view until the files are in.
  if (currentCleanup) currentCleanup();
  currentCleanup = null;
  const card = (finding) =>
    mount(
      shell.content,
      stateCard({
        eyebrow: project.name,
        title: `Loading ${label}`,
        steps: [
          { label: "Finding its WIP / SHARED / PUBLISHED folders", state: finding ? "active" : "done" },
          { label: "Reading the files from Forma", state: finding ? "pending" : "active" },
        ],
      })
    );
  card(true);
  let phase = "finding";
  try {
    const result = await loadScopeFiles({
      aps,
      projectId: project.id,
      extract: parsed,
      catalogue,
      scope,
      onProgress: (p) => {
        if (superseded()) return;
        if (p.phase === "finding") {
          shell.setFreshness("loading", `Finding folders ${formatNumber(p.done)} / ${formatNumber(p.total)}`);
          return;
        }
        if (phase === "finding") {
          phase = "reading";
          card(false);
        }
        shell.setFreshness("loading", `Reading Forma folders ${formatNumber(p.done)} / ${formatNumber(p.queued)}`);
      },
    });
    if (superseded()) return;
    await showFiles(result, scope);
  } catch (err) {
    if (superseded()) return;
    log.error(err);
    shell.setFreshness("error", "Data couldn't be loaded");
    mount(
      shell.content,
      stateCard({
        eyebrow: project.name,
        title: `Couldn't load ${label}`,
        error: err.message,
        actions: [
          h("button", { class: "btn primary", onclick: () => chooseScope(scope) }, icon("rotate"), "Try again"),
          h("button", { class: "btn", onclick: openChooser }, "Choose another"),
        ],
      })
    );
  }
}

// Fills custom attributes for the loaded files. Also run on its own by the
// "Retry" button when some files' metadata didn't load: the session cache
// already holds everything that did, so only the missing files are fetched.
async function enrichMetadata(extract, files) {
  const { aps, project } = ctx;
  // Attributes are written into the rows in place as each batch arrives.
  // Views are told at most once a second (metadataProgress) so cells fill
  // in progressively instead of all at once at the very end.
  // A framework scope switch replaces the store's extract; this load's
  // results are then stale and mustn't overwrite the newer scope.
  const stale = () => store.get().extract !== extract;
  let lastPublish = 0;
  const publish = (p, force = false) => {
    if (stale()) return;
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
        if (stale()) return;
        if (p.total) shell.setFreshness("loading", `Loading metadata ${formatNumber(p.done)} / ${formatNumber(p.total)}`);
        publish(p, p.done === 0);
      },
    }));
  } catch (err) {
    if (stale()) return;
    // Never leave the table half-loaded: publish whatever arrived.
    log.error(err);
    toast("Some metadata couldn't be loaded", err.message, { error: true, timeout: 12000 });
  }
  if (stale()) return;
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
