document.addEventListener("DOMContentLoaded", async function () {
  table = document.querySelector("#dataTable");
  tableBody = document.querySelector("#dataTable tbody");
  tableHeader = document.querySelector("#dataTable");
  searchInput = document.getElementById("searchInput");
  // folderFilter = document.getElementById("folderFilter");
  if (window.location.href.includes("/dashboard")) {
    if (!window.location.href.includes("?id=")) {
      window.location.href = `/Project_Dashboards/index.html`;
    }
    document.getElementById("MIDP").style.display = "block";
    document.getElementById("chartsSection").style.display = "block";
  }

  const fullUrl = window.location.href;
  document.getElementById("appInfo").textContent = `${appName} ${appVersion}`;
  // Split the URL at the "?" and take the first part
  toolURL = fullUrl.split("?")[0];
  await checkLogin();
  loadingScreen = document.getElementById("loadingScreen");
  statusUpdateLoading = document.getElementById("statusUpdateLoading");
  const logoutButton = document.getElementById("logoutBtn");

  // Add an event listener for the button click event
  logoutButton.addEventListener("click", function () {
    signOut();
  });
  getProjectFromURL();
  projectName = sessionStorage.getItem('projectName')
  await showLoadingSpinner(tableHeader)
  await getData()
  await hideLoadingSpinner(tableHeader)

//await createFilterOptions()
  

  // Button visability //

  // Drawing Register
  if (projects_DR.some((item) => item.id === projectID)) {
    document.getElementById("DrawingRegister_Button").style.display = "block";
  }

  // Drawing Register
  if (projects_SHEAF_DR.some((item) => item.id === projectID)) {
    document.getElementById("DrawingRegisterSHEAF_Button").style.display = "block";
  }

  // Transmittal Register
  // if (projects_TR.some((item) => item.id === projectID)) {
  //   document.getElementById("TransmittalRegister_Button").style.display =
  //     "block";
  // }

  rows = tableBody.getElementsByTagName("tr");

  searchInput.addEventListener("keyup", function () {
    const filter = searchInput.value.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      // Start at 1 to skip the header row
      const cells = rows[i].getElementsByTagName("td");
      let match = false;

      for (let j = 0; j < cells.length; j++) {
        if (cells[j].textContent.toLowerCase().includes(filter)) {
          match = true;
          break;
        }
      }

      if (match) {
        rows[i].style.display = ""; // Show the row
      } else {
        rows[i].style.display = "none"; // Hide the row
      }
    }
  });
  // Add event listener to filter the table based on selected folder path
  // folderFilter.addEventListener('change', function () {
  //     const selectedPath = this.value;

  //     for (let i = 0; i < rows.length; i++) { // Skip the header row
  //         const row = rows[i];
  //         const folderPath = row.getElementsByTagName('td')[5].textContent.trim();

  //         if (selectedPath === 'all' || folderPath === selectedPath) {
  //             row.style.display = ''; // Show the row
  //         } else {
  //             row.style.display = 'none'; // Hide the row
  //         }
  //     }
  // });

  window.addEventListener("beforeunload", function (event) {
    if (editMode) {
      console.log("User is in edit mode. Showing the beforeunload prompt.");
      event.preventDefault();
      event.returnValue = ""; // Display the default browser alert message
      return ""; // For older browsers
    }
  });
  // Get all toggle buttons
  const toggleHeaders = document.querySelectorAll(".toggle-header");

  // Add a click event listener to each button
  toggleHeaders.forEach((button) => {
    button.addEventListener("click", function () {
      // Get the target section id from the data attribute
      const targetSectionId = this.getAttribute("data-target");
      const targetSection = document.getElementById(targetSectionId);
      const arrow = this.querySelector(".arrow");

      // Toggle the section's visibility
      targetSection.classList.toggle("hidden");

      // Change the arrow direction based on visibility
      if (targetSection.classList.contains("hidden")) {
        arrow.classList.remove("down");
        arrow.classList.add("left");
      } else {
        arrow.classList.remove("left");
        arrow.classList.add("down");
      }
    });
  });
});

function signOut() {
  localStorage.setItem("user_refresh_token", "blank");
  clearUrlParameters();
  signin();
}

async function populateFolderDropdown(folderPaths) {
  const uniqueArray = folderPaths.filter(
    (obj, index, self) => index === self.findIndex((o) => o === obj)
  );

  // Populate the dropdown with folder paths
  uniqueArray.forEach((path) => {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = path;
    folderFilter.appendChild(option);
  });
}

