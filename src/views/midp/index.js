// Register view: one row per stacked document (the current approved
// revision), expandable revision history, the Forma-style search panel,
// filter chips, row selection with Copy names / Export selected, column
// picker, export, and inline editing for internal users.
//
// Used for both the MIDP and the Drawing Register (see views/registers.js);
// each register supplies which documents it lists and a few labels.
//
// Filter state and panel visibility are kept per register at module level
// so they survive switching to another view and back.

import { store } from "../../core/store.js";
import { documentHistory } from "../../data/history.js";
import { emptyFilterState, buildPredicate, activeFilterCount, BLANK } from "../../data/filters.js";
import { h, icon, mount } from "../../ui/dom.js";
import { formatNumber } from "../../ui/format.js";
import { toast } from "../../ui/toast.js";
import { buildColumns } from "./columns.js";
import { applySavedColumns, columnPickerButton } from "./columnPicker.js";
import { createEditing } from "./editing.js";
import { openHistoryDialog } from "./historyDialog.js";
import { createSearchPanel, clearPanelState, labelOf } from "./searchPanel.js";

const viewStates = new Map();
function stateFor(id) {
  if (!viewStates.has(id)) viewStates.set(id, { filters: emptyFilterState(), panelOpen: false });
  return viewStates.get(id);
}

// Stack → table rows. Copies, so Tabulator's tree bookkeeping never
// touches the store's file rows.
function toRows(documents) {
  return documents.map((doc) => ({
    ...doc.current,
    _key: doc.key,
    _hasNewerRevision: doc.hasNewerRevision,
    _children: doc.hasHistory ? [{ id: `${doc.key}#loading`, name: "Loading revisions…", _loading: true, _child: true }] : undefined,
  }));
}

// Lets other views (Compliance) open a register pre-filtered:
//   setExternalFilter("midp", { label: "Fails: Spatial", predicate: (row) => … })
export function setExternalFilter(registerId, external) {
  stateFor(registerId).filters.external = external;
}
export const setMidpExternalFilter = (external) => setExternalFilter("midp", external);

// config:
//   id            "midp" | "drawings" — keys remembered state
//   title         page heading
//   section       eyebrow after the project code
//   select        (documents) => the documents this register lists
//   description   text after the count
//   exportName    file name stem for Excel exports
//   columns       buildColumns overrides ({ hidden, titles })
export function registerView(config) {
  return (container, ctx) => renderRegister(container, ctx, config);
}

