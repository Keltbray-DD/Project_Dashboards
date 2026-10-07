// App shell: white top bar (logo, project, data freshness, user menu)
// with the gradient line, navy sidebar (views, feedback, compact toggle)
// and the content area views render into.

import { APP_NAME, APP_VERSION } from "../core/config.js";
import { compactPreference, setCompact } from "../core/prefs.js";
import { h, icon, mount } from "../ui/dom.js";
import { initials } from "../ui/format.js";
import { openFeedback } from "./feedback.js";

export const LOGO_URL =
  "https://framerusercontent.com/images/L6zTiT4fl5YfHzIJMMOpRZ3wk.png?scale-down-to=512&width=1285&height=289";

// options:
//   sidebar    — false for pages without views (project picker)
//   onRefresh  — shows a Refresh button when given
//   onSignOut
// Returns a handle for updating the shell as data arrives.
export function createShell({ sidebar = true, onRefresh, onSignOut } = {}) {
  setCompact(sidebar && compactPreference(), { remember: false });
  let user = null;

  // ---------- top bar ----------
  const projectName = h("strong", {});
  const projectCode = h("span", { class: "code", hidden: true });
  const viewOnly = h("span", { class: "view-only", hidden: true, title: "You can view but not edit this project's data" }, icon("eye"), "View only");
  const freshness = h("div", { class: "freshness", hidden: true }, h("span", { class: "dot" }), h("span", {}));
  const scopeSelect = h("select", { class: "scope-select", "aria-label": "Region or sub-project" });
  const scopeWrap = h("label", { class: "scope", hidden: true, title: "Show one region or sub-project of this framework" }, icon("sitemap"), scopeSelect);

  const avatar = h("button", { class: "avatar", type: "button", "aria-haspopup": "menu", "aria-label": "Account" }, "…");
  const menu = h("div", { class: "menu", role: "menu", hidden: true });
  avatar.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) menu.hidden = true;
  });

  const topbar = h(
    "header",
    { class: "topbar" },
    h("a", { class: "brand", href: "index.html", title: "All projects" },
      h("img", { src: LOGO_URL, alt: "Aureos" }),
      h("span", { class: "app-name" }, "Project Dashboard")
    ),
    h("div", { class: "crumbs" }, projectName, projectCode, viewOnly),
    scopeWrap,
    h("div", { class: "spacer" }),
    freshness,
    onRefresh && h("button", { class: "btn", type: "button", title: "Reload the latest data", onclick: onRefresh }, icon("rotate"), "Refresh"),
    h("div", { class: "user-menu" }, avatar, menu)
  );

  // ---------- sidebar ----------
  const nav = h("nav", { class: "nav", "aria-label": "Views" });
  const navLinks = new Map();
  const compactBtn = h("button", { class: "side-btn", type: "button" }, icon("angles-left"), h("span", {}, "Compact view"));
  const syncCompactBtn = () => {
    const on = document.body.classList.contains("compact");
    mount(compactBtn, icon(on ? "angles-right" : "angles-left"), h("span", {}, on ? "Expand sidebar" : "Compact view"));
    compactBtn.dataset.tip = on ? "Expand sidebar" : "Compact view";
    compactBtn.title = on ? "" : "Icon-only sidebar and denser rows, for smaller screens";
  };
  compactBtn.addEventListener("click", () => {
    setCompact(!document.body.classList.contains("compact"));
    syncCompactBtn();
    const sidebarEl = compactBtn.closest(".sidebar");
    sidebarEl.classList.remove("switching");
    void sidebarEl.offsetWidth; // restart the fade
    sidebarEl.classList.add("switching");
  });
  syncCompactBtn();

  const side = sidebar &&
    h(
      "aside",
      { class: "sidebar" },
      nav,
      h(
        "div",
        { class: "side-foot" },
        h("div", { class: "meta" }, `${APP_VERSION} · `, h("button", { type: "button", onclick: () => openFeedback(user) }, "Send feedback")),
        compactBtn
      )
    );

  const content = h("div", { class: "content", id: "content" });
  const app = h("div", { class: "app", style: sidebar ? {} : { gridTemplateColumns: "1fr" } }, topbar, side, h("main", { class: "main" }, content));
  document.body.replaceChildren(app);

  return {
    content,

    setUser(u) {
      user = u;
      mount(avatar, u.picture ? h("img", { src: u.picture, alt: "" }) : initials(u.name));
      avatar.title = u.name;
      mount(
        menu,
        h("div", { class: "who" }, h("strong", {}, u.name), h("span", {}, u.email)),
        h("button", { type: "button", onclick: () => openFeedback(u) }, icon("comment"), "Send feedback"),
        onSignOut && h("button", { type: "button", onclick: onSignOut }, icon("right-from-bracket"), "Sign out")
      );
    },

    setProject({ name, code, readOnly }) {
      projectName.textContent = name || "";
      projectCode.textContent = code || "";
      projectCode.hidden = !code;
      viewOnly.hidden = !readOnly;
      document.title = name ? `${name} · ${APP_NAME}` : APP_NAME;
    },

    // Framework region / sub-project picker. null hides it.
    //   { groups: buildScopes() result, value: scope key, onChange(key) }
    // Each region is a heading with "All <region>" then its sub-projects.
    setScope(scope) {
      scopeWrap.hidden = !scope;
      if (!scope) return;
      const subOption = (sp) => h("option", { value: sp.key }, sp.cancelled ? `${sp.label} (cancelled)` : sp.label);
      mount(
        scopeSelect,
        h("option", { value: "" }, "Whole framework"),
        scope.groups.map((g) =>
          h("optgroup", { label: g.region }, h("option", { value: g.key }, `All ${g.region}`), g.subProjects.map(subOption))
        )
      );
      scopeSelect.value = scope.value || "";
      scopeWrap.classList.toggle("active", !!scope.value);
      scopeSelect.onchange = () => {
        scopeWrap.classList.toggle("active", !!scopeSelect.value);
        scope.onChange(scopeSelect.value);
      };
    },

    // state: "loading" | "ready" | "error"
    setFreshness(state, text) {
      freshness.hidden = !text;
      freshness.classList.toggle("loading", state === "loading");
      topbar.classList.toggle("loading", state === "loading");
      freshness.lastChild.textContent = text || "";
    },

    // sections: [{ label, items: [{ route, label, icon, href? }] }]
    // Empty sections are skipped.
    setNav(sections) {
      navLinks.clear();
      mount(
        nav,
        h("a", { href: "index.html", dataset: { tip: "All projects" } }, icon("table-cells-large"), h("span", {}, "All projects")),
        sections
          .filter((s) => s.items.length)
          .map((s) => [
            h("div", { class: "nav-label", role: "presentation" }, s.label),
            s.items.map((item) => {
              const link = h("a", { href: item.href || `#/${item.route}`, dataset: { tip: item.label } }, icon(item.icon), h("span", {}, item.label));
              navLinks.set(item.route, link);
              return link;
            }),
          ])
      );
    },

    setActive(route) {
      for (const [r, link] of navLinks) {
        link.classList.toggle("on", r === route);
        if (r === route) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
    },

    // Red count pill on a nav item (e.g. compliance gaps); null clears it.
    setNavCount(route, count) {
      const link = navLinks.get(route);
      if (!link) return;
      link.querySelector(".count")?.remove();
      if (count) link.append(h("b", { class: "count" }, count > 999 ? "999+" : String(count)));
    },
  };
}

// Centred status card with a step list, used while loading and for errors.
//   steps: [{ label, state: "pending" | "active" | "done" | "error" }]
export function stateCard({ eyebrow, title, steps = [], error, actions }) {
  return h(
    "div",
    { class: "card state-card" },
    eyebrow && h("div", { class: "eyebrow" }, eyebrow),
    h("h2", {}, title),
    steps.length > 0 &&
      h(
        "ul",
        { class: "steps" },
        steps.map((s) =>
          h("li", { class: s.state }, h("span", { class: "ico" }, s.state === "done" ? "✓" : s.state === "error" ? "!" : ""), s.label)
        )
      ),
    error && h("div", { class: "error-detail" }, error),
    actions && h("div", { style: { marginTop: "18px", display: "flex", gap: "8px" } }, actions)
  );
}
