// Forma-style search & filter panel (ported from v1.8). Edits a shared
// filter state (data/filters.js) and calls onChange after every change;
// the MIDP view turns that state into the table filter.
//
// Which dropdowns are shown, and their order, persist per browser under
// the same key v1.8 used, so users keep their layout.

import { local } from "../../core/storage.js";
import { BLANK, folderList, valueCounts } from "../../data/filters.js";
import { isBlank } from "../../data/fileRows.js";
import { h, icon, mount } from "../../ui/dom.js";
import { formatNumber } from "../../ui/format.js";

export const FILTER_DEFS = [
  { field: "file_type", label: "File types", isDefault: true },
  { field: "status", label: "Status", isDefault: true },
  { field: "form", label: "Form", isDefault: true },
  { field: "originator", label: "Originator", isDefault: true },
  { field: "function", label: "Function", isDefault: true },
  { field: "spatial", label: "Spatial", isDefault: true },
  { field: "discipline", label: "Discipline" },
  { field: "revision", label: "Revision" },
  { field: "deliverable", label: "Deliverable" },
  { field: "project_pin", label: "Project PIN" },
  { field: "activity_code", label: "Activity Code" },
  { field: "classification", label: "Classification" },
  { field: "series", label: "Series" },
  { field: "tracking_status", label: "Tracking Status" },
  { field: "category", label: "Category" },
  { field: "sub_project", label: "Sub-project" },
  { field: "created_by_user", label: "Created by" },
  { field: "last_modified_user", label: "Modified by" },
];
const defOf = (field) => FILTER_DEFS.find((d) => d.field === field);
export const labelOf = (field) => defOf(field)?.label || field;

const FIELDS_KEY = "midpSearchPanelFields";

function loadFields() {
  const saved = local.get(FIELDS_KEY, null);
  if (Array.isArray(saved)) return saved.filter(defOf);
  return FILTER_DEFS.filter((d) => d.isDefault).map((d) => d.field);
}

