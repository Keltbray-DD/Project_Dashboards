async function generateMIDPTable() {
  console.log("MIDP Table");
  mainFileArray = files
  resetValues();
  await generateFileTable(files);
  await runChecks('MIDP');
  //populateFolderDropdown(folderPaths)
  generateCharts();
  colourParentMissing();
  makeCellsEditable().then(() => {
    // Runs after getData completes
    columnEditing();
    addSortableColumns();
    createFilterOptions();
  });
  console.log("MIDP files list", files);
}

async function generateTransmittalTable() {
  console.log("Transmittal Table");
  mainFileArray = files
  resetValues();
  await generateTransmittalFileTable(files);
  await runChecks('TR');
  populateFolderDropdown(folderPaths);
  generateCharts();
  colourParentMissing();
  makeCellsEditable().then(() => {
    // Runs after getData completes
    columnEditing();
    addSortableColumns();
  });
}

async function generateDrawingRegisterTable() {
  console.log("Drawing Register Table");
  resetValues();
  console.log(files)
  const filteredData = files.filter(item => item.revision && item.revision.includes('C') && item.form.includes('DR'));
  console.log(filteredData)
  mainFileArray = filteredData
  await generateDrawingRegisterFileTable(filteredData);
  await generateDrawingRegisterHeaders(drawingRegisterHeaders);
  await runChecks('DR');
  populateFolderDropdown(folderPaths);
  generateCharts();
  colourParentMissing();
  makeCellsEditable().then(() => {
    // Runs after getData completes
    columnEditing();
    addSortableColumns();
  });
}

async function generateSHEAFDrawingRegisterTable() {
  console.log("SHEAF Drawing Register Table");
  resetValues();
  console.log(files)
  const filteredData = files.filter(item => item.form.includes('DR'));
  console.log(filteredData)
  mainFileArray = filteredData
  await generateDrawingRegisterFileTable(filteredData);
  await generateDrawingRegisterHeaders(drawingRegisterHeaders);
  await runChecks('DR');
  populateFolderDropdown(folderPaths);
  generateCharts();
  colourParentMissing();
  makeCellsEditable().then(() => {
    // Runs after getData completes
    columnEditing();
    addSortableColumns();
  });
}

async function generateHeadersParent() {
  switch (projectID) {
    case "76c59b97-feaf-413c-9bd0-43cf8aaa3133":
      await generateMIDPHeaders(a66Headers);
      break;

    default:
      await generateMIDPHeaders(defaultHeaders);
      break;
  }
}
// Function to reset all headers in all tables
function resetHeaders() {
  // Loop through all sortable tables
  document.querySelectorAll(".sortable").forEach((table) => {
    // Loop through all table headers
    table.querySelectorAll("th").forEach((header) => {
      // Reset the sorting order to its default (e.g., 'desc')
      header.setAttribute("data-order", "desc");

      // Remove any sorting classes (asc, desc)
      header.classList.remove("asc", "desc");
    });
  });
}

async function generateFileTable(data) {
  const groupedData = await groupItemData(data);
  console.log(groupedData)
  Object.values(groupedData).forEach(async (group) => {
    let mainItem = group[0];
    chartChecks(mainItem);
    checkFolder(mainItem.folder_path);
    // await addToFilesArray(mainItem);
    await createMainTableRow(mainItem, group);
  });
  //console.log(files);
}

async function generateTransmittalFileTable(data) {
  const groupedData = await groupItemData(data);

  Object.values(groupedData).forEach(async (group) => {
    let mainItem = group[0];
    chartChecks(mainItem);
    checkFolder(mainItem.folder_path);
    // await addToFilesArray(mainItem);
    await createTransmittalRow(mainItem, group);
  });
  //console.log(files);
}

async function generateDrawingRegisterFileTable(data) {
  const groupedData = await groupItemData(data);

  Object.values(groupedData).forEach(async (group) => {
    let mainItem = group[0];
    chartChecks(mainItem);
    checkFolder(mainItem.folder_path);
    // await addToFilesArray(mainItem);
    await createDrawingRegisterRow(mainItem, group);
  });
  //console.log(files);
}



