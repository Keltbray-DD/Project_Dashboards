async function processData(fileName, updated, Project_Name, folders, files_list) {
  console.log(fileName, files_list);

  fileData = {
    updated: updated,
    folderData: folders,
    files_list: files_list
  };
  sessionStorage.setItem('projectData',fileData)
  console.log(fileData);
  projectName = Project_Name;
  document.getElementById("dataInfo").textContent = `Data Extract: ${formatDate(
    fileData.updated
  )}`;
  document.getElementById(
    "title"
  ).innerHTML = `${projectName} - Forma Docs Dashboard`;
  document.title = `${projectName} Forma Docs Dashboard`;

  orginalACCExport = fileData.files_list;

  await generateArrays()
  console.log(folderPaths)
  await loadTables()
  // Fire-and-forget: lets the basic table render immediately while custom
  // attributes stream in chunk-by-chunk in the background.
  enrichFilesWithCustomAttributes();
}

function applyAttrsToFile(file, attrs) {
  for (const accName in ATTR_NAME_MAP) {
    const fieldName = ATTR_NAME_MAP[accName];
    if (attrs[accName] !== undefined) {
      file[fieldName] = attrs[accName];
    }
  }
}

// Multi-step loading panel: replaces the existing #loading overlay with
// a centred spinner + title + checklist. Each step is set to one of
// "pending", "active", or "done" by setLoadingStep(); when all steps are
// done, teardownLoadingPanel() restores the overlay to its simple
// "Loading…" form for tab-switch use.
const LOADING_STEPS = [
  { id: "auth", label: "Authenticating with Autodesk" },
  { id: "files", label: "Loading project files" },
  { id: "metadata", label: "Loading file metadata" },
  { id: "render", label: "Rendering dashboard" },
];

function buildLoadingPanel(title) {
  const el = document.getElementById("loading");
  if (!el) return;
  el.classList.add("loading-panel-mode");
  el.style.display = "block";
  const stepsHtml = LOADING_STEPS.map(
    (s) => `
      <li class="step pending" data-step="${s.id}">
        <span class="step-icon"></span>
        <span class="step-label">${s.label}</span>
      </li>`
  ).join("");
  el.innerHTML = `
    <div class="loading-spinner-circle"></div>
    <div class="loading-title">${title || "Loading dashboard…"}</div>
    <ul class="loading-steps" id="loadingSteps">${stepsHtml}</ul>
  `;
}

function teardownLoadingPanel() {
  const el = document.getElementById("loading");
  if (!el) return;
  el.classList.remove("loading-panel-mode");
  el.style.display = "none";
  el.textContent = "Loading...";
}

function setLoadingStep(stepId, state, label) {
  const ul = document.getElementById("loadingSteps");
  if (!ul) return;
  const li = ul.querySelector(`[data-step="${stepId}"]`);
  if (!li) return;
  li.classList.remove("pending", "active", "done");
  li.classList.add(state);
  const icon = li.querySelector(".step-icon");
  if (icon) icon.textContent = state === "done" ? "✓" : "";
  if (label !== undefined) {
    const labelEl = li.querySelector(".step-label");
    if (labelEl) labelEl.textContent = label;
  }
}

