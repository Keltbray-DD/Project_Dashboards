async function getJSONDataFromSP() {
  const bodyData = {
    project_Name: projectName,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(bodyData),
  };

  const apiUrl =
    "https://default917b4d06d2e9475983a3e7369ed74e.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/aa3b3f6ba93f4901acef15184cd5b8de/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=rsVMeC9t3eP3LkX1-vcOI2Xk4M-aopqMjV8W_7Y-LF4";
  //console.log(apiUrl)
  //console.log(requestOptions)
  signedURLData = await fetch(apiUrl, requestOptions)
    .then((response) => response.json())
    .then((data) => {
      const JSONdata = data;
      console.log(JSONdata);
      //console.log(JSONdata.uploadKey)
      //console.log(JSONdata.urls)
      return JSONdata;
    })
    .catch((error) => console.error("Error fetching data:", error));
  return signedURLData;
}

async function getData() {
  rawData = await getJSONDataFromSP(projectName);
  if (rawData.type == "framework") {
    let filesList = [];
    let folderArrayDeliverables = [];
    for (let index = 0; index < rawData.data.length; index++) {
      const element = rawData.data[index];
      console.log(element);
      const tempFilesList = await convertStringToJSON(element.files_list);
      const tempFolderArrayDeliverables = await convertStringToJSON(
        element.folder_array_deliverables
      );
      console.log(tempFilesList);
      console.log(tempFolderArrayDeliverables);
      if (!tempFilesList || !tempFolderArrayDeliverables) {
      } else {
        filesList = filesList.concat(tempFilesList);
        folderArrayDeliverables = folderArrayDeliverables.concat(
          tempFolderArrayDeliverables
        );
      }
    }
    console.log(
      rawData.data[0].Title,
      rawData.data[0].Modified,
      rawData.data[0].ProjectName,
      folderArrayDeliverables,
      filesList
    );
    await processData(
      rawData.data[0].Title,
      rawData.data[0].Modified,
      rawData.data[0].ProjectName,
      folderArrayDeliverables,
      filesList
    );
  } else {
    rawFileData = rawData.data;
    console.log("rawFileData", rawFileData);
    rawFileData.forEach(async (element) => {
      await processData(
        element.Title,
        element.Modified,
        element.ProjectName,
        await convertStringToJSON(element.folder_array_deliverables),
        await convertStringToJSON(element.files_list)
      );
    });
  }
}

// Fetches all versions of a single file lineage. Used by the lazy
// version-expand on the MIDP table — when the user clicks the chevron we
// hit this for that one file and then batch-get custom attributes for the
// returned versions.
async function getItemVersions(accessToken, rawProjectID, lineageURN) {
  const headers = {
    Authorization: "Bearer " + accessToken,
  };
  const requestOptions = { method: "GET", headers: headers };
  const apiUrl =
    "https://developer.api.autodesk.com/data/v1/projects/b." +
    rawProjectID +
    "/items/" +
    encodeURIComponent(lineageURN) +
    "/versions";
  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      console.error("getItemVersions failed with HTTP " + response.status);
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching item versions:", error);
    return [];
  }
}

// Fetches custom attribute values for a chunk of version URNs via the ACC
// batch-get endpoint. Returns the `results` array verbatim — caller is
// responsible for matching results back to its URNs (the API preserves
// input order; unknown URNs are silently dropped, so length may be < urns
// if any are stale/deleted/permission-denied).
async function getCustomDetailsBatch(accessToken, urns) {
  const rawProjectID = (projectID || "").replace("b.", "");
  const headers = {
    Authorization: "Bearer " + accessToken,
    "Content-Type": "application/json",
  };
  const requestOptions = {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ urns: urns }),
  };
  const apiUrl =
    "https://developer.api.autodesk.com/bim360/docs/v1/projects/" +
    rawProjectID +
    "/versions:batch-get";
  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      console.error(
        "versions:batch-get failed with HTTP " + response.status,
        await response.text().catch(() => "")
      );
      return [];
    }
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Error fetching custom attributes:", error);
    return [];
  }
}