// Function to check for undefined, null, or blank fields in an object
async function hasInvalidFields(obj, ignoredFields) {
  return Object.keys(obj).some((key) => {
    // Check if the key is in the array of ignored fields
    if (ignoredFields.includes(key)) {
      //console.log(key)
      return; // Ignore this field
    }
    const value = obj[key];
    // Check if the value is invalid (undefined, null, or empty string)
    return value === undefined;
  });
}
// Function to highlight cells if the data is undefined, null, or empty
function highlightCell(value, column) {
  const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
  if (value === undefined || value === null || value === "") {
    return `<span class="highlight">${
      value === undefined || value === null || value === "" ? "Missing" : value
    }</span>`;
  } else if (!pattern.test(value) && column == "revisions") {
    const span = document.createElement("span");
    span.classList.add("highlight");
    span.classList.add("tooltip");
    //span.setAttribute('data-tooltip', "Incorrect format. Use formats like P01, C02, or P02.03");
    span.innerHTML = `${value}`;
    return span; //`<span class="highlight tooltip">${value}</span>`
  } else {
    return value;
  }
}
// Function to highlight cells if the data is undefined, null, or empty
function highlightCellNotMandatory(value, column) {
  const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
  if (value === undefined || value === null || value === "") {
    return `<span class="highlightYellow">${
      value === undefined || value === null || value === "" ? "Missing" : value
    }</span>`;
  } else {
    return value;
  }
}
// Function to highlight cells if the data is undefined, null, or empty
function MissingUser(value) {
  if (value === undefined || value === null || value === "") {
    return `<span>${
      value === undefined || value === null ? "ACC System" : value
    }</span>`;
  } else {
    return value;
  }
}

function filterTable(label, field) {
  // Clear the table body
  tableBody.innerHTML = "";
  console.log(label);
  fileCount = 0;
  // Filter the data based on the selected label
  originalFileData.forEach(async (item) => {
    let InvalidRevision;
    const hasTitleLine =
      item["title_line_1"] !== undefined &&
      item["title_line_1"] !== null &&
      item["title_line_1"] !== "";
    const hasRevisionLine =
      item["revision"] !== undefined &&
      item["revision"] !== null &&
      item["revision"] !== "";
    const hasStatusLine =
      item["status"] !== undefined &&
      item["status"] !== null &&
      item["status"] !== "";
    const hasFolderPath =
      item["folder_path"] !== undefined &&
      item["folder_path"] !== null &&
      item["folder_path"] !== "";
    const hasDescriptionLine =
      item["file_description"] !== undefined &&
      item["file_description"] !== null &&
      item["file_description"] !== "";

    if (
      (label === "Files with Title Line 1" && hasTitleLine) ||
      (label === "Files without Title Line 1" && !hasTitleLine)
    ) {
      await createMainTableRow(item, 0);
    }
    if (
      (label === "Files with Revision" &&
        hasRevisionLine &&
        pattern.test(item["revision"])) ||
      (label === "Files without Revision" && !hasRevisionLine) ||
      (label === "Files with Invalid ISO Revision" &&
        !pattern.test(item["revision"]) &&
        hasRevisionLine)
    ) {
      await createMainTableRow(item, 0);
    }
    if (
      (label === "Files with Description" &&
        hasDescriptionLine &&
        item["file_description"] !== "TIDP Placeholder File") ||
      (label === "Files without Description" && !hasDescriptionLine) ||
      (label === "Files with Placeholder Description" &&
        item["file_description"] === "TIDP Placeholder File" &&
        hasDescriptionLine)
    ) {
      await createMainTableRow(item, 0);
    }
    if (
      (label === "Files with Status" && hasStatusLine) ||
      (label === "Files without Status" && !hasStatusLine)
    ) {
      await createMainTableRow(item, 0);
    }
    if (
      (field === "statusBar" && hasStatusLine && item["status"] === label) ||
      (field === "statusBar" && !hasStatusLine && item["status"] === undefined)
    ) {
      await createMainTableRow(item, 0);
    }
    if (
      (field === "folderBar" &&
        hasFolderPath &&
        item["folder_path"].includes(label)) ||
      (field === "folderBar" &&
        !hasFolderPath &&
        item["folder_path"] === undefined)
    ) {
      await createMainTableRow(item, 0);
    }
    colourParentMissing();
    await columnEditing();
  });
  runChecks();
}

