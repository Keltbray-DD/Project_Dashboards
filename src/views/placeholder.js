// Temporary view for routes not yet rebuilt (phase 2). Shows live
// numbers from the store so the data pipeline can be checked against
// real projects. Replaced by the real MIDP / Compliance / Drawing
// Register views in phases 3–5.

import { store } from "../core/store.js";
import { folderRank } from "../data/stacking.js";
import { h, mount } from "../ui/dom.js";
import { formatNumber } from "../ui/format.js";

const LIFECYCLE = { 3: "PUBLISHED", 2: "SHARED", 1: "WIP", 0: "Other" };

export function placeholderView({ title, eyebrow, phase }) {
  return (container) => {
    const body = h("div", {});
    mount(
      container,
      h(
        "div",
        { class: "page-head" },
        h("div", {}, h("div", { class: "eyebrow" }, eyebrow()), h("h1", {}, title), h("div", { class: "sub" }, `This view is being rebuilt for v2 (phase ${phase}). Live data summary below.`))
      ),
      body
    );

    const draw = (state) => {
      const docs = state.documents || [];
      const files = state.files || [];
      const loaded = files.filter((f) => f.attrs_loaded).length;
      const byLifecycle = {};
      for (const d of docs) {
        const k = LIFECYCLE[folderRank(d.current.folder_path)];
        byLifecycle[k] = (byLifecycle[k] || 0) + 1;
      }
      mount(
        body,
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" } },
          stat("Documents", formatNumber(docs.length), "one per stacked document"),
          stat("File versions", formatNumber(files.length), "rows in the extract + extra folders"),
          stat("Metadata loaded", files.length ? `${Math.round((loaded / files.length) * 100)}%` : "—", `${formatNumber(loaded)} of ${formatNumber(files.length)} files`),
          ...Object.entries(byLifecycle).map(([k, n]) => stat(k, formatNumber(n), "current documents"))
        )
      );
    };
    draw(store.get());
    return store.subscribe(draw);
  };
}

const stat = (label, value, note) =>
  h(
    "div",
    { class: "card card-pad" },
    h("h3", {}, label),
    h("div", { style: { fontSize: "28px", fontWeight: "700", margin: "8px 0 2px" } }, value),
    h("div", { class: "muted", style: { fontSize: "12px" } }, note)
  );