async function resetValues() {
  // files = [];
  tableBody.innerHTML = "";
  //folderFilter.options.length = 1
  folderPaths = [];
  filteredData = [];
  titleLineMissingCount = 0;
  titleLinePresentCount = 0;
  revisionMissingCount = 0;
  revisionPresentCount = 0;
  statusMissingCount = 0;
  statusPresentCount = 0;
  revisionFormatCheckInvaildCount = 0;
  revisionFormatCheckPresentCount = 0;
  descriptionMissingCount = 0;
  descriptionPresentCount = 0;
  descriptionPlaceHolderCount = 0;
  folderCount = [];
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

function checkFolder(folderPath) {
  if (folderPath.includes("WIP")) {
    folderCount["WIP"] = (folderCount["WIP"] || 0) + 1;
  } else if (folderPath.includes("CLIENT_SHARED")) {
    folderCount["CLIENT_SHARED"] = (folderCount["CLIENT_SHARED"] || 0) + 1;
  } else if (folderPath.includes("SHARED")) {
    folderCount["SHARED"] = (folderCount["SHARED"] || 0) + 1;
  } else if (folderPath.includes("PUBLISHED")) {
    folderCount["PUBLISHED"] = (folderCount["PUBLISHED"] || 0) + 1;
  }
}

async function getProjectFromURL() {
  // Get the URL of the current page
  var url = window.location.href;

  // Check if the URL contains a parameter named 'id'
  if (url.indexOf("id=") !== -1) {
    // Extract the value of the 'id' parameter
    var id = url.split("id=")[1];

    // Display the extracted ID
    console.log("Extracted ID:", id);

    setDefaultSelectedValue(id);
  } else {
    console.log("No ID parameter found in the URL");
  }
}

function checkURL() {
  // Get the query string portion of the URL
  var queryString = window.location.search;

  // Check if the query string contains an 'id' parameter
  if (queryString.includes("id=")) {
    console.log("The URL contains an Project ID parameter");
    getProjectFromURL();
  } else {
    console.log("The URL does not contain an Project ID parameter");
  }
}

// Function to set the default selected value
function setDefaultSelectedValue(id) {
  var defaultValue = id; // Replace '456' with the desired default value
  console.log(defaultValue);
  projectID = defaultValue;
  rawProjectID = defaultValue.replace("b.", "");
}

async function resetTable() {
  tableBody.innerHTML = "";
  tableHeader.innerHTML = "";
  await loadTables()
  resetHeaders();

  //folderFilter.value = "all"; // Reset dropdown to "All"
  searchInput.value = null;
}






async function openTab(evt, tabName) {
  // Declare all variables
  var i, tabcontent, tablinks;
  selectedTab = tabName;

  // Get all elements with class="tabcontent" and hide them
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Get all elements with class="tablinks" and remove the class "active"
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Show the current tab, and add an "active" class to the button that opened the tab
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";
  document.getElementById("openModal").style.display = "block";
  document.getElementById("chartButton").style.display = "block";
  switch (tabName) {
    case "MIDP":
      tableBody = document.querySelector("#dataTable tbody");
      tableHeader = document.getElementById("dataTable");
      searchInput = document.getElementById("searchInput");
      await showLoadingSpinner(tableHeader)
      //folderFilter = document.getElementById("folderFilter");
      tableBody.innerHTML = "";
      searchInput.value = "";
      // tableHeader.innerHTML = '';
      generateMIDPTable();
      await hideLoadingSpinner(tableHeader)
      break;

    case "DrawingRegister":
      tableBody = document.querySelector("#dataTableDR tbody");
      tableHeader = document.getElementById("dataTableDR");
      searchInput = document.getElementById("searchInputDR");
      folderFilter = document.getElementById("folderFilterDR");
      await showLoadingSpinner(tableHeader)
      tableBody.innerHTML = "";
      searchInput.value = "";
      //tableHeader.innerHTML=''
      generateDrawingRegisterTable();
      document.getElementById("openModal").style.display = "none";
      document.getElementById("chartButton").style.display = "none";
      document.getElementById("chartsSection").style.display = "none";
      await hideLoadingSpinner(tableHeader)
      break;

    case "DrawingRegisterSHEAF":
      tableBody = document.querySelector("#dataTableDRSHEAF tbody");
      tableHeader = document.getElementById("dataTableDRSHEAF");
      searchInput = document.getElementById("searchInputDRSHEAF");
      folderFilter = document.getElementById("folderFilterDRSHEAF");
      await showLoadingSpinner(tableHeader)
      tableBody.innerHTML = "";
      searchInput.value = "";
      //tableHeader.innerHTML=''
      generateSHEAFDrawingRegisterTable();
      document.getElementById("openModal").style.display = "none";
      document.getElementById("chartButton").style.display = "none";
      document.getElementById("chartsSection").style.display = "none";
      await hideLoadingSpinner(tableHeader)
      break;

    case "TransmittalRegister":
      tableBody = document.querySelector("#dataTableTR tbody");
      tableHeader = document.getElementById("dataTableTR");
      searchInput = document.getElementById("searchInputTR");
      folderFilter = document.getElementById("folderFilterTR");
      await showLoadingSpinner(tableHeader)
      tableBody.innerHTML = "";
      searchInput.value = "";
      DCDataRetrieval();
      generateTransmittalTable();
      document.getElementById("openModal").style.display = "none";
      document.getElementById("chartButton").style.display = "none";
      document.getElementById("chartsSection").style.display = "none";
      await hideLoadingSpinner(tableHeader)
      break;

    case "MDR":
      tableBody = document.querySelector("#dataTableMDR tbody");
      tableHeader = document.getElementById("dataTableMDR");
      searchInput = document.getElementById("searchInputMDR");
      folderFilter = document.getElementById("folderFilterMDR");
      await showLoadingSpinner(tableHeader)
      tableBody.innerHTML = "";
      searchInput.value = "";
      await getNSArray();
      generateMDRTable(files);
      document.getElementById("openModal").style.display = "none";
      document.getElementById("chartButton").style.display = "none";
      document.getElementById("chartsSection").style.display = "none";
      await hideLoadingSpinner(tableHeader)
      break;

    default:
      break;
  }
  rows = tableBody.getElementsByTagName("tr");
  searchInput.addEventListener("keyup", function () {
    const filter = searchInput.value.toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      // Start at 1 to skip the header row
      const cells = rows[i].getElementsByTagName("td");
      let match = false;

      for (let j = 0; j < cells.length; j++) {
        if (cells[j].textContent.toLowerCase().includes(filter)) {
          match = true;
          break;
        }
      }

      if (match) {
        rows[i].style.display = ""; // Show the row
      } else {
        rows[i].style.display = "none"; // Hide the row
      }
    }
  });
  // Add event listener to filter the table based on selected folder path
  // folderFilter.addEventListener('change', function () {
  //     const selectedPath = this.value;

  //     for (let i = 0; i < rows.length; i++) { // Skip the header row
  //         const row = rows[i];
  //         const folderPath = row.getElementsByTagName('td')[5].textContent.trim();

  //         if (selectedPath === 'all' || folderPath === selectedPath) {
  //             row.style.display = ''; // Show the row
  //         } else {
  //             row.style.display = 'none'; // Hide the row
  //         }
  //     }
  // });
}