async function createMainTableRow(item, group) {
  const mainRow = document.createElement("tr");
  mainRow.classList.add("main-row");
  mainRow.setAttribute("data-id", item.id);
  mainRow.innerHTML = `
          <td>
              ${
                group.length > 1
                  ? '<i class="fas fa-chevron-right expand-icon"></i>'
                  : ""
              }
          </td>
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_2"]
          )}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_3"]
          )}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_4"]
          )}</td>
          <td class="editable">${highlightCell(item["status"])}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["activity_code"]
          )}</td>
          ${
            projectID === "76c59b97-feaf-413c-9bd0-43cf8aaa3133"
              ? `<td class="editable">${highlightCell(item.series)}</td>`
              : ""
          }
          <td>${MissingUser(item.last_modified_user)}</td>
          <td>${highlightCell(
            new Date(item.last_modified_date).toLocaleString()
          )}</td>
          <td>${MissingUser(item.created_by_user)}</td>
          <td>${item.spatial}</td>
  `;

  tableBody.appendChild(mainRow);
  //console.log(mainRow)
  if (group.length > 1) {
    mainRow
      .querySelector(".expand-icon")
      .addEventListener("click", function () {
        //console.log(2)
        const isExpanded = this.classList.contains("fa-chevron-down");
        this.classList.toggle("fa-chevron-down", !isExpanded);
        this.classList.toggle("fa-chevron-right", isExpanded);

        group.slice(1).forEach((item) => {
          //console.log(3)
          const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
          if (itemRow) {
            //console.log(4)
            itemRow.classList.toggle("hidden-row", isExpanded);
          }
        });
      });
    group.slice(1).forEach(async (item) => {
      //console.log(1)
      await createExpandableTableRow(item);
    });
  }
  return; //mainRow
}

async function createDrawingRegisterRow(item, group) {
  const mainRow = document.createElement("tr");
  mainRow.classList.add("main-row");
  mainRow.setAttribute("data-id", item.id);
  mainRow.innerHTML = `
          <td>
              ${
                group.length > 1
                  ? '<i class="fas fa-chevron-right expand-icon"></i>'
                  : ""
              }
          </td>
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
          <td class="editable">${highlightCell(item["status"])}</td>
          <td>${highlightCell(
            new Date(item.last_modified_date).toLocaleString()
          )}</td>
  `;

  tableBody.appendChild(mainRow);
  //console.log(mainRow)
  if (group.length > 1) {
    mainRow
      .querySelector(".expand-icon")
      .addEventListener("click", function () {
        //console.log(2)
        const isExpanded = this.classList.contains("fa-chevron-down");
        this.classList.toggle("fa-chevron-down", !isExpanded);
        this.classList.toggle("fa-chevron-right", isExpanded);

        group.slice(1).forEach((item) => {
          //console.log(3)
          const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
          if (itemRow) {
            //console.log(4)
            itemRow.classList.toggle("hidden-row", isExpanded);
          }
        });
      });
    group.slice(1).forEach(async (item) => {
      //console.log(1)
      await createExpandableDrawingRegisterTableRow(item);
    });
  }
  return; //mainRow
}

async function createTransmittalRow(item, group) {
  const mainRow = document.createElement("tr");
  mainRow.classList.add("main-row");
  mainRow.setAttribute("data-id", item.id);
  mainRow.innerHTML = `
          <td>
              ${
                group.length > 1
                  ? '<i class="fas fa-chevron-right expand-icon"></i>'
                  : ""
              }
          </td>
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
  `;

  tableBody.appendChild(mainRow);
  //console.log(mainRow)
  if (group.length > 1) {
    mainRow
      .querySelector(".expand-icon")
      .addEventListener("click", function () {
        //console.log(2)
        const isExpanded = this.classList.contains("fa-chevron-down");
        this.classList.toggle("fa-chevron-down", !isExpanded);
        this.classList.toggle("fa-chevron-right", isExpanded);

        group.slice(1).forEach((item) => {
          //console.log(3)
          const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
          if (itemRow) {
            //console.log(4)
            itemRow.classList.toggle("hidden-row", isExpanded);
          }
        });
      });
    group.slice(1).forEach(async (item) => {
      //console.log(1)
      await createExpandableTransmittalTableRow(item);
    });
  }
  return; //mainRow
}

async function createExpandableTableRow(item) {
  const itemRow = document.createElement("tr");
  itemRow.classList.add("expandable-row", "hidden-row");
  itemRow.setAttribute("data-id", item.id);
  itemRow.innerHTML = `         
          <td>
              
          </td>   
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_2"]
          )}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_3"]
          )}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["title_line_4"]
          )}</td>
          <td class="editable">${highlightCell(item["status"])}</td>
          <td class="editable">${highlightCellNotMandatory(
            item["activity_code"]
          )}</td>
          ${
            projectID === "76c59b97-feaf-413c-9bd0-43cf8aaa3133"
              ? `<td class="editable">${highlightCell(item.series)}</td>`
              : ""
          }
          <td>${MissingUser(item.last_modified_user)}</td>
          <td>${highlightCell(
            new Date(item.last_modified_date).toLocaleString()
          )}</td>
          <td>${MissingUser(item.created_by_user)}</td>
          <td>${item.spatial}</td>
  
      `;
  tableBody.appendChild(itemRow);
}