// Calls ACC's versions:batch-get endpoint in chunks, merges custom
// attribute values into the in-memory `files[]`, and re-renders the active
// tab when finished so populated cells and compliance gauges update.
// Results are cached in sessionStorage keyed by version URN, so the same
// project re-opened in the same tab session avoids re-fetching everything.
async function enrichFilesWithCustomAttributes() {
  if (!files || files.length === 0) {
    teardownLoadingPanel();
    return;
  }

  const rawProjectID = (projectID || "").replace("b.", "");
  if (!accesToken) {
    accesToken = await getAccessToken("data:read data:write");
  }
  if (!accesToken) {
    console.error("Cannot enrich custom attributes — no access token.");
    teardownLoadingPanel();
    return;
  }

  // Chunk size: 200 matches the reference uploader and works in practice
  // (the public docs say 50 max but the endpoint is more permissive).
  // Concurrency: 4 in-flight batches keeps us comfortably below the
  // ~300 req/min APS rate limit while making large projects (10k+ files)
  // finish in seconds instead of minutes.
  const CHUNK_SIZE = 200;
  const CONCURRENCY = 4;
  const CACHE_KEY = `customAttrs_${rawProjectID}`;
  let cache = {};
  let cachePersistFailed = false;
  try {
    cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}");
  } catch (e) {
    cache = {};
  }

  // Apply anything we already have cached, no network needed.
  for (const file of files) {
    if (file.id && cache[file.id]) applyAttrsToFile(file, cache[file.id]);
  }

  const uncachedUrns = files
    .map((f) => f.id)
    .filter((urn) => urn && !cache[urn]);
  const totalUncached = uncachedUrns.length;
  const totalChunks = Math.ceil(totalUncached / CHUNK_SIZE);

  console.log(
    `enrichFilesWithCustomAttributes: ${files.length} files, ${totalUncached} uncached, ${totalChunks} chunks @ size ${CHUNK_SIZE}, concurrency ${CONCURRENCY}`
  );

  setLoadingStep(
    "metadata",
    "active",
    totalUncached === 0
      ? "Loading file metadata (cached)"
      : `Loading file metadata (0 / ${totalUncached.toLocaleString()})`
  );

  let completed = 0;

  // Fire CONCURRENCY chunks at once, await them all, then move to the
  // next wave. Per-wave progress updates feel snappier than per-chunk
  // because the user sees a quick jump every ~500ms-1s.
  for (let waveStart = 0; waveStart < totalUncached; waveStart += CHUNK_SIZE * CONCURRENCY) {
    const chunkPromises = [];
    for (let p = 0; p < CONCURRENCY; p++) {
      const start = waveStart + p * CHUNK_SIZE;
      if (start >= totalUncached) break;
      const chunk = uncachedUrns.slice(start, start + CHUNK_SIZE);
      chunkPromises.push(
        getCustomDetailsBatch(accesToken, chunk).then((results) => ({ chunk, results, start }))
      );
    }
    const waveResults = await Promise.all(chunkPromises);

    for (const { chunk, results, start } of waveResults) {
      if (results && results.length !== chunk.length) {
        console.warn(
          `batch-get returned ${results.length}/${chunk.length} for chunk starting at index ${start} — index alignment may be off`
        );
      }
      if (results && results.length > 0) {
        const limit = Math.min(results.length, chunk.length);
        for (let j = 0; j < limit; j++) {
          const urn = chunk[j];
          const result = results[j];
          const attrs = {};
          for (const a of result.customAttributes || []) {
            attrs[a.name] = a.value;
          }
          cache[urn] = attrs;
          const file = files.find((f) => f.id === urn);
          if (file) applyAttrsToFile(file, attrs);
        }
      }
      completed += chunk.length;
    }

    // Persist cache once per wave rather than per chunk — fewer writes
    // and the failure handling stays scoped to a single try block. If
    // the cache write fails (sessionStorage quota), warn once and stop
    // re-attempting for the rest of this run.
    if (!cachePersistFailed) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (e) {
        console.warn(
          `Custom-attr cache exceeded sessionStorage quota — subsequent loads will re-fetch from Forma instead of cache. (${e && e.name})`
        );
        cachePersistFailed = true;
      }
    }

    setLoadingStep(
      "metadata",
      "active",
      `Loading file metadata (${Math.min(completed, totalUncached).toLocaleString()} / ${totalUncached.toLocaleString()})`
    );
  }

  setLoadingStep("metadata", "done");

  // Overlay any cell edits the user made since PA's current extract was
  // generated — they're stored in localStorage with timestamps and
  // dropped automatically once PA's next extract catches up.
  if (typeof applyPendingEdits === "function") {
    try { applyPendingEdits(); } catch (e) { console.warn("applyPendingEdits failed:", e); }
  }

  setLoadingStep("render", "active");

  // Refresh every Tabulator instance the user has already opened so
  // tab-switches after enrichment show up-to-date data without another
  // round trip. Each init function knows whether it filters the data
  // (DR/SHEAF) or shows everything (MIDP/MDR).
  const refreshers = {
    MIDP: typeof initMidpTable === "function" ? initMidpTable : null,
    DR: typeof initDrawingRegisterTable === "function" ? initDrawingRegisterTable : null,
    DRSHEAF: typeof initSheafDrawingRegisterTable === "function" ? initSheafDrawingRegisterTable : null,
  };
  if (typeof tabulators !== "undefined") {
    for (const key of Object.keys(tabulators)) {
      if (refreshers[key]) {
        try { await refreshers[key](); } catch (e) { console.warn(`refresh ${key} failed:`, e); }
      }
    }
  }
  if (typeof openTab === "function" && selectedTab) {
    await openTab("", selectedTab);
  }

  setLoadingStep("render", "done");
  teardownLoadingPanel();
}
async function loadTables() {
    // fileData = sessionStorage.getItem('projectData')
    console.log('fileData',files)
    await generateHeadersParent();
    await openTab('', selectedTab)
}