async function invalidFileCheck(fileArray) {
  invalidObjects = [];
  fileArray.forEach(async (obj) => {
    if (await hasInvalidFields(obj, ignoreFieldsInvaildCheck)) {
      //console.log(obj)
      invalidObjects.push(obj);
    }
  });
  //console.log(invalidObjects)
}

function openChartsSelection(tabName) {
  if (document.getElementById(tabName).style.display == "block") {
    document.getElementById(tabName).style.display = "none";
  } else {
    document.getElementById(tabName).style.display = "block";
  }
  return;
  chartButton = document.getElementById("chartButton");
  // Update button text with Unicode symbols
  chartButton.textContent = showCharts
    ? "📊 Show Charts" // Pencil symbol for edit mode
    : "📊 Hide Charts"; // Checkmark symbol for non-edit mode
}

// Function to show popup with fade-in
function showPopup(title, message) {
  const popup = document.getElementById("popup");
  popup.classList.add("show"); // Add 'show' class to make the popup visible
  popup.innerHTML = `<h4>${title}</h4><br><span>${message}</span>`;
  // Hide the popup after 5 seconds with fade-out
  setTimeout(function () {
    popup.classList.remove("show"); // Remove 'show' class to fade it out
  }, 10000);
}


/////////////////////////////////////////////////////////////// Metadata Update Section


async function findObjectByName(name, data) {
  let output;
  output = await data.find((obj) => obj.name === name);
  //console.log(output)
  if (output && output.arrayValues && output.length === 0) {
  } else {
    return output;
  }
}

////////////////////////////////////////////////////////// Column Manipulation

