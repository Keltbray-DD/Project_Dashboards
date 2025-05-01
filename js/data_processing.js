async function processData(data, fileName, updated, Project_Name, folders) {
  // tempData = await convertStringToJSON(data);
  // folderArray = await convertStringToJSON(folders)

  console.log(fileName, data);

  fileData = {
    updated: updated,
    data: data,
    folderData: folders,
  };
  sessionStorage.setItem('projectData',fileData)
  console.log(fileData);
  projectName = Project_Name;
  document.getElementById("dataInfo").textContent = `Data Extract: ${formatDate(
    fileData.updated
  )}`;
  document.getElementById(
    "title"
  ).innerHTML = `${projectName} - ACC Docs Dashboard`;
  document.title = `${projectName} ACC Docs Dashboard`;

  orginalACCExport = fileData.data;

  await generateArrays()
  console.log(folderPaths)
  await loadTables()
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
    folderPaths.push(item.folder_path);
    originalFileData.push(item);
    files.push({
      name: item.name,
      accversion: item.accversion,
      file_url: item.file_url,
      revision: item.revision,
      folder_path: item.folder_path,
      folderid: item.folderid,
      function: item.function,
      file_description: item.file_description,
      title_line_1: item.title_line_1,
      title_line_2: item.title_line_2,
      title_line_3: item.title_line_3,
      title_line_4: item.title_line_4,
      last_modified_user: item.last_modified_user,
      last_modified_date: item.last_modified_date,
      created_by: item.created_by_user,
      status: item.status,
      activity_code: item.activity_code,
      id: item.id,
      // id_no_version: item.id.split("?")[0],
      deliverable: item.deliverable || '',
      discipline: item.discipline,
      form: item.form,
      project_pin: item.project_pin,
      spatial: item.spatial,
      originator: item.originator,
      notes: item.notes,
      tracking_status: item.tracking_status,
      category: item.category,
      planned_start_date: item.planned_start_date,
      actual_start_date: item.actual_start_date,
      actual_finish_date: item.actual_finish_date,
      planned_finish_date: item.planned_finish_date,
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
  