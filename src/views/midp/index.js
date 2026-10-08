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

import { sectionOf } from "../../core/config.js";
import { store } from "../../core/store.js";
import { projectAttributeDefinitions } from "../../data/attributeDefs.js";
import { documentHistory } from "../../data/history.js";
import { makePackageTag } from "../../data/packageTags.js";
import { createPendingEdits } from "../../data/pendingEdits.js";
import { emptyFilterState, buildPredicate, activeFilterCount, BLANK } from "../../data/filters.js";
import { h, icon, mount } from "../../ui/dom.js";
import { formatNumber } from "../../ui/format.js";
import { toast } from "../../ui/toast.js";
import { buildColumns } from "./columns.js";
import { applySavedColumns, columnPickerButton } from "./columnPicker.js";
import { createEditing } from "./editing.js";
import { openHistoryDialog } from "./historyDialog.js";
import { openPackageTagDialog } from "./packageTagDialog.js";
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
  const exportStem = () => [project.code, store.get().scopeLabel, config.exportName].filter(Boolean).join(" ");
  let table = null;
  let tableReady = false; // Tabulator rejects data calls before tableBuilt
  let rowsWhenBuilt = null; // latest rows from setDocuments while building
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
  exportBtn.addEventListener("click", () => table?.download("xlsx", `${exportStem()}.xlsx`, { sheetName: config.title }, "active"));

  // ---------- package tagging ----------
  // Internal users only, and only usable when the project's Forma folders
  // define a Tags attribute; otherwise the button stays greyed out with
  // the reason on hover. aria-disabled rather than disabled, so the
  // tooltip still shows.
  let tagsDef = null;
  const tagBtn = user.isInternal && h("button", { class: "btn", type: "button" }, icon("tag"), "Tag for package");
  const setTagAvailable = (available, reason) => {
    tagBtn.setAttribute("aria-disabled", String(!available));
    tagBtn.title = available ? "Add one package tag to the selected files, to find them in Forma and add them to a File Package" : reason;
  };
  if (tagBtn) {
    setTagAvailable(false, "Checking whether this project has a Tags attribute…");
    projectAttributeDefinitions(aps, project.id)
      .then((defs) => {
        tagsDef = defs.tags || null;
        setTagAvailable(!!tagsDef, "This project has no Tags attribute in Forma. Ask a Forma admin to add a text attribute called \"Tags\" to the Project Files folder.");
      })
      .catch((err) => setTagAvailable(false, `Couldn't read this project's attribute definitions: ${err.message}`));
    tagBtn.addEventListener("click", () => {
      if (!tagsDef || !table) return;
      const rows = table.getSelectedData().filter((r) => r.id && !r._child);
      if (!rows.length) return;
      openPackageTagDialog({
        rows,
        defaultTag: makePackageTag(project.code),
        attrId: tagsDef.id,
        aps,
        projectId: project.id,
        onWritten: recordPackageTag,
        onShowTag: showPackageTag,
      });
    });
  }
  const tagEdits = tagBtn ? createPendingEdits(project.id) : null;

  // Keep the store, the table and the pending-edit overlay in step with
  // Tags values just written, as inline edits do.
  //   written: [{ row, value }]
  function recordPackageTag(written) {
    for (const { row, value } of written) {
      tagEdits.record(row.id, "tags", value);
      const doc = docsByKey.get(row._key);
      if (doc) doc.current.tags = value;
    }
    table?.updateData(written.map(({ row, value }) => ({ id: row.id, tags: value }))).then(() => {
      table.refreshFilter();
      panel.refresh();
    });
    table?.showColumn("tags");
    store.set((s) => ({ editsVersion: (s.editsVersion || 0) + 1 }));
  }

  // Filter the register to one tag (replacing any Tags filter).
  function showPackageTag(tag) {
    filterState.values.set("tags", new Set([tag]));
    table?.deselectRow();
    table?.showColumn("tags");
    applyFilters();
    panel.sync();
  }

  // ---------- chips + selection ----------
  const chips = h("div", { class: "chips" });
  const selCount = h("strong", {});
  const selectionBar = h(
    "div",
    { class: "selection-bar", hidden: true },
    selCount,
    tagBtn,
    h("button", { class: "btn", type: "button", onclick: copyNames }, icon("copy", "regular"), "Copy names"),
    h("button", {
      class: "btn",
      type: "button",
      onclick: () => table?.download("xlsx", `${exportStem()} selected.xlsx`, { sheetName: config.title }, "selected"),
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
  const loadText = h("span", {});
  const loadBar = h("span", {});
  const loadIcon = h("span", { class: "load-icon" });
  const retryBtn = h("button", { class: "btn", type: "button", hidden: true }, icon("rotate"), "Retry");
  retryBtn.addEventListener("click", () => ctx.retryMetadata?.());
  const loadProgress = h("div", { class: "progress" }, loadBar);
  const loadStrip = h("div", { class: "load-strip", hidden: true, role: "status" }, loadIcon, loadText, loadProgress, retryBtn);
  const body = h("div", { class: "midp-body" }, h("div", { class: "card table-card" }, loadStrip, selectionBar, tableHost), panel.element);

  mount(
    container,
    h(
      "div",
      { class: "view-fill" },
      h(
        "div",
        { class: "page-head" },
        h("div", {}, h("div", { class: "eyebrow" }, `${project.code ? project.code + " · " : ""}${sectionOf(config.id)?.label || ""}`), h("h1", {}, config.title), countText),
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

  // The panel slides over the table's edge (transform only — cheap), and
  // the table is resized exactly once: after the panel lands when opening,
  // before it slides away when closing. Animating the table's width
  // instead made Tabulator refit its columns every frame (janky).
  let dockTimer = null;
  function setPanel(open, { animate = true } = {}) {
    vs.panelOpen = open;
    filtersBtn.setAttribute("aria-expanded", String(open));
    clearTimeout(dockTimer);
    const dock = (docked) => {
      if (body.classList.contains("panel-docked") === docked) return;
      body.classList.toggle("panel-docked", docked);
      table?.redraw();
    };
    if (!open) dock(false);
    body.classList.toggle("panel-open", open);
    if (open) {
      if (!animate) dock(true);
      else {
        const onEnd = (e) => {
          if (e.target !== panel.element || e.propertyName !== "transform") return;
          panel.element.removeEventListener("transitionend", onEnd);
          if (vs.panelOpen) dock(true);
        };
        panel.element.addEventListener("transitionend", onEnd);
        // Fallback if the transition doesn't fire (e.g. reduced motion).
        dockTimer = setTimeout(() => vs.panelOpen && dock(true), 400);
      }
      setTimeout(() => panel.focus(), 50);
    }
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
    const sub = store.get().scopeLabel;
    countText.textContent = `${sub ? sub + " · " : ""}${resultText()} · ${config.description}`;
    const n = activeFilterCount(filterState);
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
    if (list.length > 1) {
      list.push(h("button", {
        class: "chip clear",
        type: "button",
        onclick: () => {
          clearPanelState(filterState);
          toolbarSearch.value = "";
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
          if (doc) openHistoryDialog(doc, { aps, projectId: project.id, extractUpdated: store.get().extract?.cacheEpoch });
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
      selectableRows: "highlight",
      selectableRowsCheck: (row) => !row.getData()._child && !row.getTreeParent(),
      downloadConfig: { dataTree: false },
      reactiveData: false,
      rowFormatter: (row) => {
        const d = row.getData();
        row.getElement().classList.toggle("is-child", !!d._child);
        row.getElement().classList.toggle("has-children", !!d._children && !d._child);
      },
    });

    table.on("tableBuilt", () => {
      tableReady = true;
      applySavedColumns(table, config.id);
      // Data that arrived while the table was building (e.g. attributes
      // straight from the session cache) goes in now.
      if (rowsWhenBuilt) {
        const pendingRows = rowsWhenBuilt;
        rowsWhenBuilt = null;
        table.replaceData(pendingRows).then(() => {
          applyFilters();
          panel.refresh();
        });
        return;
      }
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
        const history = await documentHistory(doc, { aps, projectId: project.id, extractUpdated: store.get().extract?.cacheEpoch });
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

  // While metadata streams in, update the rows whose attributes have
  // arrived in place (keeps expanded rows, selection and scroll). If the
  // register's membership changes (the Drawing Register depends on
  // attributes), fall back to a full refresh.
  let loadedKeys = new Set();
  function applyProgress(progress) {
    const problems = progress?.complete && (progress.failed || progress.unavailable);
    loadStrip.hidden = !progress || (progress.complete && !problems);
    loadStrip.classList.toggle("warn", !!problems);
    loadProgress.hidden = !!progress?.complete;
    retryBtn.hidden = !(progress?.complete && progress.failed);
    mount(loadIcon, icon(problems ? "triangle-exclamation" : "spinner"));
    if (problems) {
      const parts = [];
      if (progress.failed) parts.push(`Metadata couldn't be loaded for ${formatNumber(progress.failed)} file${progress.failed === 1 ? "" : "s"} (Forma didn't respond or returned errors) — they show "—".`);
      if (progress.unavailable) parts.push(`${formatNumber(progress.unavailable)} file${progress.unavailable === 1 ? " is" : "s are"} no longer available in Forma or not shared with you.`);
      loadText.textContent = parts.join(" ");
    }
    if (progress && !progress.complete) {
      const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
      loadText.textContent = progress.total
        ? `Loading file metadata — ${formatNumber(progress.done)} of ${formatNumber(progress.total)}. Cells fill in as it arrives.`
        : "Loading file metadata…";
      loadBar.style.width = `${pct}%`;
    }
    if (!table || !tableReady || !progress || progress.complete) return;
    const next = config.select(store.get().documents || []);
    const sameMembers = next.length === documents.length && next.every((d, i) => d.key === documents[i].key);
    if (!sameMembers) {
      setDocuments(store.get().documents);
      return;
    }
    const updates = [];
    for (const doc of documents) {
      if (doc.current.attrs_loaded && !loadedKeys.has(doc.key)) {
        loadedKeys.add(doc.key);
        updates.push({ ...doc.current, _key: doc.key, _hasNewerRevision: doc.hasNewerRevision });
      }
    }
    if (updates.length) {
      table
        .updateData(updates)
        .then(() => {
          table.refreshFilter();
          panel.refresh();
        })
        // A row went missing mid-update (e.g. the data was replaced): just
        // redraw from the store instead.
        .catch(() => setDocuments(store.get().documents));
    }
  }

  function setDocuments(next) {
    documents = config.select(next || []);
    loadedKeys = new Set(documents.filter((d) => d.current.attrs_loaded).map((d) => d.key));
    activeCount = null;
    docsByKey = new Map(documents.map((d) => [d.key, d]));
    const rows = toRows(documents);
    if (!table) {
      buildTable(rows);
      return;
    }
    // Tabulator rejects data calls until tableBuilt; it applies these then.
    if (!tableReady) {
      rowsWhenBuilt = rows;
      return;
    }
    // Keep the user's selection and expanded rows across a data refresh.
    const selected = new Set(table.getSelectedData().map((r) => r._key));
    const expanded = new Set(table.getRows().filter((r) => r.isTreeExpanded()).map((r) => r.getData()._key));
    table.replaceData(rows).then(() => {
      if (selected.size) table.selectRow(table.getRows().filter((r) => selected.has(r.getData()._key)));
      for (const r of table.getRows()) if (expanded.has(r.getData()._key)) r.treeExpand();
      applyFilters();
      panel.refresh();
    });
  }

  setPanel(vs.panelOpen, { animate: false });
  setDocuments(store.get().documents);
  renderSummary();

  const unsubscribe = store.subscribe((state, changed) => {
    if (changed.includes("documents") && state.documents !== documents) setDocuments(state.documents);
    if (changed.includes("metadataProgress")) applyProgress(state.metadataProgress);
  });
  applyProgress(store.get().metadataProgress);

  return () => {
    unsubscribe();
    table?.destroy();
    table = null;
  };
}