async function columnEditing() {
  const modal = document.getElementById("columnModal");
  const openModalBtn = document.getElementById("openModal");
  const closeModalBtn = document.querySelector(".close");
  const applyColumnsBtn = document.getElementById("applyColumns");
  const table = tableHeader;
  console.log(table)
  const columnSelector = document.getElementById("columnSelector");
  const theadThs = table.querySelectorAll("thead tr th");
  const STORAGE_KEY = "columnPreferences"; // LocalStorage key

  // Function to dynamically generate the checkboxes based on the column headers
  // Function to dynamically generate the checkboxes based on the column headers
  function generateCheckboxes() {
    columnSelector.innerHTML = "";
    theadThs.forEach((th, index) => {
      const columnName = th.textContent.trim();

      // Skip generation if the column is in the ignoredColumns list
      if (ignoredColumns.includes(columnName)) {
        return; // Skip this iteration
      }

      const checkboxWrapper = document.createElement("label");
      checkboxWrapper.innerHTML = `<input type="checkbox" data-column="${
        index + 1
      }" checked> ${columnName}`;
      columnSelector.appendChild(checkboxWrapper);
    });
  }

  // Function to toggle column visibility based on checkbox selection
  function toggleColumns() {
    const checkboxes = document.querySelectorAll(
      '#columnSelector input[type="checkbox"]'
    );
    const preferences = {};
    checkboxes.forEach((checkbox) => {
      const columnIndex = checkbox.getAttribute("data-column");
      const isChecked = checkbox.checked;

      // Toggle visibility of both <th> and <td> elements in the corresponding column
      const th = table.querySelector(`thead th:nth-child(${columnIndex})`);
      const tds = table.querySelectorAll(`tbody td:nth-child(${columnIndex})`);

      if (isChecked) {
        th.classList.remove("hide"); // Show the <th>
        tds.forEach((td) => td.classList.remove("hide")); // Show all <td>s in the column
      } else {
        th.classList.add("hide"); // Hide the <th>
        tds.forEach((td) => td.classList.add("hide")); // Hide all <td>s in the column
      }

      // Save the preference
      preferences[columnIndex] = isChecked;
    });

    // Save preferences to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }

  // Function to synchronize checkboxes with current column visibility
  function syncCheckboxesWithTable() {
    const checkboxes = document.querySelectorAll(
      '#columnSelector input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      const columnIndex = checkbox.getAttribute("data-column");
      const th = table.querySelector(`thead th:nth-child(${columnIndex})`);

      // If the column is hidden, uncheck the checkbox; otherwise, check it
      checkbox.checked = !th.classList.contains("hide");
    });
  }

  // Load saved preferences from localStorage
  function loadPreferences() {
    const preferences = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;

    // If preferences exist, apply them
    if (preferences) {
      theadThs.forEach((th, index) => {
        const columnIndex = index + 1;
        const isVisible = preferences[columnIndex];

        if (isVisible === false) {
          th.classList.add("hide"); // Hide the <th>
          const tds = table.querySelectorAll(
            `tbody td:nth-child(${columnIndex})`
          );
          tds.forEach((td) => td.classList.add("hide")); // Hide all <td>s in the column
        } else {
          th.classList.remove("hide"); // Show the <th>
          const tds = table.querySelectorAll(
            `tbody td:nth-child(${columnIndex})`
          );
          tds.forEach((td) => td.classList.remove("hide")); // Show all <td>s in the column
        }
      });
    } else {
      // If no preferences exist, apply the defaultHiddenColumns
      theadThs.forEach((th, index) => {
        const columnName = th.textContent.trim();
        if (defaultHiddenColumns.includes(columnName)) {
          th.classList.add("hide"); // Hide the <th>
          const tds = table.querySelectorAll(
            `tbody td:nth-child(${index + 1})`
          );
          tds.forEach((td) => td.classList.add("hide")); // Hide all <td>s in the column
        }
      });
    }
  }

  // Open the modal and sync the checkboxes when the "Select Columns" button is clicked
  openModalBtn.onclick = function () {
    modal.style.display = "block";
    syncCheckboxesWithTable(); // Sync the checkboxes with current table visibility
  };

  // Close the modal when the "x" button is clicked
  closeModalBtn.onclick = function () {
    modal.style.display = "none";
  };

  // Close the modal when clicking outside of the modal content
  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };

  // Apply selected columns when the "Apply" button is clicked
  applyColumnsBtn.onclick = function () {
    toggleColumns();
    modal.style.display = "none"; // Close the modal
  };

  // Initialize the table visibility, generate checkboxes, and load user preferences
  generateCheckboxes();
  loadPreferences(); // Load preferences from localStorage or apply defaults
}

