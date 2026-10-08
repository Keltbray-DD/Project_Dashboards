// Inline editing of Forma custom attributes from the MIDP table.
//
// • Runs with the signed-in user's token, so Forma applies their own
//   permissions and the change is attributed to them.
// • Dropdown attributes get a <select> of Forma's allowed values; free
//   text gets an <input> (v1's smartCellEditor).
// • Successful edits are recorded as pending edits so they survive a
//   reload until the next Power Automate extract catches up.
// • New in v2: a rejected edit puts the old value back in the cell
//   (v1 left the rejected value showing).

import { projectAttributeDefinitions } from "../../data/attributeDefs.js";
import { createPendingEdits } from "../../data/pendingEdits.js";
import { h } from "../../ui/dom.js";
import { toast } from "../../ui/toast.js";
import { EDITABLE_FIELDS } from "./columns.js";

// options: { aps, projectId, onSaved(rowData, field, value) }
export function createEditing({ aps, projectId, onSaved }) {
  let enabled = false;
  let defs = null; // field → { id, name, options }
  const pending = createPendingEdits(projectId);
  const editableFields = new Set(EDITABLE_FIELDS);

  const defFor = (field) => (editableFields.has(field) ? defs?.[field] : undefined);

  return {
    get enabled() {
      return enabled;
    },

    // Turns edit mode on/off. The first time, loads the attribute
    // definitions; returns false (and stays off) if that fails.
    async toggle() {
      if (!enabled && !defs) {
        try {
          defs = await projectAttributeDefinitions(aps, projectId);
        } catch (err) {
          toast("Can't enable editing", `Couldn't read the project's attribute definitions: ${err.message}`, { error: true });
          return false;
        }
      }
      enabled = !enabled;
      return enabled;
    },

    editable(cell) {
      const row = cell.getRow().getData();
      return enabled && !row._child && !row._loading && !!defFor(cell.getColumn().getField());
    },

    editor(cell, onRendered, success, cancel) {
      const def = defFor(cell.getColumn().getField());
      const value = cell.getValue() ?? "";
      if (def?.options?.length) {
        const select = h("select", { class: "cell-editor" }, h("option", { value: "" }, ""), def.options.map((o) => h("option", { value: o }, o)));
        select.value = def.options.includes(value) ? value : "";
        onRendered(() => {
          select.focus();
          try {
            select.showPicker?.();
          } catch {
            /* some browsers refuse without a fresh gesture */
          }
        });
        select.addEventListener("change", () => success(select.value));
        select.addEventListener("blur", () => success(select.value));
        select.addEventListener("keydown", (e) => e.key === "Escape" && cancel());
        return select;
      }
      const input = h("input", { class: "cell-editor", type: "text", value });
      onRendered(() => {
        input.focus();
        input.select();
      });
      input.addEventListener("blur", () => success(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") success(input.value);
        if (e.key === "Escape") cancel();
      });
      return input;
    },

    async cellEdited(cell) {
      const field = cell.getColumn().getField();
      const label = cell.getColumn().getDefinition().title || field;
      const row = cell.getRow().getData();
      const value = cell.getValue() ?? "";
      if (value === (cell.getOldValue() ?? "")) return;
      const def = defFor(field);
      if (!def) return;

      try {
        const result = await aps.updateCustomAttributes(projectId, row.id, [{ id: def.id, value }]);
        if (!result.ok) throw new Error("Forma rejected the change");
        pending.record(row.id, field, value);
        onSaved(row, field, value);
        toast(`${label} updated`, `${row.name} → ${value === "" ? "(blank)" : value}`);
      } catch (err) {
        cell.restoreOldValue();
        const detail = err.status === 403 ? "You don't have permission to edit this file in Forma." : err.message;
        toast(`Couldn't update ${label}`, `${row.name} — ${detail}`, { error: true });
      }
    },
  };
}