async function getCustomDetailsData() {
  try {
    accesToken = await getAccessToken("data:read data:write");
  } catch (error) {
    console.error("Error:", error);
  }
  rootData = await getProjectTopFolder(accesToken, hubID, projectID);
  ProjectFiles = rootData.data.filter((item) => {
    return item.attributes.name === "Project Files";
  });
  startFolderID = ProjectFiles[0].id;

  customAttributes = await getItemDetails(accesToken, startFolderID);
  console.log("Custom Attributes:", customAttributes);

  titleline1ID = await findObjectByName("Title Line 1", customAttributes);
  titleline2ID = await findObjectByName("Title Line 2", customAttributes);
  titleline3ID = await findObjectByName("Title Line 3", customAttributes);
  titleline4ID = await findObjectByName("Title Line 4", customAttributes);
  revisionCodeID = await findObjectByName("Revision", customAttributes);
  revisionDescID = await findObjectByName(
    "Revision Description",
    customAttributes
  );
  statusCodeID = await findObjectByName("Status", customAttributes);

  activityCodeID = await findObjectByName("Activity Code", customAttributes);
  ClassificationID = await findObjectByName("Classification", customAttributes);
  FileDescriptionID = await findObjectByName(
    "File Description",
    customAttributes
  );
  StateID = await findObjectByName("State", customAttributes);

  trackingStatusID = await findObjectByName(
    "Tracking Status",
    customAttributes
  );
  notesID = await findObjectByName("Notes", customAttributes);
  categoryID = await findObjectByName("Category", customAttributes);
  actualStartDateID = await findObjectByName(
    "Actual Start Date",
    customAttributes
  );
  plannedStartDateyID = await findObjectByName(
    "Planned Start Date",
    customAttributes
  );
  actualFinishDateID = await findObjectByName(
    "Actual Finish Date",
    customAttributes
  );
  plannedFinishDateyID = await findObjectByName(
    "Planned Finish Date",
    customAttributes
  );

  switch (projectID) {
    case "76c59b97-feaf-413c-9bd0-43cf8aaa3133":
      seriesID = await findObjectByName("Series", customAttributes);
      if((tableType || '').includes('Drawing Register')){
        columnNamesDefault = [
          { columnName: "revision", columnIndex: 4, columnId: revisionCodeID.id },
          {
            columnName: "file_description",
            columnIndex: 6,
            columnId: FileDescriptionID.id,
          },
          {
            columnName: "title_line_1",
            columnIndex: 7,
            columnId: titleline1ID.id,
          },
          { columnName: "status", columnIndex: 8, columnId: statusCodeID.id },

          
          {
            columnName: "activity_code",
            columnIndex: 12,
            columnId: activityCodeID.id,
          },

        ];
      }else{
        columnNamesDefault = [
          { columnName: "revision", columnIndex: 4, columnId: revisionCodeID.id },
          {
            columnName: "file_description",
            columnIndex: 6,
            columnId: FileDescriptionID.id,
          },
          {
            columnName: "title_line_1",
            columnIndex: 7,
            columnId: titleline1ID.id,
          },
          {
            columnName: "title_line_2",
            columnIndex: 8,
            columnId: titleline2ID.id,
          },
          {
            columnName: "title_line_3",
            columnIndex: 9,
            columnId: titleline3ID.id,
          },
          {
            columnName: "title_line_4",
            columnIndex: 10,
            columnId: titleline4ID.id,
          },
          { columnName: "status", columnIndex: 11, columnId: statusCodeID.id },
          {
            columnName: "activity_code",
            columnIndex: 12,
            columnId: activityCodeID.id,
          },
          { columnName: "series", columnIndex: 13, columnId: seriesID.id },
        ];
      }
      
      break;

    default:      
    if(tableType.includes('Drawing Register')){
      columnNamesDefault = [
        { columnName: "revision", columnIndex: 4, columnId: revisionCodeID.id },
        {
          columnName: "file_description",
          columnIndex: 6,
          columnId: FileDescriptionID.id,
        },
        {
          columnName: "title_line_1",
          columnIndex: 7,
          columnId: titleline1ID.id,
        },
        { columnName: "status", columnIndex: 8, columnId: statusCodeID.id },
      ];
    }else{
      columnNamesDefault = [
        { columnName: "revision", columnIndex: 4, columnId: revisionCodeID.id },
        {
          columnName: "file_description",
          columnIndex: 6,
          columnId: FileDescriptionID.id,
        },
        {
          columnName: "title_line_1",
          columnIndex: 7,
          columnId: titleline1ID.id,
        },
        {
          columnName: "title_line_2",
          columnIndex: 8,
          columnId: titleline2ID.id,
        },
        {
          columnName: "title_line_3",
          columnIndex: 9,
          columnId: titleline3ID.id,
        },
        {
          columnName: "title_line_4",
          columnIndex: 10,
          columnId: titleline4ID.id,
        },
        { columnName: "status", columnIndex: 11, columnId: statusCodeID.id },
        {
          columnName: "activity_code",
          columnIndex: 12,
          columnId: activityCodeID.id,
        },
      ];
    }

      break;
  }
  if (projectID === "2e6449f9-ce25-4a9c-8835-444cb5ea03bf") {
    columnNamesMDR = [
      { columnName: "revision", columnIndex: 3, columnId: revisionCodeID.id },
      { columnName: "title", columnIndex: 4, columnId: titleline1ID.id },
      //{columnName:"folder_path",columnIndex:5,columnId:folder_path.id},
      { columnName: "category", columnIndex: 6, columnId: categoryID.id },
      { columnName: "status", columnIndex: 7, columnId: trackingStatusID.id },
      { columnName: "notes", columnIndex: 8, columnId: notesID.id },
      {
        columnName: "planned_start_date",
        columnIndex: 9,
        columnId: plannedStartDateyID.id,
      },
      {
        columnName: "actual_start_date",
        columnIndex: 10,
        columnId: actualStartDateID.id,
      },
      {
        columnName: "planned_finish_date",
        columnIndex: 11,
        columnId: plannedFinishDateyID.id,
      },
      {
        columnName: "actual_finish_date",
        columnIndex: 12,
        columnId: actualFinishDateID.id,
      },
    ];
  }

  console.log(columnNamesDefault);
}