async function createExpandableTransmittalTableRow(item) {
  const itemRow = document.createElement("tr");
  itemRow.classList.add("expandable-row", "hidden-row");
  itemRow.setAttribute("data-id", item.id);
  itemRow.innerHTML = `         
          <td>
              
          </td>   
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
      `;
  tableBody.appendChild(itemRow);
}

async function createExpandableDrawingRegisterTableRow(item) {
  const itemRow = document.createElement("tr");
  itemRow.classList.add("expandable-row", "hidden-row");
  itemRow.setAttribute("data-id", item.id);
  itemRow.innerHTML = `         
          <td>
              
          </td>   
          <td>${item.name}</td>
          <td>${item.accversion}</td>
          <td><a href="${item.file_url}" target="_blank">View</a></td>
          <td class="editable">${highlightCell(item.revision, "revision")}</td>
          <td>${item.folder_path}</td>
          <td class="editable">${highlightCell(item["file_description"])}</td>
          <td class="editable">${highlightCell(item["title_line_1"])}</td>
          <td class="editable">${highlightCell(item["status"])}</td>
          <td class="editable">${highlightCell(item["last_modified_date"])}</td>
      `;
  tableBody.appendChild(itemRow);
}

function countRowsInTable(table) {

  // Count only the rows within the tbody
  const rowCount = tableBody.rows.length;
  console.log("Number of body rows:", rowCount);
  switch (table) {
    case "MIDP":
      document.getElementById('MIDPCount').innerHTML = `(${rowCount} files)`
      break;
    case "DR":
      document.getElementById('DRCount').innerHTML = `(${rowCount} files)`
      document.getElementById('DRCountSHEAF').innerHTML = `(${rowCount} files)`
      break;
    case "TR":
      document.getElementById('TRCount').innerHTML = `(${rowCount} files)`
      break;
    case "MDR":
      document.getElementById('MDRCount').innerHTML = `(${rowCount} files)`
      break;
    default:
      break;
  }
}

async function colourParentMissing() {
  // Select all span elements with the class 'highlight'
  const highlightedSpans = document.querySelectorAll("span.highlight");

  // Iterate through each highlighted span
  highlightedSpans.forEach(function (span) {
    // Get the parent element of the current span
    const parent = span.parentElement;

    // Do something with the parent element, for example, apply a style
    if (parent) {
      //console.log(parent); // Log the parent element to the console
      parent.style.backgroundColor = "#ffcccc";
    }
  });

  // Select all span elements with the class 'highlight'
  const highlightedYellowSpans = document.querySelectorAll(
    "span.highlightYellow"
  );

  // Iterate through each highlighted span
  highlightedYellowSpans.forEach(function (span) {
    // Get the parent element of the current span
    const parent = span.parentElement;

    // Do something with the parent element, for example, apply a style
    if (parent) {
      //console.log(parent); // Log the parent element to the console
      parent.classList.add("highlightYellow");
    }
  });
}

async function revisionCheck() {
  const rows = tableBody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    const value = cells[4].textContent.trim();
    const folder = cells[5].textContent.trim();

    if (!pattern.test(value)) {
      // Add a data-tooltip attribute for the custom tooltip
      cells[4].classList.add("tooltip");

      if (value.includes("Missing")) {
        cells[4].setAttribute(
          "data-tooltip",
          "Data is missing please correct on ACC"
        );
      } else {
        cells[4].style.backgroundColor = "#FFDBBB";
      }

      if (folder.includes("WIP")) {
        cells[4].setAttribute(
          "data-tooltip",
          "Incorrect format. Correct format is P##.## as the file is in the WIP folder"
        );
      } else if (folder.includes("SHARED")) {
        cells[4].setAttribute(
          "data-tooltip",
          "Incorrect format. Correct format is P## as the file is in the SHARED folder"
        );
      } else if (folder.includes("PUBLISHED")) {
        cells[4].setAttribute(
          "data-tooltip",
          "Incorrect format. Correct format is C## as the file is in the PUBLISHED folder"
        );
      } else {
        cells[4].setAttribute(
          "data-tooltip",
          "Incorrect format. Use formats like P01, C02, or P02.03"
        );
      }
    }
  }
}