function formatDate(isoDate) {
  const date = new Date(isoDate);

  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };

  return date.toLocaleString("en-GB", options);
}

async function convertStringToJSON(JSONdata) {
  convertedData = JSON.parse(JSONdata);
  convertedData = convertedData.flat();
  // Check if each element is a string before parsing
  const fullJsonArray = convertedData
    .map((item) => {
      return typeof item === "string" ? JSON.parse(item) : item;
    })
    .flat();

  //console.log(convertedData)
  return fullJsonArray;
}

async function groupItemData(data) {
  groupedData = data.reduce((acc, item) => {
    // console.log(item)
    // Extract the id without the version part
    const itemIdNoVersion = item.id.split("?")[0];

    // Initialize the group if it doesn't exist
    acc[itemIdNoVersion] = acc[itemIdNoVersion] || [];

    // Push the current item into the group
    acc[itemIdNoVersion].push(item);

    // Optionally sort the items by accversion in descending order within the group
    acc[itemIdNoVersion].sort((a, b) => b.accversion - a.accversion);

    return acc;
  }, {});

  return groupedData;
}

async function addToFilesArray(item) {
    // The PA index now ships only basic file metadata — Name, folderID,
    // folderPath, itemID, itemIdVersion. Everything else (revision, title
    // lines, status, dates, activity code, etc.) is fetched on demand from
    // Forma and patched into this row later. Initialise those fields so the
    // shape stays stable and downstream code doesn't crash on missing keys.
    const versionMatch = (item.itemIdVersion || '').match(/\?version=(\d+)/);
    const accversion = versionMatch ? parseInt(versionMatch[1], 10) : 1;
    const rawProjectID = (projectID || '').replace('b.', '');
    // Match the URL format Forma web uses (and that Forma deep-links to):
    //   .eu host for EMEA-hosted projects (URN includes "wipemea"),
    //     .com otherwise.
    //   entityId is the *lineage* URN (itemID), not the version URN — the
    //     web UI then opens the latest version automatically.
    //   folderUrn must be URI-encoded (raw colons in the URL break the
    //     deep-link in some browsers).
    const region = (item.itemID || item.folderID || '').includes('wipemea') ? 'eu' : 'com';
    const fileUrl = item.itemID && item.folderID
      ? `https://acc.autodesk.${region}/docs/files/projects/${rawProjectID}?folderUrn=${encodeURIComponent(item.folderID)}&entityId=${encodeURIComponent(item.itemID)}&viewModel=detail&moduleId=folders`
      : '';

    folderPaths.push(item.folderPath);
    originalFileData.push(item);
    files.push({
      name: item.Name,
      accversion: accversion,
      file_url: fileUrl,
      revision: undefined,
      folder_path: item.folderPath,
      folderid: item.folderID,
      function: '',
      file_description: undefined,
      title_line_1: undefined,
      title_line_2: undefined,
      title_line_3: undefined,
      title_line_4: undefined,
      last_modified_user: item.lastModifiedUserName,
      last_modified_date: item.lastModifiedTime,
      created_by_user: item.createUserName,
      status: '',
      activity_code: undefined,
      id: item.itemIdVersion,
      itemID: item.itemID,
      deliverable: '',
      discipline: '',
      form: '',
      project_pin: '',
      spatial: '',
      originator: '',
      notes: undefined,
      tracking_status: undefined,
      category: undefined,
      planned_start_date: undefined,
      actual_start_date: undefined,
      actual_finish_date: undefined,
      planned_finish_date: undefined,
    });
  }

  function calculatePercentage(part, total) {
    if (total === 0) {
      return 0; // Avoid division by zero
    }
    const percentage = (part / total) * 100;
    return parseFloat(percentage.toFixed(2)); // Round to 2 decimal places
  }
  async function runChecks(tableType) {
    countRowsInTable(tableType);

    if (selectedTab == "MIDP") {
      await statusCheck();
    }
    
    if(!isClient){
      await revisionCheck();
      await descriptionlineCheck();
      await titlelineCheck();
      const filesData = await getUniqueValues(mainFileArray)
      await invalidFileCheck(filesData);
      complianceCalc(filesData);
    }
  }