function renderRegister(container, ctx, config) {
  const { aps, project, user } = ctx;
  const vs = stateFor(config.id);
  const filterState = vs.filters;
  const exportStem = `${project.code ? project.code + " " : ""}${config.exportName}`;
  let table = null;
  let documents = [];
  let docsByKey = new Map();
  // Rows passing all filters, as reported by Tabulator’s dataFiltered
  // event (getDataCount("active") lags behind inside that event).
  let activeCount = null;

  // ---------- header ----------
  const countText = h("div", { class: "sub" });
  const toolbarSearch = h("input", { class: "input", type: "search", placeholder: "Search documents", "aria-label": "Search documents" });
  toolbarSearch.value = filterState.search;
  toolbarSearch.addEventListener("input", () => {
    filterState.search = toolbarSearch.value;
    applyFilters();
    panel.sync();
  });
  const filtersBtn = h("button", { class: "btn", type: "button", "aria-expanded": "false" });
  filtersBtn.addEventListener("click", () => setPanel(!vs.panelOpen));

  const editing = user.isInternal
    ? createEditing({
        aps,
        projectId: project.id,
        onSaved: (row, field, value) => {
          // Keep the store's file row in step so Compliance recounts.
          const doc = docsByKey.get(row._key);
          if (doc) doc.current[field] = value;
          store.set((s) => ({ editsVersion: (s.editsVersion || 0) + 1 }));
        },
      })
    : null;
  const editBtn =
    editing &&
    h("button", { class: "btn", type: "button", title: "Edit Forma attributes in the table" }, icon("pen"), "Edit");
  editBtn?.addEventListener("click", async () => {
    editBtn.disabled = true;
    const on = await editing.toggle();
    editBtn.disabled = false;
    editBtn.classList.toggle("editing", on);
    mount(editBtn, icon(on ? "check" : "pen"), on ? "Done editing" : "Edit");
    table?.redraw(true);
    if (on) toast("Edit mode on", "Click a revision, status, title or description cell to change it in Forma.");
  });

  const exportBtn = h("button", { class: "btn primary", type: "button", title: "Export the filtered documents to Excel" }, icon("file-excel"), "Export");
  exportBtn.addEventListener("click", () => table?.download("xlsx", `${exportStem}.xlsx`, { sheetName: config.title }, "active"));

  // ---------- chips + selection ----------
  const chips = h("div", { class: "chips" });
  const selCount = h("strong", {});
  const selectionBar = h(
    "div",
    { class: "selection-bar", hidden: true },
    selCount,
    h("button", { class: "btn", type: "button", onclick: copyNames }, icon("copy", "regular"), "Copy names"),
    h("button", {
      class: "btn",
      type: "button",
      onclick: () => table?.download("xlsx", `${exportStem} selected.xlsx`, { sheetName: config.title }, "selected"),
    }, icon("download"), "Export selected"),
    h("button", { class: "link-btn", type: "button", onclick: () => table?.deselectRow() }, "Clear selection")
  );

  // ---------- panel ----------
  const panel = createSearchPanel({
    state: filterState,
    getRows: () => documents.map((d) => d.current),
    onChange: () => {
      toolbarSearch.value = filterState.search;
      applyFilters();
    },
    onClose: () => setPanel(false),
    resultText: () => resultText(),
  });

  const tableHost = h("div", { class: "table-host" });
  const body = h("div", { class: "midp-body" }, h("div", { class: "card table-card" }, selectionBar, tableHost), panel.element);

  mount(
    container,
    h(
      "div",
      { class: "view-fill" },
      h(
        "div",
        { class: "page-head" },
        h("div", {}, h("div", { class: "eyebrow" }, `${project.code ? project.code + " · " : ""}${config.section}`), h("h1", {}, config.title), countText),
        h(
          "div",
          { class: "actions" },
          h("div", { class: "search" }, icon("magnifying-glass"), toolbarSearch),
          filtersBtn,
          columnPickerButton(() => table, config.id),
          editBtn,
          exportBtn
        )
      ),
      chips,
      body
    )
  );

  function setPanel(open) {
    vs.panelOpen = open;
    body.classList.toggle("panel-open", open);
    filtersBtn.setAttribute("aria-expanded", String(open));
    if (open) panel.focus();
    table?.redraw();
  }

  // ---------- filtering ----------
  function shownCount() {
    return activeCount ?? documents.length;
  }
  function resultText() {
    const shown = shownCount();
    return shown === documents.length
      ? `${formatNumber(documents.length)} documents`
      : `${formatNumber(shown)} of ${formatNumber(documents.length)} documents`;
  }

  function applyFilters() {
    if (table) {
      const pred = buildPredicate(filterState);
      if (pred) table.setFilter((row) => pred(row));
      else table.clearFilter();
    }
    renderSummary();
  }

  function renderSummary() {
    countText.textContent = `${resultText()} · ${config.description}`;
    const n = activeFilterCount(filterState) + (table ? table.getHeaderFilters().length : 0);
    mount(filtersBtn, icon("filter"), "Filters", n > 0 && h("span", { class: "badge" }, String(n)));
    filtersBtn.classList.toggle("active", n > 0 || vs.panelOpen);
    renderChips();
  }

  function chip(label, value, onRemove) {
    return h("span", { class: "chip" }, label && h("span", { class: "muted" }, `${label}:`), h("b", {}, value),
      h("button", { type: "button", "aria-label": `Remove ${label || value} filter`, onclick: onRemove }, "×"));
  }

  function renderChips() {
    const list = [];
    const s = filterState;
    if (s.external) list.push(chip("", s.external.label, () => { s.external = null; applyFilters(); panel.sync(); }));
    if (s.search.trim()) list.push(chip("Search", s.search.trim(), () => { s.search = ""; toolbarSearch.value = ""; applyFilters(); panel.sync(); }));
    if (s.folderMode === "selected" && s.folders.size) {
      list.push(chip("Folders", s.folders.size === 1 ? [...s.folders][0].split(" / ").pop() : `${s.folders.size} selected`, () => {
        s.folders.clear();
        s.folderMode = "all";
        applyFilters();
        panel.sync();
      }));
    }
    for (const [field, values] of s.values) {
      if (!values.size) continue;
      const names = [...values].map((v) => (v === BLANK ? "(Blank)" : v));
      list.push(chip(labelOf(field), names.length <= 3 ? names.join(", ") : `${names.length} selected`, () => { values.clear(); applyFilters(); panel.sync(); }));
    }
    const headerFilters = table ? table.getHeaderFilters().length : 0;
    if (headerFilters) list.push(chip("", `Column filters (${headerFilters})`, () => table.clearHeaderFilter()));
    if (list.length > 1 || (list.length && headerFilters)) {
      list.push(h("button", {
        class: "chip clear",
        type: "button",
        onclick: () => {
          clearPanelState(filterState);
          toolbarSearch.value = "";
          table?.clearHeaderFilter();
          applyFilters();
          panel.sync();
        },
      }, "Clear all"));
    }
    chips.hidden = list.length === 0;
    mount(chips, list);
  }

  // ---------- selection ----------
  async function copyNames() {
    const names = table.getSelectedData().map((r) => r.name).filter(Boolean);
    if (!names.length) return;
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      toast("Copied", `${formatNumber(names.length)} file name${names.length === 1 ? "" : "s"} copied to the clipboard`);
    } catch {
      toast("Couldn't copy", "The browser blocked clipboard access.", { error: true });
    }
  }

  // ---------- table ----------
  function buildTable(rows) {
    table = new window.Tabulator(tableHost, {
      data: rows,
      index: "id",
      layout: "fitColumns",
      height: "100%",
      placeholder: "No documents match",
      columns: buildColumns({
        ...config.columns,
        extraFields: project.features?.extraFields || [],
        editor: editing ? (...a) => editing.editor(...a) : undefined,
        editable: editing ? (cell) => editing.editable(cell) : () => false,
        cellEdited: editing ? (cell) => editing.cellEdited(cell) : undefined,
        onInfo: (row) => {
          const doc = docsByKey.get(row._key);
          if (doc) openHistoryDialog(doc, { aps, projectId: project.id, extractUpdated: store.get().extract?.updated });
        },
      }),
      dataTree: true,
      dataTreeStartExpanded: false,
      dataTreeChildField: "_children",
      dataTreeChildIndent: 18,
      dataTreeBranchElement: false,
      dataTreeElementColumn: "name",
      // Filters apply to documents only; expanding always shows the full history.
      dataTreeFilter: false,
      // Selection only via the checkbox, so clicking a cell to edit doesn't select.
      selectable: "highlight",
      selectableCheck: (row) => !row.getData()._child && !row.getTreeParent(),
      downloadConfig: { dataTree: false },
      reactiveData: false,
      rowFormatter: (row) => {
        const d = row.getData();
        row.getElement().classList.toggle("is-child", !!d._child);
        row.getElement().classList.toggle("has-children", !!d._children && !d._child);
      },
    });

    table.on("tableBuilt", () => {
      applySavedColumns(table, config.id);
      applyFilters();
    });
    table.on("dataFiltered", (_filters, rows) => {
      activeCount = rows.length;
      renderSummary();
      panel.refresh();
    });
    table.on("rowSelectionChanged", (data) => {
      selectionBar.hidden = data.length === 0;
      selCount.textContent = `${formatNumber(data.length)} selected`;
    });
    table.on("dataTreeRowExpanded", async (row) => {
      const data = row.getData();
      if (data._historyLoaded || data._child) return;
      data._historyLoaded = true;
      const doc = docsByKey.get(data._key);
      try {
        const history = await documentHistory(doc, { aps, projectId: project.id, extractUpdated: store.get().extract?.updated });
        const children = history.filter((r) => r.id !== data.id).reverse().map((r) => ({ ...r, _child: true }));
        row.update({ _children: children.length ? children : null });
        if (children.length) row.treeExpand();
      } catch (err) {
        data._historyLoaded = false;
        row.treeCollapse();
        toast("Couldn't load revisions", err.message, { error: true });
      }
    });
  }

  function setDocuments(next) {
    documents = config.select(next || []);
    activeCount = null;
    docsByKey = new Map(documents.map((d) => [d.key, d]));
    const rows = toRows(documents);
    if (!table) {
      buildTable(rows);
      return;
    }
    // Keep the user's selection across a data refresh.
    const selected = new Set(table.getSelectedData().map((r) => r._key));
    table.replaceData(rows).then(() => {
      if (selected.size) table.selectRow(table.getRows().filter((r) => selected.has(r.getData()._key)));
      applyFilters();
      panel.refresh();
    });
  }

  setPanel(vs.panelOpen);
  setDocuments(store.get().documents);
  renderSummary();

  const unsubscribe = store.subscribe((state, changed) => {
    if (changed.includes("documents") && state.documents !== documents) setDocuments(state.documents);
  });

  return () => {
    unsubscribe();
    table?.destroy();
    table = null;
  };
}