async function titlelineCheck() {
  const rows = tableBody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    const value = cells[7].textContent.trim();
    const folder = cells[5].textContent.trim();
    // Add a data-tooltip attribute for the custom tooltip

    if (value == "Missing") {
      cells[7].classList.add("tooltip");
      cells[7].setAttribute(
        "data-tooltip",
        "All files require a Title Line please amend on ACC"
      );
    }
  }
}
async function descriptionlineCheck() {
  const rows = tableBody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    const value = cells[6].textContent.trim();
    const folder = cells[5].textContent.trim();
    // Add a data-tooltip attribute for the custom tooltip

    if (value == "Missing") {
      cells[6].classList.add("tooltip");
      cells[6].setAttribute(
        "data-tooltip",
        "All files require a description please amend on ACC"
      );
    }
    if (value == "TIDP Placeholder File") {
      cells[6].classList.add("highlightYellow");
    }
  }
}
async function statusCheck() {
  const rows = tableBody.getElementsByTagName("tr");

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].getElementsByTagName("td");
    //console.log(cells)
    const value = cells[11].textContent.trim();
    const folder = cells[5].textContent.trim();
    // Add a data-tooltip attribute for the custom tooltip

    if (value == "Missing") {
      cells[10].classList.add("tooltip-left");
      if (folder.includes("WIP")) {
        cells[10].setAttribute(
          "data-tooltip",
          "Missing status, as the file is in WIP please use S0"
        );
      } else if (folder.includes("SHARED")) {
        cells[10].setAttribute(
          "data-tooltip",
          "Missing status, as the file is in WIP please use S1-7"
        );
      } else if (folder.includes("PUBLISHED")) {
        cells[10].setAttribute(
          "data-tooltip",
          "Missing status, as the file is in WIP please use A4-7"
        );
      } else {
        cells[10].setAttribute(
          "data-tooltip",
          "Incorrect format. Use formats like P01, C02, or P02.03"
        );
      }
      //cells[9].style.setProperty('--tooltip-align', '-100px'); // Align left
      //adjustTooltipPosition(cells[9])
    }
  }
}

async function replaceUndefined(obj) {
  for (let key in obj) {
    if (obj[key] === undefined) {
      obj[key] = "Missing";
    }
  }
  return obj;
}

