// Framework sub-project chooser: the first thing a framework project
// shows, before any files are loaded (see pages/dashboard.js). One card
// per region with its sub-projects as tiles; a region or the whole
// framework can be picked too (slower: every sub-project in it is read).

import { FRAMEWORK_SCOPE } from "../data/subProjects.js";
import { h, icon, mount } from "../ui/dom.js";
import { formatNumber } from "../ui/format.js";

const plural = (n, word) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

// options:
//   project     { name, code }
//   catalogue   loadFrameworkCatalogue() result
//   current     scope key in view ("" if none)
//   onChoose(key)
//   onCancel()  shown as "Back to <current>" when something is in view
export function renderSubProjectChooser(container, { project, catalogue, current, currentLabel, onChoose, onCancel }) {
  const total = catalogue.reduce((n, g) => n + g.subProjects.length, 0);
  const search = h("input", { class: "input", type: "search", placeholder: "Search by code or name", "aria-label": "Search sub-projects" });
  const regions = h("div", { class: "chooser-regions" });

  const tile = (sp) => {
    const [code, ...rest] = sp.label.split(" ");
    const hasCode = /^[A-Z]{2,}\d+/.test(code);
    return h(
      "button",
      {
        type: "button",
        class: ["chooser-tile", sp.key === current && "current", sp.cancelled && "cancelled"].filter(Boolean).join(" "),
        onclick: () => onChoose(sp.key),
        title: sp.folder,
      },
      hasCode && h("span", { class: "code" }, code),
      h("span", { class: "name" }, hasCode ? rest.join(" ") : sp.label),
      sp.cancelled && h("span", { class: "tag warn" }, "Cancelled")
    );
  };

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const cards = catalogue.map((g) => {
      const regionMatch = !q || g.region.toLowerCase().includes(q);
      const shown = regionMatch ? g.subProjects : g.subProjects.filter((sp) => `${sp.label} ${sp.folder}`.toLowerCase().includes(q));
      if (q && !shown.length) return null;
      return h(
        "section",
        { class: "card chooser-region" },
        h(
          "header",
          {},
          h("div", {}, h("h3", {}, g.region), h("span", { class: "muted" }, g.error ? "Couldn't list its sub-projects" : plural(g.subProjects.length, "sub-project"))),
          !g.error &&
            g.subProjects.length > 1 &&
            h(
              "button",
              { type: "button", class: `btn${g.key === current ? " primary" : ""}`, title: "Reads every sub-project in this region — slower", onclick: () => onChoose(g.key) },
              `All of ${g.region}`
            )
        ),
        g.error
          ? h("div", { class: "muted chooser-error" }, g.error)
          : shown.length
            ? h("div", { class: "chooser-grid" }, shown.map(tile))
            : h("div", { class: "muted chooser-error" }, "No sub-projects found.")
      );
    }).filter(Boolean);
    mount(regions, cards.length ? cards : h("div", { class: "card card-pad muted" }, "No sub-projects match your search."));
  };
  search.addEventListener("input", draw);

  mount(
    container,
    h(
      "div",
      { class: "page-head" },
      h(
        "div",
        {},
        h("div", { class: "eyebrow" }, [project.code, "Framework"].filter(Boolean).join(" · ")),
        h("h1", {}, "Choose a sub-project"),
        h("div", { class: "sub" }, `${plural(total, "sub-project")} in ${plural(catalogue.length, "region")} · only what you pick is loaded`)
      ),
      h(
        "div",
        { class: "actions" },
        h("div", { class: "search" }, icon("magnifying-glass"), search),
        onCancel && current && h("button", { type: "button", class: "btn", onclick: onCancel }, icon("arrow-left"), `Back to ${currentLabel}`),
        h(
          "button",
          { type: "button", class: `btn${current === FRAMEWORK_SCOPE ? " primary" : ""}`, title: "Reads every sub-project in every region — slowest", onclick: () => onChoose(FRAMEWORK_SCOPE) },
          icon("layer-group"),
          "Whole framework"
        )
      )
    ),
    regions
  );
  draw();
  search.focus();
}