// options:
//   state      shared filter state (mutated here)
//   getRows    () => current document rows (for options and counts)
//   onChange   () => void after any state change
//   onClose    () => void
//   resultText () => "48 of 1,284 documents"
export function createSearchPanel({ state, getRows, onChange, onClose, resultText }) {
  let fields = loadFields();
  let openMenu = null; // { field } of the open dropdown
  let dragField = null;

  const saveFields = () => local.set(FIELDS_KEY, fields);
  const changed = () => {
    onChange();
    renderFooter();
  };

  // ---------- search ----------
  const searchInput = h("input", { type: "search", placeholder: "Search", "aria-label": "Search documents" });
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    changed();
  });

  // ---------- folders ----------
  const radioAll = h("input", { type: "radio", name: "sp-folder-mode", value: "all" });
  const radioSel = h("input", { type: "radio", name: "sp-folder-mode", value: "selected" });
  const folderCount = h("span", { class: "muted" });
  const subfolders = h("input", { type: "checkbox" });
  const folderFind = h("input", { class: "sp-mini-search", type: "search", placeholder: "Find folder" });
  const folderTree = h("div", { class: "sp-folder-tree" });
  const folderPicker = h("div", { class: "sp-folder-picker", hidden: true }, folderFind, folderTree);

  for (const r of [radioAll, radioSel]) {
    r.addEventListener("change", () => {
      state.folderMode = r.value;
      if (r.value === "selected" && !state.folders.size) {
        folderPicker.hidden = false;
        renderFolders();
      }
      changed();
    });
  }
  subfolders.addEventListener("change", () => {
    state.subfolders = subfolders.checked;
    changed();
  });
  folderFind.addEventListener("input", renderFolders);

  function renderFolders() {
    const needle = folderFind.value.trim().toLowerCase();
    const paths = folderList(getRows()).filter((p) => !needle || p.toLowerCase().includes(needle));
    mount(
      folderTree,
      paths.length
        ? paths.map((path) => {
            const parts = path.split(" / ");
            const cb = h("input", { type: "checkbox" });
            cb.checked = state.folders.has(path);
            cb.addEventListener("change", () => {
              if (cb.checked) state.folders.add(path);
              else state.folders.delete(path);
              // Picking a folder implies "Selected"; un-picking the last one
              // drops back to "All".
              state.folderMode = state.folders.size ? "selected" : "all";
              syncControls();
              changed();
            });
            return h(
              "label",
              { class: "sp-folder", title: path, style: { paddingLeft: needle ? "4px" : `${4 + (parts.length - 1) * 14}px` } },
              cb,
              icon("folder", "regular"),
              h("span", {}, needle ? path : parts[parts.length - 1])
            );
          })
        : h("div", { class: "sp-empty" }, "No folders")
    );
  }

  // ---------- attribute dropdowns ----------
  const fieldsHost = h("div", { class: "sp-fields" });
  const addMenu = h("div", { class: "sp-add-menu", hidden: true });
  const addBtn = h("button", { class: "sp-icon-btn", type: "button", title: "Add filter", "aria-label": "Add filter" }, icon("circle-plus"));
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu = null;
    renderFields();
    addMenu.hidden = !addMenu.hidden;
    if (!addMenu.hidden) renderAddMenu();
  });
  addMenu.addEventListener("click", (e) => e.stopPropagation());

  function renderAddMenu() {
    const rows = getRows();
    const shown = new Set(fields);
    const available = FILTER_DEFS.filter((d) => !shown.has(d.field) && (d.isDefault || rows.some((r) => !isBlank(r[d.field]))));
    mount(
      addMenu,
      available.length
        ? available.map((d) =>
            h("button", {
              class: "sp-add-item",
              type: "button",
              onclick: () => {
                fields.push(d.field);
                saveFields();
                addMenu.hidden = true;
                renderFields();
              },
            }, d.label)
          )
        : h("div", { class: "sp-empty" }, "No other attributes have values")
    );
  }

  function buttonLabel(values) {
    if (!values?.size) return "Select…";
    const names = [...values].map((v) => (v === BLANK ? "(Blank)" : v));
    return names.length <= 2 ? names.join(", ") : `${names.length} selected`;
  }

  function moveField(field, toIndex) {
    fields = fields.filter((f) => f !== field);
    fields.splice(toIndex, 0, field);
    saveFields();
    renderFields();
  }

  function fieldBlock(field) {
    if (!state.values.has(field)) state.values.set(field, new Set());
    const selected = state.values.get(field);
    const label = labelOf(field);
    const isOpen = openMenu === field;

    const grip = h("button", { class: "sp-grip", type: "button", title: "Drag to reorder (or focus and use ↑ / ↓)", "aria-label": `Reorder ${label} filter` }, icon("grip-vertical"));
    grip.addEventListener("keydown", (e) => {
      const i = fields.indexOf(field);
      if (e.key === "ArrowUp" && i > 0) moveField(field, i - 1);
      else if (e.key === "ArrowDown" && i < fields.length - 1) moveField(field, i + 1);
      else return;
      e.preventDefault();
      fieldsHost.querySelector(`[data-field="${field}"] .sp-grip`)?.focus();
    });

    const remove = h("button", { class: "sp-remove", type: "button", title: `Remove the ${label} filter` }, icon("xmark"), "Remove");
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      fields = fields.filter((f) => f !== field);
      state.values.delete(field);
      saveFields();
      renderFields();
      changed();
    });

    const toggle = h(
      "button",
      { class: `sp-select${selected.size ? " has-value" : ""}${isOpen ? " open" : ""}`, type: "button", "aria-expanded": String(isOpen) },
      h("span", {}, buttonLabel(selected)),
      icon("chevron-down")
    );
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      addMenu.hidden = true;
      openMenu = isOpen ? null : field;
      renderFields();
      if (openMenu) fieldsHost.querySelector(`[data-field="${field}"] .sp-mini-search`)?.focus();
    });

    const block = h(
      "div",
      { class: "sp-field", dataset: { field } },
      h("div", { class: "sp-field-label" }, h("span", { class: "sp-field-title" }, grip, label), remove),
      toggle,
      isOpen && optionMenu(field, selected)
    );

    // Only the grip starts a drag, so text in the option search stays selectable.
    grip.addEventListener("pointerdown", () => (block.draggable = true));
    grip.addEventListener("pointerup", () => (block.draggable = false));
    block.addEventListener("dragstart", (e) => {
      dragField = field;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", field);
      block.classList.add("dragging");
    });
    block.addEventListener("dragend", () => {
      block.draggable = false;
      dragField = null;
      block.classList.remove("dragging");
      clearDropMarkers();
    });
    return block;
  }

  function optionMenu(field, selected) {
    const find = h("input", { class: "sp-mini-search", type: "search", placeholder: `Find ${labelOf(field).toLowerCase()}` });
    const list = h("div", { class: "sp-options" });
    const draw = () => {
      const needle = find.value.trim().toLowerCase();
      const counts = valueCounts(getRows(), field);
      const shown = counts.filter(([v]) => !needle || (v === BLANK ? "(blank)" : v.toLowerCase()).includes(needle));
      mount(
        list,
        shown.length
          ? shown.map(([value, count]) => {
              const cb = h("input", { type: "checkbox" });
              cb.checked = selected.has(value);
              cb.addEventListener("change", () => {
                if (cb.checked) selected.add(value);
                else selected.delete(value);
                const btn = fieldsHost.querySelector(`[data-field="${field}"] .sp-select`);
                btn.firstChild.textContent = buttonLabel(selected);
                btn.classList.toggle("has-value", selected.size > 0);
                changed();
              });
              return h(
                "label",
                { class: `sp-option${value === BLANK ? " blank" : ""}` },
                cb,
                h("span", { class: "sp-option-text" }, value === BLANK ? "(Blank)" : value),
                h("span", { class: "sp-option-count" }, formatNumber(count))
              );
            })
          : h("div", { class: "sp-empty" }, counts.length ? "No matches" : "No values in this project")
      );
    };
    find.addEventListener("input", draw);
    draw();
    const clear = h("button", { class: "link-btn", type: "button" }, "Clear");
    clear.addEventListener("click", () => {
      selected.clear();
      renderFields();
      changed();
    });
    const menu = h("div", { class: "sp-menu" }, find, list, h("div", { class: "sp-menu-foot" }, clear));
    menu.addEventListener("click", (e) => e.stopPropagation());
    return menu;
  }

  function renderFields() {
    mount(fieldsHost, fields.length ? fields.map(fieldBlock) : h("div", { class: "sp-empty" }, "No filters — use + to add one"));
  }

  // Drag-to-reorder: a green line shows where the filter will land.
  const clearDropMarkers = () => fieldsHost.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
  const dropTarget = (y) => {
    const blocks = [...fieldsHost.querySelectorAll(".sp-field")];
    for (const b of blocks) {
      const r = b.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { el: b, before: true };
    }
    return blocks.length ? { el: blocks[blocks.length - 1], before: false } : null;
  };
  fieldsHost.addEventListener("dragover", (e) => {
    if (!dragField) return;
    e.preventDefault();
    clearDropMarkers();
    const t = dropTarget(e.clientY);
    if (t) t.el.classList.add(t.before ? "drop-before" : "drop-after");
  });
  fieldsHost.addEventListener("dragleave", (e) => {
    if (!fieldsHost.contains(e.relatedTarget)) clearDropMarkers();
  });
  fieldsHost.addEventListener("drop", (e) => {
    if (!dragField) return;
    e.preventDefault();
    const t = dropTarget(e.clientY);
    clearDropMarkers();
    if (!t) return;
    const others = fields.filter((f) => f !== dragField);
    let i = others.indexOf(t.el.dataset.field);
    if (i < 0) return;
    if (!t.before) i++;
    moveField(dragField, i);
  });

  // ---------- footer ----------
  const footerCount = h("span", {});
  function renderFooter() {
    footerCount.textContent = resultText();
  }

  const element = h(
    "aside",
    { class: "card search-panel", "aria-label": "Search and filters" },
    h("header", {}, h("h3", {}, "Search"), h("button", { class: "sp-icon-btn", type: "button", title: "Close", "aria-label": "Close", onclick: onClose }, icon("xmark"))),
    h(
      "div",
      { class: "sp-body" },
      h("div", { class: "sp-search" }, icon("magnifying-glass"), searchInput),
      h("h4", {}, "Folders"),
      h(
        "div",
        { class: "sp-radios" },
        h("label", {}, radioAll, "All"),
        h("label", {}, radioSel, "Selected ", folderCount),
        h("button", {
          class: "link-btn",
          type: "button",
          onclick: () => {
            folderPicker.hidden = !folderPicker.hidden;
            if (!folderPicker.hidden) renderFolders();
          },
        }, "Select…")
      ),
      h("label", { class: "sp-check" }, subfolders, "Include subfolders"),
      folderPicker,
      h("h4", { class: "sp-filters-head" }, "Attributes", h("span", { class: "sp-add" }, addBtn, addMenu)),
      fieldsHost
    ),
    h("footer", {}, footerCount, h("button", {
      class: "link-btn",
      type: "button",
      onclick: () => {
        clearPanelState(state);
        syncControls();
        changed();
      },
    }, "Clear filters"))
  );

  // Clicking elsewhere closes any open dropdown.
  document.addEventListener("click", () => {
    addMenu.hidden = true;
    if (openMenu) {
      openMenu = null;
      renderFields();
    }
  });

  // Pulls control values from the state (after an external change).
  function syncControls() {
    if (searchInput.value !== state.search) searchInput.value = state.search;
    radioAll.checked = state.folderMode !== "selected";
    radioSel.checked = state.folderMode === "selected";
    subfolders.checked = state.subfolders;
    folderCount.textContent = state.folders.size ? `(${state.folders.size})` : "";
    if (!folderPicker.hidden) renderFolders();
    renderFields();
    renderFooter();
  }

  syncControls();
  return {
    element,
    // State changed outside the panel (toolbar search, chips, reset).
    sync: syncControls,
    // Rows changed (refresh / enrichment) — option counts and folders.
    refresh: syncControls,
    focus: () => searchInput.focus(),
  };
}

// Clears every filter (search, folders, values, Compliance/chart filter)
// but keeps which dropdowns are shown — same as v1.8's "Clear filters".
export function clearPanelState(state) {
  state.search = "";
  state.folderMode = "all";
  state.folders.clear();
  state.subfolders = true;
  for (const v of state.values.values()) v.clear();
  state.external = null;
}