async function makeCellsEditable() {
  await getCustomDetailsData();
  // Get the toggle button and all editable cells
  toggleEditBtn = document.getElementById("toggleEditBtn");
  editableCellsText = document.querySelectorAll(".editable");
  editableCellsAll = document.querySelectorAll(
    ".editable, .editable-drop, .editable-date"
  );
  let editMode = false; // Keep track of whether cells are editable or not

  // Define an array where each value corresponds to a column

  // Function to toggle the editable state of the cells
  function toggleEditMode() {
    editMode = !editMode; // Toggle edit mode

    editableCellsAll.forEach((cell) => {
      cell.contentEditable = editMode; // Enable or disable contenteditable
      cell.classList.toggle("edit-mode", editMode); // Toggle the class for edit mode
      if (editMode) {
        cell.classList.add("editMode"); // Add the 'missing' class
      } else {
        cell.classList.remove("editMode"); // Remove the 'missing' class
      }
    });

    document.querySelectorAll(".editable-drop").forEach(function (cell) {
      // Attach click event listener to the cell
      cell.addEventListener("click", function () {
        if (editMode) {
          // If a dropdown is already there, avoid re-adding it
          if (cell.querySelector("select")) return;

          // Get the current text/content of the cell
          const currentText = cell.textContent.trim();

          // Create a select element
          const select = document.createElement("select");

          // Create dropdown options
          const options = [
            "NOT STARTED",
            "IN PROGRESS",
            "ON TRACK",
            "DELAY",
            "COMPLETE",
          ];
          options.forEach((option) => {
            const optionElement = document.createElement("option");
            optionElement.value = option;
            optionElement.text = option;
            if (option === currentText) {
              optionElement.selected = true;
            }
            select.appendChild(optionElement);
          });

          // Replace the cell's content with the dropdown
          cell.textContent = ""; // Clear the cell content
          cell.appendChild(select);

          // Focus on the dropdown
          select.focus();

          // Handle the change event when the user selects an option
          select.addEventListener("change", function () {
            cell.textContent = select.value;
            console.log(cell.textContent);
            patchDataToACC(editMode, cell);
            cellClass = highlightTrackingStatusCellAfterPatch(cell.textContent);
            console.log(cellClass);
            cell.classList.add(cellClass);
          });

          // Handle blur event (when the dropdown loses focus)
          select.addEventListener("blur", function () {
            cell.textContent = select.value; // Set the cell content to the selected value
            cell.innerHTML = highlightTrackingStatusCell(select.value); // Update cell content with the selected value
          });

          // Handle Enter key press to select the option
          select.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
              cell.textContent = select.value; // Update cell content with the selected value
              select.blur(); // Trigger blur event
            }
          });
        }
      });
    });
    document.querySelectorAll(".editable-date").forEach((cell) => {
      cell.addEventListener("click", function () {
        if (editMode) {
          // Avoid creating another input if already editing
          if (currentlyEditing === cell) return;

          if (!cell.querySelector("input")) {
            currentlyEditing = cell; // Set the currently editing cell

            const originalValue = cell.textContent.trim();
            const input = document.createElement("input");
            input.type = "date";
            input.value = originalValue;

            // Replace the cell's text content with the date picker
            cell.innerHTML = "";
            cell.appendChild(input);

            // Focus the input field
            input.focus();

            // Handle patching only when the user selects a date (or exits the field)
            input.addEventListener("change", () => {
              cell.textContent = input.value;
              patchDataToACC(editMode, cell);
              cell.textContent = new Date(input.value).toLocaleDateString(
                "en-GB"
              );
              cell.style.backgroundColor = "#d1dfda";
              colourParentMDR();
              colourParentMissing();
            });

            // When the input is blurred, finalize and exit editing mode
            input.addEventListener("blur", () => {
              cell.textContent = new Date(
                input.value || originalValue
              ).toLocaleDateString("en-GB");
              currentlyEditing = null; // Reset currently editing
            });

            input.addEventListener("keydown", (event) => {
              if (event.key === "Enter") {
                cell.textContent = input.value;

                patchDataToACC(editMode, cell);
                currentlyEditing = null; // Reset currently editing
                colourParentMDR();
                colourParentMissing();
              }
            });
          }
        }
      });
    });

    // Update button text
    // Update button text with Unicode symbols
    toggleEditBtn.textContent = editMode
      ? "✔️ Disable Edit Mode" // Pencil symbol for edit mode
      : "✏️ Enable Edit Mode"; // Checkmark symbol for non-edit mode
    toggleEditBtn.style.backgroundColor = editMode ? "orange" : "";
  }

  // Add click event listener to the toggle button
  toggleEditBtn.addEventListener("click", toggleEditMode);

  if (selectedTab === "MDR") {
    columnNames = columnNamesMDR;
  } else {
    columnNames = columnNamesDefault;
  }
  // Attach the 'blur' event listener only once, when the DOM is fully loaded
  editableCellsText.forEach(async (cell) => {
    cell.addEventListener("blur", function () {
      patchDataToACC(editMode, this);
      colourParentMissing();
    });
  });
}

async function generateMIDPHeaders(headers) {
  console.log(1);

  // Create table head and row
  var thead = document.createElement("thead");
  var headerRow = document.createElement("tr");

  // Loop through the headers array and create <th> elements
  headers.forEach(function (header) {
    var th = document.createElement("th");

    // Add width if defined
    if (header.width) {
      th.style.width = header.width;
    }

    // Add 'data-order' attribute if defined
    if (header.order) {
      th.setAttribute("data-order", header.order);
    }

    // Set the content of the header
    th.textContent = header.content;

    // Append <th> to the header row
    headerRow.appendChild(th);
  });

  // Append the row to the thead
  thead.appendChild(headerRow);
  console.log(thead); // Log the thead

  // Select the tables
  var tableMIDP = document.querySelector("#dataTable");

  // Check if tableMIDP and tableDR are valid elements
  console.log(tableMIDP);

  // If the tables are found in the DOM, append thead
  if (tableMIDP) {
    let headerArray = [tableMIDP];

    headerArray.forEach((element) => {
      console.log(element); // Log each element to ensure it's a valid HTML element
      let clonedThead = thead.cloneNode(true); // Clone the thead to append to multiple tables
      element.appendChild(clonedThead); // Append the cloned thead to each table
    });
  } else {
    console.error("Table elements not found. Check your selectors.");
  }
}

