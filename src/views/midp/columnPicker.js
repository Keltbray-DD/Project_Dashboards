// "Columns" popover: show/hide table columns, remembered per browser.

import { local } from "../../core/storage.js";
import { h, icon } from "../../ui/dom.js";

const keyFor = (registerId = "midp") => `v2.${registerId}.columns`;
// Always shown — the table doesn't make sense without them.
const LOCKED = new Set(["_select", "_info", "name"]);

// Applies saved visibility to the table's columns.
export function applySavedColumns(table, registerId) {
  const prefs = local.get(keyFor(registerId), {}) || {};
  for (const col of table.getColumns()) {
    const f = col.getField();
    if (prefs[f] === false) col.hide();
    else if (prefs[f] === true) col.show();
  }
}

export function columnPickerButton(getTable, registerId) {
  const KEY = keyFor(registerId);
  const panel = h("div", { class: "popover column-picker", hidden: true });
  const button = h("button", { class: "btn", type: "button", "aria-haspopup": "true" }, icon("table-columns"), "Columns");

  const render = () => {
    const table = getTable();
    if (!table) return;
    panel.replaceChildren(
      h("div", { class: "eyebrow" }, "Show columns"),
      ...table
        .getColumns()
        .filter((c) => !LOCKED.has(c.getField()) && c.getDefinition().title !== undefined)
        .map((col) => {
          const field = col.getField();
          const def = col.getDefinition();
          const cb = h("input", { type: "checkbox" });
          cb.checked = col.isVisible();
          cb.addEventListener("change", () => {
            cb.checked ? col.show() : col.hide();
            const prefs = local.get(KEY, {}) || {};
            prefs[field] = cb.checked;
            local.set(KEY, prefs);
            table.redraw();
          });
          return h("label", {}, cb, def.title || def.titleDownload || field);
        })
    );
  };

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => (panel.hidden = true));

  return h("div", { class: "popover-wrap" }, button, panel);
}