async function getUniqueValues(array) {
  const result = array.reduce((acc, item) => {
    // Split .id at '?' and use the first part as the key
    const idKey = item.id.split('?')[0];
  
    const existing = acc[idKey];
    if (!existing || item.accversion > existing.accversion) {
      acc[idKey] = item;
    }
    return acc;
  }, {});
  
  const uniqueByIdWithHighestVersion = Object.values(result);
  return uniqueByIdWithHighestVersion
}

  function complianceCalc(data) {
    totals = 0;
    overall = 0;
    overallComplianceScore = document.getElementById("OverallCompliance");
    //overallComplianceScore.innerHTML = `Overall Project Compliance: ${}%`
    console.log(data)
    totals = data.length;
    console.log(totals)
    invalidFilesCount = invalidObjects.length;
    overall =
      titleLinePresentCount +
      statusPresentCount +
      revisionPresentCount +
      descriptionPresentCount;
    overallTotal = totals * 4;
    overallComplianceChart = newGaugeChartdata(
      overallComplianceChart,
      "OverallCompliance",
      "Overall Project Compliance",
      calculatePercentage(overall, overallTotal),
      100 - calculatePercentage(overall, overallTotal),
      100,
      true
    );
    filesWithMissingDataChart = newGaugeChartdata(
      filesWithMissingDataChart,
      "StatusCompliance",
      "Files with Missing Metadata",
      invalidFilesCount,
      totals - invalidFilesCount,
      totals,
      false,
      true
    );
  }

  function processCSVResponseArray(fileDataArray, mainStoreArray) {
    fileDataArray.forEach((fileData) => {
      console.log(`Processing file: ${fileData.fileName}`);
  
      // Check if the file content has a Base64-encoded $content field
      if (fileData.fileContent && fileData.fileContent.$content) {
        // Decode the Base64 content
        const decodedContent = atob(fileData.fileContent.$content);
        //console.log(decodedContent)
        // If the file is CSV, convert the decoded content to an array
        if (fileData.fileType === "csv") {
          try {
            const csvArray = csvToArray(decodedContent);
  
            // Store the array in the csvDataStore object with the file name as the key
  
            // Filter the array by the bim360_project_id field and projectID
            rawProjectID = projectID.split(".")[1];
            const filteredArray = csvArray.filter(
              (row) => row.bim360_project_id === rawProjectID
            );
            mainStoreArray[fileData.fileName] = filteredArray;
            // Output the filtered array for debugging
            console.log(`Filtered data for ${fileData.fileName}:`, filteredArray);
          } catch (error) {
            console.error("Error processing CSV:", error);
          }
        } else {
          console.log(`Non-CSV file content for ${fileData.fileName}`);
        }
      } else {
        console.error(`Unexpected file content type for ${fileData.fileName}`);
      }
    });
  }
  
  // CSV to Array conversion function
  function csvToArray(csvText) {
    const result = Papa.parse(csvText, {
      header: true, // Treat the first row as headers
      skipEmptyLines: true, // Skip empty rows
      dynamicTyping: true, // Automatically type cast fields
    });
  
    if (result.errors.length) {
      console.error("Errors while parsing CSV:", result.errors);
    }
  
    return result.data; // Parsed data as an array of objects
  }

  async function getNSArray() {
    await getNamingStandardID(files);
  
    namingstandard = await getNamingStandardforproject(
      accesToken,
      namingstandardID,
      rawProjectID
    );
    console.log(namingstandard);
    arrayDiscipline = namingstandard.find((item) => item.name === "Discipline");
    arrayDiscipline = arrayDiscipline ? arrayDiscipline.options : [];
    arrayFunction = namingstandard.find((item) => item.name === "Function");
    arrayFunction = arrayFunction ? arrayFunction.options : [];
    arrayProjectPin = namingstandard.find((item) => item.name === "Project Pin" || item.name === "Project PIN");
    arrayProjectPin = arrayProjectPin ? arrayProjectPin.options : [];
    arrayForm = namingstandard.find((item) => item.name === "Form");
    arrayForm = arrayForm ? arrayForm.options : [];
    console.log(arrayDiscipline);
    console.log(arrayForm);
    console.log(arrayProjectPin);
  }

  async function getNamingStandardID(folderArray) {
    wipFolderID = fileData.folderData.filter((item) => {
      return item.folderPath.includes("0C.WIP") || item.folderPath.includes("0C.KELTBRAY/WIP");
  });
    console.log("Keltrbay WIP Folder for NS", wipFolderID[0]);
    defaultFolder = wipFolderID[0].folderID;
    returnData = await getFolderDetails(accesToken, rawProjectID, defaultFolder);
  
    console.log(returnData);
    namingstandardID =
      returnData.data.attributes.extension.data.namingStandardIds[0];
    console.log(namingstandardID);
  
    return;
  }

  async function matchUpDataReviews() {
    const reviewListArray = csvDataReviewStore.reviews_reviews;
    const reviewDocumentsArray = csvDataReviewStore.reviews_review_documents;
    const reviewRecipientsArray =
      csvDataReviewStore.transmittals_transmittal_recipients;
  
    ReviewData = reviewListArray.map((workflowTransmittal) => {
      // Find all matching documents where workflow_transmittal_id matches workflowTransmittal.id
      const matchingDocuments = reviewDocumentsArray.filter(
        (document) => document.review_id === workflowTransmittal["ï»¿id"]
      );
      //const matchingRecipients = transmittalRecipientsArray.filter(recipient => recipient.review_id === workflowTransmittal['ï»¿id']);
      // Combine the workflowTransmittal with its matching documents
      return {
        ...workflowTransmittal,
        Documents: matchingDocuments, // Add the matching documents to the workflow transmittal
        //Recipients: matchingRecipients
      };
    });
  
    // Log the matched results to the console
    console.log("ReviewData", ReviewData);
  }
  async function matchUpDataTransmittal() {
    const transmittalListArray =
      csvDataTransmittalStore.transmittals_workflow_transmittals;
    const transmittalDocumentsArray =
      csvDataTransmittalStore.transmittals_transmittal_documents;
    const transmittalRecipientsArray =
      csvDataTransmittalStore.transmittals_transmittal_recipients;
  
    TransmittalData = transmittalListArray.map((workflowTransmittal) => {
      // Find all matching documents where workflow_transmittal_id matches workflowTransmittal.id
      const matchingDocuments = transmittalDocumentsArray.filter(
        (document) =>
          document.workflow_transmittal_id === workflowTransmittal["ï»¿id"]
      );
      const matchingRecipients = transmittalRecipientsArray.filter(
        (recipient) =>
          recipient.workflow_transmittal_id === workflowTransmittal["ï»¿id"]
      );
      // Combine the workflowTransmittal with its matching documents
      return {
        ...workflowTransmittal,
        Documents: matchingDocuments, // Add the matching documents to the workflow transmittal
        Recipients: matchingRecipients,
      };
    });
  
    // Log the matched results to the console
    console.log("TransmittalData", TransmittalData);
  }

  async function generateArrays() {
    orginalACCExport.forEach(async item => {
      // console.log(item)
      await addToFilesArray(item);
    });
    
  }

  function pivotData(rawData) {
    // Group rows by fileName
    const grouped = {};
    rawData.forEach((row) => {
      const key = row.name;
      if (!grouped[key]) {
        grouped[key] = {
          fileName: row.name,
          fileURL: row.file_url || "",
          fileDescription: row.file_description || "",
          titleLine: `${row.title_line_1 || ""} ${row.title_line_2 || ""} ${row.title_line_3 || ""} ${row.title_line_4 || ""}` ,
          status: row.status || "",
          revisions: []
        };
      }
      grouped[key].revisions.push({
        revision: row.revision,
        issuedDate: new Date(row.last_modified_date).toLocaleString()
      });
    });
  console.log(grouped)
    // Build a pivoted array
    // Build a pivoted array with only one instance per revision (earliest by issue date)
  const pivotedData = [];
  for (const fileKey in grouped) {
    const fileObj = grouped[fileKey];
    const pivotRow = {
      fileName: fileObj.fileName,
      fileURL: fileObj.fileURL,
      fileDescription: fileObj.fileDescription,
      titleLine: fileObj.titleLine,
      status: fileObj.status
    };

    // Create an object to keep unique revisions
    const uniqueRevisions = {};

    // Loop over revisions to keep only the earliest issuedDate per revision
    fileObj.revisions.forEach((rev) => {
      // If this revision doesn't exist or current date is earlier, update it
      if (!uniqueRevisions[rev.revision]) {
        uniqueRevisions[rev.revision] = rev;
      } else {
        const existingDate = new Date(uniqueRevisions[rev.revision].issuedDate);
        const currentDate = new Date(rev.issuedDate);
        if (currentDate < existingDate) {
          uniqueRevisions[rev.revision] = rev;
        }
      }
    });

    // Convert unique revisions object to an array and sort by issuedDate (ascending)
    const uniqueRevisionArray = Object.values(uniqueRevisions).sort((a, b) => {
      return new Date(a.issuedDate) - new Date(b.issuedDate);
    });

    // Add each unique revision to the pivot row with columns Rev1, Rev1 Issued, etc.
    uniqueRevisionArray.forEach((rev, index) => {
      const revNum = index + 1;
      pivotRow[`Rev${revNum}`] = rev.revision;
      pivotRow[`Rev${revNum} Issued`] = rev.issuedDate;
    });

    pivotedData.push(pivotRow);
  }
  return pivotedData;
}
  