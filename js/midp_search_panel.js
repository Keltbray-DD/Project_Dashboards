// Forma-style search & filter panel for the MIDP tab.
//
// Owns every *programmatic* filter on tabulators.MIDP: the panel search
// box (mirrored with the toolbar search box), folder selection, the
// attribute dropdowns and chart-click filters. They're combined into a
// single Tabulator filter so they stack rather than replace each other.
// Column header filters are separate (Tabulator manages those) and stack
// on top as usual.
//
// Also owns the row-selection toolbar actions (Copy names / Export
// selected), since they share the same "find the right documents" flow.
//
// Public surface used by tabulator_setup.js:
//   midpSearchPanelDataChanged(rows)       — rows (deduped) were (re)loaded
//   midpSearchPanelSetSearch(query)        — toolbar search box typed into
//   midpSearchPanelSetChartFilter(pred)    — chart / gauge click
//   midpSearchPanelReset()                 — Reset Filters button
//   midpSearchPanelSelectionChanged(count) — row selection changed

(function () {
  // Dropdowns shown by default, in order. Labels follow Forma's wording.
  const MIDP_DEFAULT_FILTERS = [
    { field: "file_type", label: "File types" },
    { field: "status", label: "Status" },
    { field: "form", label: "Form" },
    { field: "originator", label: "Originator" },
    { field: "function", label: "Function" },
    { field: "spatial", label: "Spatial" },
  ];

  // Also offered by the (+) button, but only when the loaded data has at
  // least one value, so project-specific ones (Series) self-select.
  // Removed defaults are always offered back.
  const MIDP_EXTRA_FILTERS = [
    { field: "discipline", label: "Discipline" },
    { field: "revision", label: "Revision" },
    { field: "deliverable", label: "Deliverable" },
    { field: "project_pin", label: "Project PIN" },
    { field: "activity_code", label: "Activity Code" },
    { field: "classification", label: "Classification" },
    { field: "series", label: "Series" },
    { field: "tracking_status", label: "Tracking Status" },
    { field: "category", label: "Category" },
    { field: "created_by_user", label: "Created by" },
    { field: "last_modified_user", label: "Last Modified User" },
  ];

  const MIDP_BLANK = ""; // option value used for "(Blank)"
  const MIDP_FIELDS_STORAGE_KEY = "midpSearchPanelFields";

  const midpPanelState = {
    search: "",
    folderMode: "all", // "all" | "selected"
    folders: new Set(), // normalised folder paths
    subfolders: true,
    filters: new Map(), // field → Set of selected values
    fields: loadShownFields(), // dropdowns shown in the panel, in order
    chart: null, // predicate from a chart click
  };

  let midpPanelRows = [];
  let midpPanelWired = false;
  let midpOpenMenu = null; // the dropdown menu element currently open

  // ---------- helpers ----------

  const isBlankValue = (v) => v === undefined || v === null || v === "";

  // "A /B/ C" and "A / B / C" both → "A / B / C".
  function normaliseFolderPath(p) {
    return String(p || "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" / ");
  }

  function filterDef(field) {
    return MIDP_DEFAULT_FILTERS.concat(MIDP_EXTRA_FILTERS).find((f) => f.field === field);
  }

  // Which dropdowns the user has in the panel persists across sessions
  // (selected values don't — each visit starts unfiltered).
  function loadShownFields() {
    try {
      const saved = JSON.parse(localStorage.getItem(MIDP_FIELDS_STORAGE_KEY));
      if (Array.isArray(saved)) return saved.filter((f) => filterDef(f));
    } catch (e) {
      /* storage blocked or corrupt — fall back to defaults */
    }
    return MIDP_DEFAULT_FILTERS.map((f) => f.field);
  }

  function saveShownFields() {
    try {
      localStorage.setItem(MIDP_FIELDS_STORAGE_KEY, JSON.stringify(midpPanelState.fields));
    } catch (e) {
      /* best-effort */
    }
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    for (const c of children || []) node.appendChild(c);
    return node;
  }

  // Distinct values for a field across the loaded rows, with counts.
  // Sorted alphabetically with "(Blank)" last.
  function valueCounts(field) {
    const counts = new Map();
    for (const row of midpPanelRows) {
      const v = isBlankValue(row[field]) ? MIDP_BLANK : String(row[field]);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      if (a[0] === MIDP_BLANK) return 1;
      if (b[0] === MIDP_BLANK) return -1;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }

  // ---------- combined filter ----------

  function buildMidpPredicates() {
    const s = midpPanelState;
    const preds = [];

    const q = s.search.trim().toLowerCase();
    if (q) {
      // Same matching as the other tabs' search: substring of any field.
      preds.push((row) => {
        for (const k in row) {
          if (k.startsWith("_")) continue;
          const v = row[k];
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    if (s.folderMode === "selected" && s.folders.size) {
      const selected = [...s.folders];
      const subfolders = s.subfolders;
      preds.push((row) => {
        const p = normaliseFolderPath(row.folder_path);
        return selected.some((f) => p === f || (subfolders && p.startsWith(f + " / ")));
      });
    }

    for (const [field, values] of s.filters) {
      if (!values.size) continue;
      preds.push((row) => values.has(isBlankValue(row[field]) ? MIDP_BLANK : String(row[field])));
    }

    if (s.chart) preds.push(s.chart);
    return preds;
  }

  function applyMidpFilters() {
    const t = typeof tabulators !== "undefined" && tabulators.MIDP;
    if (t) {
      const preds = buildMidpPredicates();
      // clearFilter() without `true` leaves column header filters alone.
      if (preds.length) t.setFilter((row) => preds.every((p) => p(row)));
      else t.clearFilter();
      if (typeof tabulatorUpdateResetButton === "function") tabulatorUpdateResetButton("MIDP");
    }
    updatePanelSummary();
  }

  function activeFilterCount() {
    const s = midpPanelState;
    let n = 0;
    if (s.search.trim()) n++;
    if (s.folderMode === "selected" && s.folders.size) n++;
    for (const values of s.filters.values()) if (values.size) n++;
    if (s.chart) n++;
    return n;
  }

  function updatePanelSummary() {
    const n = activeFilterCount();
    const badge = document.getElementById("midpFilterBadge");
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    const toggle = document.getElementById("midpSearchPanelToggle");
    if (toggle) toggle.classList.toggle("active", n > 0);

    const chip = document.getElementById("midpChartFilterChip");
    if (chip) chip.hidden = !midpPanelState.chart;

    const folderCount = document.getElementById("midpFolderCount");
    if (folderCount) {
      folderCount.textContent = midpPanelState.folders.size ? `(${midpPanelState.folders.size})` : "";
    }

    const resultEl = document.getElementById("midpPanelResultCount");
    const t = typeof tabulators !== "undefined" && tabulators.MIDP;
    if (resultEl && t) {
      resultEl.textContent = `${t.getDataCount("active")} of ${midpPanelRows.length} documents`;
    }
  }

  // ---------- multi-select dropdown ----------

  function closeOpenMenu() {
    if (!midpOpenMenu) return;
    midpOpenMenu.hidden = true;
    midpOpenMenu.parentElement.classList.remove("open");
    midpOpenMenu = null;
  }

  function buttonLabel(values) {
    if (!values || !values.size) return "Select...";
    const names = [...values].map((v) => (v === MIDP_BLANK ? "(Blank)" : v));
    return names.length <= 2 ? names.join(", ") : `${names.length} selected`;
  }

  function renderFilterField(field) {
    const def = filterDef(field);
    const selected = midpPanelState.filters.get(field) || new Set();
    midpPanelState.filters.set(field, selected);

    const remove = el("button", { class: "sp-remove", type: "button", title: `Remove the ${def.label} filter`, "aria-label": `Remove ${def.label} filter` }, [
      el("i", { class: "fa-solid fa-xmark" }),
      el("span", { text: "Remove" }),
    ]);
    remove.onclick = (e) => {
      e.stopPropagation();
      midpPanelState.fields = midpPanelState.fields.filter((f) => f !== field);
      midpPanelState.filters.delete(field);
      saveShownFields();
      renderFilterFields();
      applyMidpFilters();
    };
    // Drag handle for reordering. Arrow keys move the filter too, so it
    // works without a mouse.
    const grip = el("button", { class: "sp-grip", type: "button", title: "Drag to reorder (or focus and use ↑ / ↓)", "aria-label": `Reorder ${def.label} filter` }, [
      el("i", { class: "fa-solid fa-grip-vertical" }),
    ]);
    grip.onkeydown = (e) => {
      const i = midpPanelState.fields.indexOf(field);
      if (e.key === "ArrowUp" && i > 0) moveField(field, i - 1);
      else if (e.key === "ArrowDown" && i < midpPanelState.fields.length - 1) moveField(field, i + 1);
      else return;
      e.preventDefault();
      document.querySelector(`#midpFilterFields .sp-field[data-field="${field}"] .sp-grip`).focus();
    };

    const labelRow = el("div", { class: "sp-field-label" }, [
      el("span", { class: "sp-field-title" }, [grip, el("span", { text: def.label })]),
      remove,
    ]);

    const btnText = el("span", { class: "sp-select-text", text: buttonLabel(selected) });
    const btn = el("button", { class: "sp-select-btn", type: "button" }, [
      btnText,
      el("i", { class: "fa-solid fa-chevron-down" }),
    ]);
    btn.classList.toggle("has-value", selected.size > 0);

    const optionSearch = el("input", { type: "text", class: "sp-mini-search", placeholder: `Find ${def.label.toLowerCase()}` });
    const optionList = el("div", { class: "sp-options" });
    const clearBtn = el("button", { class: "linkButton", type: "button", text: "Clear" });
    const menu = el("div", { class: "sp-select-menu" }, [
      optionSearch,
      optionList,
      el("div", { class: "sp-select-actions" }, [clearBtn]),
    ]);
    menu.hidden = true;

    const refreshButton = () => {
      btnText.textContent = buttonLabel(selected);
      btn.classList.toggle("has-value", selected.size > 0);
    };

    const renderOptions = () => {
      optionList.textContent = "";
      const needle = optionSearch.value.trim().toLowerCase();
      const counts = valueCounts(field);
      let shown = 0;
      for (const [value, count] of counts) {
        const text = value === MIDP_BLANK ? "(Blank)" : value;
        if (needle && !text.toLowerCase().includes(needle)) continue;
        const cb = el("input", { type: "checkbox" });
        cb.checked = selected.has(value);
        cb.onchange = () => {
          if (cb.checked) selected.add(value);
          else selected.delete(value);
          refreshButton();
          applyMidpFilters();
        };
        const opt = el("label", { class: "sp-option" + (value === MIDP_BLANK ? " blank" : "") }, [
          cb,
          el("span", { class: "sp-option-text", text }),
          el("span", { class: "sp-option-count", text: String(count) }),
        ]);
        optionList.appendChild(opt);
        shown++;
      }
      if (!shown) {
        optionList.appendChild(el("div", { class: "sp-empty", text: counts.length ? "No matches" : "No values in this project" }));
      }
    };

    btn.onclick = (e) => {
      e.stopPropagation();
      const wasOpen = midpOpenMenu === menu;
      closeOpenMenu();
      if (wasOpen) return;
      renderOptions();
      menu.hidden = false;
      wrap.classList.add("open");
      midpOpenMenu = menu;
      optionSearch.value = "";
      optionSearch.focus();
    };
    optionSearch.oninput = renderOptions;
    clearBtn.onclick = () => {
      selected.clear();
      refreshButton();
      renderOptions();
      applyMidpFilters();
    };
    menu.addEventListener("click", (e) => e.stopPropagation());

    const wrap = el("div", { class: "sp-select" }, [btn, menu]);
    const fieldEl = el("div", { class: "sp-field", "data-field": field }, [labelRow, wrap]);

    // Only the grip starts a drag — making the whole field draggable
    // would break text selection in the option search box.
    grip.addEventListener("pointerdown", () => { fieldEl.draggable = true; });
    grip.addEventListener("pointerup", () => { fieldEl.draggable = false; }); // click without a drag
    fieldEl.addEventListener("dragstart", (e) => {
      closeOpenMenu();
      midpDragField = field;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", field);
      fieldEl.classList.add("dragging");
    });
    fieldEl.addEventListener("dragend", () => {
      fieldEl.draggable = false;
      fieldEl.classList.remove("dragging");
      midpDragField = null;
      clearDropMarkers();
    });
    return fieldEl;
  }

  // ---------- reordering ----------

  let midpDragField = null;

  function moveField(field, toIndex) {
    const fields = midpPanelState.fields.filter((f) => f !== field);
    fields.splice(toIndex, 0, field);
    midpPanelState.fields = fields;
    saveShownFields();
    renderFilterFields();
  }

  function clearDropMarkers() {
    for (const n of document.querySelectorAll("#midpFilterFields .drop-before, #midpFilterFields .drop-after")) {
      n.classList.remove("drop-before", "drop-after");
    }
  }

  // Where a drop at clientY would land: the field it's over, and whether
  // it goes above or below that field's midpoint.
  function dropTarget(host, clientY) {
    const fieldEls = [...host.querySelectorAll(".sp-field")];
    for (const fe of fieldEls) {
      const r = fe.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return { el: fe, before: true };
    }
    const last = fieldEls[fieldEls.length - 1];
    return last ? { el: last, before: false } : null;
  }

  function wireFieldReordering(host) {
    host.addEventListener("dragover", (e) => {
      if (!midpDragField) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearDropMarkers();
      const t = dropTarget(host, e.clientY);
      if (t) t.el.classList.add(t.before ? "drop-before" : "drop-after");
    });
    host.addEventListener("dragleave", (e) => {
      if (!host.contains(e.relatedTarget)) clearDropMarkers();
    });
    host.addEventListener("drop", (e) => {
      if (!midpDragField) return;
      e.preventDefault();
      const t = dropTarget(host, e.clientY);
      clearDropMarkers();
      if (!t) return;
      const others = midpPanelState.fields.filter((f) => f !== midpDragField);
      let i = others.indexOf(t.el.dataset.field);
      if (i < 0) return; // dropped onto itself — order unchanged
      if (!t.before) i++;
      moveField(midpDragField, i);
    });
  }

  function renderFilterFields() {
    const host = document.getElementById("midpFilterFields");
    if (!host) return;
    closeOpenMenu();
    host.textContent = "";
    for (const field of midpPanelState.fields) host.appendChild(renderFilterField(field));
    if (!midpPanelState.fields.length) {
      host.appendChild(el("div", { class: "sp-empty", text: "No filters — use + to add one" }));
    }
  }

  // ---------- (+) add filter ----------

  function renderAddFilterMenu() {
    const menu = document.getElementById("midpAddFilterMenu");
    if (!menu) return;
    menu.textContent = "";
    const shown = new Set(midpPanelState.fields);
    const available = MIDP_DEFAULT_FILTERS.filter((f) => !shown.has(f.field)).concat(
      MIDP_EXTRA_FILTERS.filter((f) => !shown.has(f.field) && midpPanelRows.some((r) => !isBlankValue(r[f.field])))
    );
    if (!available.length) {
      menu.appendChild(el("div", { class: "sp-empty", text: "No other attributes have values" }));
      return;
    }
    for (const f of available) {
      const item = el("button", { class: "sp-add-filter-item", type: "button", text: f.label });
      item.onclick = () => {
        midpPanelState.fields.push(f.field);
        saveShownFields();
        menu.hidden = true;
        renderFilterFields();
      };
      menu.appendChild(item);
    }
  }

  // ---------- folder picker ----------

  // Every folder (and ancestor folder) that contains at least one document,
  // sorted so children follow their parent.
  function folderList() {
    const paths = new Set();
    for (const row of midpPanelRows) {
      const parts = normaliseFolderPath(row.folder_path).split(" / ").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join(" / "));
    }
    return [...paths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function renderFolderTree() {
    const host = document.getElementById("midpFolderTree");
    if (!host) return;
    host.textContent = "";
    const needle = (document.getElementById("midpFolderFilter").value || "").trim().toLowerCase();
    const paths = folderList().filter((p) => !needle || p.toLowerCase().includes(needle));
    if (!paths.length) {
      host.appendChild(el("div", { class: "sp-empty", text: "No folders" }));
      return;
    }
    for (const path of paths) {
      const parts = path.split(" / ");
      const cb = el("input", { type: "checkbox" });
      cb.checked = midpPanelState.folders.has(path);
      cb.onchange = () => {
        if (cb.checked) midpPanelState.folders.add(path);
        else midpPanelState.folders.delete(path);
        // Picking a folder implies "Selected folders"; un-picking the last
        // one drops back to "All folders".
        midpPanelState.folderMode = midpPanelState.folders.size ? "selected" : "all";
        syncFolderModeRadios();
        applyMidpFilters();
      };
      const row = el("label", { class: "sp-folder", title: path }, [
        cb,
        el("i", { class: "fa-regular fa-folder" }),
        el("span", { text: parts[parts.length - 1] }),
      ]);
      // When filtering by text, show full paths so matches are unambiguous.
      row.style.paddingLeft = needle ? "4px" : `${4 + (parts.length - 1) * 14}px`;
      if (needle) row.lastChild.textContent = path;
      host.appendChild(row);
    }
  }

  function syncFolderModeRadios() {
    for (const r of document.querySelectorAll('input[name="midpFolderMode"]')) {
      r.checked = r.value === midpPanelState.folderMode;
    }
  }

  // ---------- open / close ----------

  function setMidpPanelOpen(open) {
    const panel = document.getElementById("midpSearchPanel");
    if (!panel) return;
    panel.hidden = !open;
    const toggle = document.getElementById("midpSearchPanelToggle");
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("midpPanelSearch").focus();
    // fitColumns needs a redraw once the table's width changes.
    if (typeof tabulators !== "undefined" && tabulators.MIDP) tabulators.MIDP.redraw();
  }

  // ---------- selection actions ----------

  function midpSearchPanelSelectionChanged(count) {
    const bar = document.getElementById("midpSelectionActions");
    if (!bar) return;
    bar.hidden = count === 0;
    document.getElementById("midpSelectionCount").textContent = `${count} selected`;
  }

  async function copySelectedNames() {
    const t = tabulators.MIDP;
    if (!t) return;
    const names = t.getSelectedData().map((r) => r.name).filter(Boolean);
    if (!names.length) return;
    const text = names.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Clipboard API needs a secure context / permission — fall back to
      // the legacy execCommand path.
      const ta = el("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (typeof showPopup === "function") showPopup("Copied", `${names.length} file name${names.length === 1 ? "" : "s"} copied to clipboard`);
  }

  function exportSelected() {
    const t = tabulators.MIDP;
    if (!t || !t.getSelectedRows().length) return;
    t.download("xlsx", "MIDP_selected.xlsx", { sheetName: "MIDP" }, "selected");
  }

  // ---------- wiring ----------

  function wireMidpSearchPanel() {
    if (midpPanelWired) return;
    midpPanelWired = true;

    document.getElementById("midpSearchPanelToggle").onclick = () => {
      const panel = document.getElementById("midpSearchPanel");
      setMidpPanelOpen(panel.hidden);
    };
    document.getElementById("midpSearchPanelClose").onclick = () => setMidpPanelOpen(false);

    const panelSearch = document.getElementById("midpPanelSearch");
    panelSearch.oninput = () => {
      midpPanelState.search = panelSearch.value;
      const toolbarSearch = document.getElementById("searchInput");
      if (toolbarSearch) toolbarSearch.value = panelSearch.value;
      applyMidpFilters();
    };

    for (const r of document.querySelectorAll('input[name="midpFolderMode"]')) {
      r.onchange = () => {
        midpPanelState.folderMode = r.value;
        // Choosing "Selected folders" with nothing picked yet opens the picker.
        if (r.value === "selected" && !midpPanelState.folders.size) {
          document.getElementById("midpFolderPicker").hidden = false;
          renderFolderTree();
        }
        applyMidpFilters();
      };
    }
    document.getElementById("midpFolderSelectBtn").onclick = () => {
      const picker = document.getElementById("midpFolderPicker");
      picker.hidden = !picker.hidden;
      if (!picker.hidden) renderFolderTree();
    };
    document.getElementById("midpFolderFilter").oninput = renderFolderTree;
    document.getElementById("midpSubfolders").onchange = (e) => {
      midpPanelState.subfolders = e.target.checked;
      applyMidpFilters();
    };

    wireFieldReordering(document.getElementById("midpFilterFields"));

    const addBtn = document.getElementById("midpAddFilterBtn");
    const addMenu = document.getElementById("midpAddFilterMenu");
    addBtn.onclick = (e) => {
      e.stopPropagation();
      closeOpenMenu();
      addMenu.hidden = !addMenu.hidden;
      if (!addMenu.hidden) renderAddFilterMenu();
    };
    addMenu.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("midpChartFilterClear").onclick = () => {
      midpPanelState.chart = null;
      applyMidpFilters();
    };
    document.getElementById("midpPanelClearBtn").onclick = () => {
      clearMidpPanelState();
      applyMidpFilters();
    };

    // Clicking anywhere else closes open dropdowns.
    document.addEventListener("click", () => {
      closeOpenMenu();
      addMenu.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeOpenMenu();
        addMenu.hidden = true;
      }
    });

    document.getElementById("midpCopyNamesBtn").onclick = copySelectedNames;
    document.getElementById("midpExportSelectedBtn").onclick = exportSelected;
    document.getElementById("midpClearSelectionBtn").onclick = () => tabulators.MIDP && tabulators.MIDP.deselectRow();
  }

  // Resets the panel's own state and controls (doesn't touch the table).
  function clearMidpPanelState() {
    const s = midpPanelState;
    s.search = "";
    s.folderMode = "all";
    s.folders.clear();
    s.subfolders = true;
    for (const values of s.filters.values()) values.clear();
    s.chart = null;

    document.getElementById("midpPanelSearch").value = "";
    const toolbarSearch = document.getElementById("searchInput");
    if (toolbarSearch) toolbarSearch.value = "";
    document.getElementById("midpSubfolders").checked = true;
    syncFolderModeRadios();
    renderFilterFields();
    if (!document.getElementById("midpFolderPicker").hidden) renderFolderTree();
  }

  // ---------- public surface ----------

  function midpSearchPanelDataChanged(rows) {
    midpPanelRows = rows || [];
    wireMidpSearchPanel();
    // Drop selections for folders that no longer exist after a refresh.
    const known = new Set(folderList());
    for (const f of [...midpPanelState.folders]) if (!known.has(f)) midpPanelState.folders.delete(f);
    if (!midpPanelState.folders.size) midpPanelState.folderMode = "all";
    syncFolderModeRadios();

    // openTab clears the toolbar box on every visit; keep it in step with
    // the search that's still applied.
    const toolbarSearch = document.getElementById("searchInput");
    if (toolbarSearch) toolbarSearch.value = midpPanelState.search;
    document.getElementById("midpPanelSearch").value = midpPanelState.search;

    renderFilterFields();
    if (!document.getElementById("midpFolderPicker").hidden) renderFolderTree();
    applyMidpFilters();
    midpSearchPanelSelectionChanged(tabulators.MIDP ? tabulators.MIDP.getSelectedRows().length : 0);
  }

  function midpSearchPanelSetSearch(query) {
    midpPanelState.search = query || "";
    const panelSearch = document.getElementById("midpPanelSearch");
    if (panelSearch) panelSearch.value = midpPanelState.search;
    applyMidpFilters();
  }

  function midpSearchPanelSetChartFilter(predicate) {
    midpPanelState.chart = predicate || null;
    applyMidpFilters();
  }

  // Called by tabulatorClearFiltersAny("MIDP"), which clears the table's
  // filters itself straight afterwards.
  function midpSearchPanelReset() {
    clearMidpPanelState();
    updatePanelSummary();
  }

  // Only the public surface leaves the IIFE.
  Object.assign(window, {
    midpSearchPanelDataChanged,
    midpSearchPanelSetSearch,
    midpSearchPanelSetChartFilter,
    midpSearchPanelReset,
    midpSearchPanelSelectionChanged,
    midpSearchPanelUpdateSummary: updatePanelSummary,
  });
})();