function sortTableByColumn(table, column, order = "asc") {
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));

  const sortedRows = rows.sort((rowA, rowB) => {
    const cellA = rowA
      .querySelector(`td:nth-child(${column + 1})`)
      .textContent.trim();
    const cellB = rowB
      .querySelector(`td:nth-child(${column + 1})`)
      .textContent.trim();

    if (!isNaN(cellA) && !isNaN(cellB)) {
      // Sort numerically if the data is numeric
      return order === "asc" ? cellA - cellB : cellB - cellA;
    }

    return order === "asc"
      ? cellA.localeCompare(cellB)
      : cellB.localeCompare(cellA);
  });

  // Remove current rows
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  // Append sorted rows
  sortedRows.forEach((row) => tbody.appendChild(row));
}







////////////////////////////////////// Get Project Naming Standard










////////////////////////////////////// Get CSV Data from ACC Data Connector

async function DCDataRetrieval() {
  fetchReviewData().then(() => {
    matchUpDataReviews();
  });
  fetchTransmittalData().then(() => {
    matchUpDataTransmittal();
  });
}

async function createFilterOptions() {
  const thead = table.querySelector("thead");
  const tbody = tableBody;
  const filterContainer = document.querySelector(".filterOptions");
  const toggleButton = document.getElementById("toggleFiltersButton");
  // Define columns to exclude from filtering (zero-based index)
  const excludedColumns = [0, 1, 2, 3, 4]; // Exclude "Created By" (index 3) and "Date Modified" (index 4)
  filterContainer.innerHTML = "";
  // Get the number of columns
  const numCols = thead.rows[0].cells.length;

  // Create dropdown filters for each column, except the excluded ones
  for (let colIndex = 0; colIndex < numCols; colIndex++) {
    if (excludedColumns.includes(colIndex)) {
      continue; // Skip creating filter for excluded columns
    }

    // Create a filter container div (for label + dropdown)
    const filterDiv = document.createElement("div");
    filterDiv.classList.add("filter-container");

    // Create the label for the filter
    const label = document.createElement("label");
    label.textContent = `${thead.rows[0].cells[colIndex].innerText}:`;

    // Create the dropdown filter
    const select = document.createElement("select");
    select.innerHTML = '<option value="">All</option>'; // Default "All" option

    // Get unique values for the current column from the tbody
    const uniqueValues = new Set();
    //console.log(tbody.rows)
    for (let row of tbody.rows) {
      uniqueValues.add(row.cells[colIndex].innerText);
    }
    //console.log(uniqueValues)
    // Add options to the dropdown based on unique values in the column
    // Convert Set to array
    const uniqueValuesArray = Array.from(uniqueValues);

    // Sort the array (case-sensitive sort)
    uniqueValuesArray.sort();
    uniqueValues.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    // Add event listener to filter the table on dropdown change
    select.addEventListener("change", function () {
      filterTable();
    });

    // Append label and select to the filterDiv
    filterDiv.appendChild(label);
    filterDiv.appendChild(select);

    // Append the filterDiv to the filterContainer (not inside the table)
    filterContainer.appendChild(filterDiv);
  }

  // Function to filter the table based on selected filters
  function filterTable() {
    for (let row of tbody.rows) {
      let isVisible = true;

      // Check each filter and match the cell value
      for (let colIndex = 0; colIndex < numCols; colIndex++) {
        if (excludedColumns.includes(colIndex)) continue; // Skip excluded columns

        // Adjust for excluded columns to correctly index filters
        const filterDiv =
          filterContainer.children[
            colIndex - excludedColumns.filter((c) => c < colIndex).length
          ];
        const select = filterDiv.querySelector("select");
        const filterValue = select.value;
        const cellValue = row.cells[colIndex].innerText;

        if (filterValue && cellValue !== filterValue) {
          isVisible = false;
          break;
        }
      }

      // Show or hide the row based on filter match
      row.style.display = isVisible ? "" : "none";
    }
  }
  // Toggle the visibility of the filters
  toggleButton.addEventListener("click", function () {
    // Check if filters are currently visible
    if (filterContainer.classList.contains("hidden")) {
      // Show filters
      filterContainer.classList.remove("hidden");
      toggleButton.textContent = "Hide Filters";
    } else {
      // Hide filters
      filterContainer.classList.add("hidden");
      toggleButton.textContent = "Show Filters";
    }
  });
}

async function showLoadingSpinner(table) {
  const loadingSpinner = document.getElementById('loading');

  // Show the loading spinner
  table.style.display = 'none';
  loadingSpinner.style.display = 'block';
}

async function hideLoadingSpinner(table) {
  const loadingSpinner = document.getElementById('loading');

  // Show the loading spinner
  loadingSpinner.style.display = 'none';
  table.style.display = 'block';
}