// "All revisions" dialog for one document: every revision across its
// WIP / SHARED / PUBLISHED copies, oldest → newest, with the current
// (approved) one and any newer in-progress revision highlighted.
// Ported from v1's openVersionsModal.

import { documentHistory } from "../../data/history.js";
import { lifecycleTag, revisionRank } from "../../data/stacking.js";
import { h, icon, mount } from "../../ui/dom.js";
import { formatDateTime } from "../../ui/format.js";


// One row per revision code — repeated uploads of the same revision keep
// the highest version — ordered by lifecycle rank.
export function summariseRevisions(rows) {
  const byRev = new Map();
  for (const r of rows) {
    const key = r.revision || `__none_${r.id}`;
    const existing = byRev.get(key);
    if (!existing || (r.version || 0) > (existing.version || 0)) byRev.set(key, r);
  }
  return [...byRev.values()].sort((a, b) => revisionRank(a.revision) - revisionRank(b.revision));
}

export async function openHistoryDialog(doc, { aps, projectId, extractUpdated }) {
  const body = h("div", { class: "body" }, h("div", { class: "muted" }, "Loading revisions…"));
  const dialog = h(
    "dialog",
    { class: "dialog wide" },
    h("header", {},
      h("div", {}, h("div", { class: "eyebrow" }, "All revisions"), h("h2", { class: "mono" }, doc.docNo)),
      h("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, "×")
    ),
    body
  );
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close(); // backdrop
  });
  document.body.append(dialog);
  dialog.showModal();

  let rows;
  try {
    rows = summariseRevisions(await documentHistory(doc, { aps, projectId, extractUpdated }));
  } catch (err) {
    mount(body, h("div", { class: "error-detail" }, `Couldn't load the revision history: ${err.message}`));
    return;
  }
  if (!rows.length) {
    mount(body, h("div", { class: "muted" }, "No revision history found."));
    return;
  }

  const current = doc.current;
  const currentRank = revisionRank(current.revision);
  const newest = rows.filter((r) => revisionRank(r.revision) > currentRank).at(-1);

  mount(
    body,
    h(
      "table",
      { class: "plain-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Revision"), h("th", {}, "Status"), h("th", {}, "Folder"), h("th", {}, "Uploaded"), h("th", {}, ""))),
      h(
        "tbody",
        {},
        rows.map((r) => {
          const isCurrent = r.revision === current.revision && r.folder_path === current.folder_path;
          const [cls, label] = lifecycleTag(r.folder_path) || ["other", "—"];
          return h(
            "tr",
            { class: isCurrent ? "is-current" : r === newest ? "is-newer" : "" },
            h("td", { class: "mono" }, r.revision || "—",
              isCurrent && h("span", { class: "tag ok" }, "Current"),
              r === newest && h("span", { class: "tag warn" }, "In progress")),
            h("td", {}, r.status || "—"),
            h("td", { title: r.folder_path }, h("span", { class: `lc ${cls}` }, label)),
            h("td", { class: "muted" }, formatDateTime(r.created_at || r.last_modified_date)),
            h("td", {}, r.file_url && /^https?:\/\//.test(r.file_url) &&
              h("a", { class: "cell-link", href: r.file_url, target: "_blank", rel: "noopener", title: "Open in Forma" }, icon("arrow-up-right-from-square")))
          );
        })
      )
    )
  );
}