async function getItemDetails(AccessToken, FolderID) {
  const headers = {
    Authorization: "Bearer " + AccessToken,
  };

  const requestOptions = {
    method: "GET",
    headers: headers,
  };

  const apiUrl =
    "https://developer.api.autodesk.com/bim360/docs/v1/projects/" +
    projectID.replace("b.", "") +
    "/folders/" +
    FolderID +
    "/custom-attribute-definitions";
  //console.log(apiUrl)
  //console.log(requestOptions)
  signedURLData = await fetch(apiUrl, requestOptions)
    .then((response) => response.json())
    .then((data) => {
      const JSONdata = data;
      //console.log(JSONdata)
      //console.log(JSONdata.uploadKey)
      //console.log(JSONdata.urls)
      return JSONdata.results;
    })
    .catch((error) => console.error("Error fetching data:", error));
  return signedURLData;
}

async function getProjectTopFolder(accessTokenDataRead, hubID, projectID) {
  const bodyData = {};

  const headers = {
    Authorization: "Bearer " + accessTokenDataRead,
    //'Content-Type':'application/json'
  };

  const requestOptions = {
    method: "GET",
    headers: headers,
    //body: JSON.stringify(bodyData)
  };

  const apiUrl =
    "https://developer.api.autodesk.com/project/v1/hubs/" +
    hubID +
    "/projects/b." +
    projectID.replace("b.", "") +
    "/topFolders";
  //console.log(apiUrl)
  //console.log(requestOptions)
  responseData = await fetch(apiUrl, requestOptions)
    .then((response) => response.json())
    .then((data) => {
      const JSONdata = data;

      //console.log(JSONdata)

      return JSONdata;
    })
    .catch((error) => console.error("Error fetching data:", error));

  return responseData;
}