async function generateDrawingRegisterHeaders(headers) {
  console.log(1);

  // Create table head and row
  var thead = document.createElement("thead");
  var headerRow = document.createElement("tr");

  // Loop through the headers array and create <th> elements
  headers.forEach(function (header) {
    var th = document.createElement("th");

    // Add width if defined
    if (header.width) {
      th.style.width = header.width;
    }

    // Add 'data-order' attribute if defined
    if (header.order) {
      th.setAttribute("data-order", header.order);
    }

    // Set the content of the header
    th.textContent = header.content;

    // Append <th> to the header row
    headerRow.appendChild(th);
  });

  // Append the row to the thead
  thead.appendChild(headerRow);
  console.log(thead); // Log the thead

  // Select the tables
  var tableMIDP = document.querySelector("#dataTable");
  var tableDR = document.querySelector("#dataTableDR");

  // Check if tableMIDP and tableDR are valid elements
  console.log(tableDR);

  // If the tables are found in the DOM, append thead
  if (tableDR) {
    let headerArray = [tableDR];

    headerArray.forEach((element) => {
      console.log(element); // Log each element to ensure it's a valid HTML element
      let clonedThead = thead.cloneNode(true); // Clone the thead to append to multiple tables
      element.appendChild(clonedThead); // Append the cloned thead to each table
    });
  } else {
    console.error("Table elements not found. Check your selectors.");
  }
}

function addSortableColumns() {
  // Add click event listeners to all sortable tables
  document.querySelectorAll(".sortable").forEach((table) => {
    table.querySelectorAll("th").forEach((header, index) => {
      header.addEventListener("click", () => {
        const currentOrder = header.getAttribute("data-order");
        const newOrder = currentOrder === "asc" ? "desc" : "asc";
        console.log(1);
        // Sort the table
        sortTableByColumn(table, index, newOrder);

        // Update the order attribute
        header.setAttribute("data-order", newOrder);

        // Remove the sort indicator from all headers in the current table
        table.querySelectorAll("th").forEach((th) => {
          th.classList.remove("asc", "desc");
        });

        // Add the new sort indicator
        header.classList.add(newOrder);
      });
    });
  });
}

//////////////////////////////////////////// MDR Generation

function generateMDRTable(inputData) {
  const tableBody = document.querySelector("#dataTableMDR tbody");
  const data = inputData.filter(
    (item) =>
      item.folder_path &&
      (item.folder_path.includes("SHARED") ||
        item.folder_path.includes("PUBLISHED"))
  );
  let currentCategory = "";
  // Grouping the files by discipline (extracted from the name)
  let groupedByProject = data.reduce((acc, file) => {
    // Extract the discipline code (e.g., 'EYA' or 'EYC') from the name
    const project = file.project_pin;

    // Initialize an array for this discipline if it doesn't exist
    if (!acc[project]) {
      acc[project] = [];
    }

    // Push the file object into the appropriate discipline array
    acc[project].push(file);

    return acc;
  }, {});

  console.log(groupedByProject);
  groupedByProject = Object.fromEntries(
    Object.entries(groupedByProject).sort((a, b) => a[0].localeCompare(b[0]))
);
  Object.values(groupedByProject).forEach(async (group) => {
    currentCategory = arrayProjectPin[0].value;
    console.log(currentCategory);
    const groupedFiles = await groupItemData(group)
    console.log(groupedFiles)
    Object.values(groupedFiles).forEach((row, index) => {
      //group.forEach((row, index) => {
      // console.log(row);
      // Check if the category has changed
      // if(currentCategory.value == null){
      //     return
      // }

      const mainItem = row[0]
      console.log(mainItem)
      if (typeof mainItem.project_pin === 'undefined' ) {
        return
      }
      if (mainItem.project_pin !== currentCategory.value ) {
        currentCategory = arrayProjectPin.find(
          (obj) => obj.value === mainItem.project_pin
        );

        categoryRow = currentCategory.value;
        // Insert a sub-header row for the new category
        const subHeaderRow = document.createElement("tr");
        subHeaderRow.classList.add("sub-header");
        subHeaderRow.setAttribute(
          "data-category",
          `${currentCategory.value.replaceAll(" ", "-")}`
        );

        const subHeaderCell = document.createElement("td");
        subHeaderCell.setAttribute("colspan", "11");
        subHeaderCell.classList.add("sub-header");
        subHeaderCell.textContent =
          currentCategory.value + " - " + currentCategory.description;

        subHeaderRow.appendChild(subHeaderCell);
        tableBody.appendChild(subHeaderRow);

        // Add click event listener to the sub-header to toggle visibility
        subHeaderRow.addEventListener("click", function () {
          var category = this.getAttribute("data-category");
          const categoryRows = document.querySelectorAll(
            `[data-category=row-${category}]`
          );
          //console.log(categoryRows, category)
          categoryRows.forEach((rowElement) => {
            rowElement.classList.toggle("hidden");
          });
        });
      }

      // Insert the data row and add a specific class for each category group
      const dataRow = document.createElement("tr");
      const functionValue = arrayFunction.find((obj) => obj.value === mainItem.function);
      //dataRow.classList.add(`category-${index}`); // Class to associate rows with their respective sub-header
      dataRow.setAttribute("data-id", mainItem.id);
      dataRow.setAttribute("data-category", `row-${currentCategory.value}`);
      dataRow.innerHTML = `
        <td>${mainItem.name.split('.')[0]}</td>
        <td><a href="${mainItem.file_url}" target="_blank">View</a></td>
        <td class="editable">${highlightCell(mainItem.revision, "revision")}</td>
        <td class="editable">${highlightCell(mainItem.title_line_1)}</td>
        <td class="editable">${highlightCell(mainItem.description)}</td>
        <td class="">${mainItem.folder_path}</td>
        <td class="">${functionValue.description || ''}</td>
        <td class="editable">${highlightTrackingStatusCell(mainItem.status)}</td>
      `;
      
      if (mainItem.folder_path.includes('PUBLISHED')) {
          dataRow.innerHTML += `<td>${highlightCell(
            new Date(mainItem.last_modified_date).toLocaleString()
          )}</td>`;
      } else {
          dataRow.innerHTML += `<td class=""></td>`;
      }
      
      dataRow.innerHTML += `
          <td class="editable">${highlightUndefinedCell(mainItem.originator)}</td>
          <td class="editable">${highlightUndefinedCell(mainItem.name.split('.')[1])}</td>
      `;
      
      tableBody.appendChild(dataRow);
  
    });
    let currentlyEditing = null;
  });

  makeCellsEditable();
  colourParentMDR();
}
function highlightUndefinedCell(value, column) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "Invalid Date"
  ) {
    return `<span class="MDRCell highlight"></span>`;
  } else {
    return `<span>${value}</span>`;
  }
}

