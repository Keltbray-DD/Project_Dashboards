// index.html — the project picker.

import { signOut } from "../auth/pkce.js";
import { bareProjectId } from "../core/config.js";
import { log } from "../core/log.js";
import { startSession, userProjects } from "../session.js";
import { createShell, stateCard } from "../views/shell.js";
import { h, icon, mount } from "../ui/dom.js";
import { formatNumber } from "../ui/format.js";

const shell = createShell({ sidebar: false, onSignOut: signOut });
shell.setProject({ name: "Your projects" });

mount(
  shell.content,
  stateCard({
    eyebrow: "Forma Docs Dashboard",
    title: "Loading your projects",
    steps: [
      { label: "Signing in with Autodesk", state: "active" },
      { label: "Finding your Forma projects", state: "pending" },
    ],
  })
);

try {
  const { user } = await startSession();
  shell.setUser(user);
  mount(
    shell.content,
    stateCard({
      eyebrow: "Forma Docs Dashboard",
      title: "Loading your projects",
      steps: [
        { label: "Signing in with Autodesk", state: "done" },
        { label: "Finding your Forma projects", state: "active" },
      ],
    })
  );
  const projects = await userProjects(user.id, { refresh: true });
  renderProjects(projects, user);
} catch (err) {
  log.error(err);
  mount(
    shell.content,
    stateCard({
      eyebrow: "Forma Docs Dashboard",
      title: "Couldn't load your projects",
      error: err.message,
      actions: h("button", { class: "btn primary", onclick: () => location.reload() }, icon("rotate"), "Try again"),
    })
  );
}

// One dashboard for everyone — what a user sees (editing, Compliance,
// client-facing folders only) follows from their role.
function dashboardUrl(project) {
  return `dashboard.html?id=${encodeURIComponent(bareProjectId(project.id))}`;
}

function renderProjects(projects, user) {
  const sorted = [...projects].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const grid = h("div", { class: "project-grid" });
  const count = h("div", { class: "sub" });
  const search = h("input", { class: "input", type: "search", placeholder: "Search by name or code", "aria-label": "Search projects" });

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = sorted.filter((p) => !q || `${p.name} ${p.code}`.toLowerCase().includes(q));
    count.textContent = q
      ? `${formatNumber(shown.length)} of ${formatNumber(sorted.length)} projects`
      : `${formatNumber(sorted.length)} projects you can access in Forma`;
    mount(
      grid,
      shown.length
        ? shown.map((p) => projectCard(p, user))
        : h("div", { class: "card card-pad muted" }, sorted.length ? "No projects match your search." : "You don't have access to any dashboard projects yet.")
    );
  };
  search.addEventListener("input", draw);

  mount(
    shell.content,
    h(
      "div",
      { class: "page-head" },
      h("div", {}, h("div", { class: "eyebrow" }, "Forma Docs Dashboard"), h("h1", {}, "Your projects"), count),
      h("div", { class: "actions" }, h("div", { class: "search" }, icon("magnifying-glass"), search))
    ),
    grid
  );
  draw();
  search.focus();
}

function projectCard(project, user) {
  const media = h("div", { class: "media" }, h("span", {}, project.code || initialsOf(project.name)));
  if (project.image) {
    const img = h("img", { src: project.image, alt: "", loading: "lazy" });
    // Broken image → keep the gradient placeholder.
    img.addEventListener("error", () => img.remove());
    media.append(img);
  }
  return h(
    "a",
    { class: "card project-card", href: dashboardUrl(project) },
    media,
    h(
      "div",
      { class: "body" },
      project.code && h("div", { class: "eyebrow" }, project.code),
      h("h2", {}, project.name),
      h("span", { class: "open" }, "Open dashboard ›")
    )
  );
}

const initialsOf = (name) =>
  String(name || "")
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
