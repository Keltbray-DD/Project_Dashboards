// dashboard.html — one project: sign in, load its data, route between
// views (dashboard.html?id=<project>#/midp | #/drawings | #/compliance).

import { signOut } from "../auth/pkce.js";
import { APP_NAME, projectFeatures, bareProjectId, SECTIONS } from "../core/config.js";
import { log } from "../core/log.js";
import { startRouter } from "../core/router.js";
import { store } from "../core/store.js";
import { loadProjectFiles, enrichProjectFiles } from "../data/project.js";
import { stackDocuments } from "../data/stacking.js";
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

  ctx = { aps, user, project, routes };

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

  let extract, files;
  try {
    ({ extract, files } = await loadProjectFiles({ aps, projectId: project.id, projectName: project.name }));
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

  // Render straight away with basic file data; attributes stream in.
  store.set({ extract, files, documents: stackDocuments(files) });
  if (!routerStarted) {
    routerStarted = true;
    startRouter({ routes, fallback: "midp", onChange: showView });
  }

  const { documents, stats } = await enrichProjectFiles({
    aps,
    projectId: project.id,
    extract,
    files,
    onProgress: ({ done, total }) => {
      if (total) shell.setFreshness("loading", `Loading metadata ${formatNumber(done)} / ${formatNumber(total)}`);
    },
  });
  store.set({ files: [...files], documents });

  if (stats.failedChunks) {
    toast(
      "Some metadata couldn't be loaded",
      `${stats.failedChunks} batch(es) of file attributes failed. If this keeps happening, the dashboard app may need enabling in your ACC account.`,
      { error: true, timeout: 12000 }
    );
  }
  shell.setFreshness("ready", freshnessText(extract.updated));
}

function freshnessText(updated) {
  if (!updated) return "Data loaded";
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