async function getAccessToken(scopeInput) {
  const bodyData = {
    scope: scopeInput,
  };

  const headers = {
    "Content-Type": "application/json",
  };

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(bodyData),
  };

  const apiUrl =
    "https://default917b4d06d2e9475983a3e7369ed74e.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/df0aebc4d2324e98bcfa94699154481f/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=igiodIb-lGf7MTGYIlPATMr-JbyDeztuALW5F6IIaNs";
  //console.log(apiUrl)
  //console.log(requestOptions)
  signedURLData = await fetch(apiUrl, requestOptions)
    .then((response) => response.json())
    .then((data) => {
      const JSONdata = data;

      //console.log(JSONdata)

      return JSONdata.access_token;
    })
    .catch((error) => console.error("Error fetching data:", error));

  return signedURLData;
}

async function getFolderDetails(accessTokenDataRead, projectID, folderID) {
    const headers = {
      Authorization: "Bearer " + accessTokenDataRead,
    };
  
    const requestOptions = {
      method: "GET",
      headers: headers,
    };
  
    const apiUrl =
      "https://developer.api.autodesk.com/data/v1/projects/b." +
      projectID +
      "/folders/" +
      folderID;
    //console.log(apiUrl)
    //console.log(requestOptions)
    responseData = await fetch(apiUrl, requestOptions)
      .then((response) => response.json())
      .then((data) => {
        const JSONdata = data;
        //console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata;
      })
      .catch((error) => console.error("Error fetching data:", error));
    return responseData;
  }

async function getNamingStandardforproject(access_token, ns_id, project_id) {
    const headers = {
      Authorization: "Bearer " + access_token,
    };
  
    const requestOptions = {
      method: "GET",
      headers: headers,
    };
  
    const apiUrl =
      "https://developer.api.autodesk.com/bim360/docs/v1/projects/" +
      project_id +
      "/naming-standards/" +
      namingstandardID;
    //console.log(apiUrl)
    //console.log(requestOptions)
    responseData = await fetch(apiUrl, requestOptions)
      .then((response) => response.json())
      .then((data) => {
        const JSONdata = data;
        //console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata.definition.fields;
      })
      .catch((error) => console.error("Error fetching data:", error));
    return responseData;
  }

async function fetchReviewData() {
    const response = await fetch(
      "https://default917b4d06d2e9475983a3e7369ed74e.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/541207f0087a4e06840db05622c13314/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=acKJ5VM5qw9BHOTe2YqiYrQMKYI0TFkP96zlNbIurTg",
      {
        method: "GET",
        headers: {
          Accept: "application/json", // Ensure you're receiving JSON
        },
      }
    );
  
    if (response.ok) {
      const fileDataArray = await response.json();
      console.log(fileDataArray);
      processCSVResponseArray(fileDataArray, csvDataReviewStore);
  
      // Example: Access a stored array by file name after the loop
      console.log("Stored CSV Review arrays:", csvDataReviewStore);
  
      // You can now use csvDataStore for further filtering or processing
    } else {
      console.error("Error fetching files:", response.status);
    }
  }

async function fetchTransmittalData() {
    const response = await fetch(
      "https://default917b4d06d2e9475983a3e7369ed74e.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/42ed32848c554de6941a862147e7c2f0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=4A3a3-j168U3dOTXk8SmYaUBzRR9I6XfmpRyNmpwAGw",
      {
        method: "GET",
        headers: {
          Accept: "application/json", // Ensure you're receiving JSON
        },
      }
    );
  
    if (response.ok) {
      const fileDataArray = await response.json();
      console.log(fileDataArray);
      processCSVResponseArray(fileDataArray, csvDataTransmittalStore);
  
      // Example: Access a stored array by file name after the loop
      console.log("Stored CSV Transmittal arrays:", csvDataTransmittalStore);
  
      // You can now use csvDataStore for further filtering or processing
    } else {
      console.error("Error fetching files:", response.status);
    }
  }