function highlightTrackingStatusCellAfterPatch(value) {
  if (value === undefined || value === null || value === "") {
    return `highlight`;
  } else {
    switch (value) {
      case "NOT STARTED":
        return `highlightMDRYellow`;
      case "ON TRACK":
        return `highlightMDRGreen`;
      case "IN PROGRESS":
        return `highlightMDROrange`;
      case "DELAY":
        return `highlightMDRRed`;
      case "COMPLETE":
        return `highlightMDRPurple`;
      default:
        break;
    }
    return;
  }
}

function highlightTrackingStatusCell(value, column) {
  if (value === undefined || value === null || value === "") {
    return `<span class="MDRCell highlight"></span>`;
  } else {
    switch (value) {
      case "NOT STARTED":
        return `<span class="MDRCell highlightMDRYellow">${value}</span>`;
      case "ON TRACK":
        return `<span class="MDRCell highlightMDRGreen">${value}</span>`;
      case "IN PROGRESS":
        return `<span class="MDRCell highlightMDROrange">${value}</span>`;
      case "DELAY":
        return `<span class="MDRCell highlightMDRed">${value}</span>`;
      case "COMPLETE":
        return `<span class="MDRCell highlightMDRPurple">${value}</span>`;
      default:
        break;
    }
    return `<span>${value}</span>`;
  }
}

async function colourParentMDR() {
  // Select all span elements with the class 'highlight'
  const highlightedSpans = document.querySelectorAll("span.MDRCell");

  // Iterate through each highlighted span
  highlightedSpans.forEach(function (span) {
    // Get the parent element of the current span
    const parent = span.parentElement;

    // Determine the background color based on specific class names
    let spanBackgroundColor;

    // Check for different highlight classes and set the appropriate color
    if (span.classList.contains("highlightMDRYellow")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor; // Assuming span has a background color defined in CSS
    } else if (span.classList.contains("highlightMDRGreen")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
    } else if (span.classList.contains("highlightMDROrange")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
    } else if (span.classList.contains("highlightMDRRed")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
    } else if (span.classList.contains("highlightMDRPurple")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
    } else if (span.classList.contains("highlight")) {
      spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
    }

    // Apply the background color to the parent element
    if (parent && spanBackgroundColor) {
      parent.style.backgroundColor = spanBackgroundColor;
    }
  });
}
