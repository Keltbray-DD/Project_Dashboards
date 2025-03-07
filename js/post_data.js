async function patchDataToACC(editMode, cell) {
    if (editMode) {
      // Only run the code if in edit mode
      // Find the parent row (tr) of the cell
      const row = cell.closest("tr");
  
      // Get the data-id attribute from the row
      const dataId = row.getAttribute("data-id");
  
      // Get the index of the column (cell index within the row)
      const columnIndex = cell.cellIndex;
      console.log(columnNames);
      // Get the corresponding column name from the array
      const columnData = columnNames.find(
        (column) => column.columnIndex === columnIndex
      );
      let found = files.find((item) => item.id === dataId);
      // Log the data-id, column index, column name, and updated content
  
      if (
        cell.textContent !== "Missing" &&
        found[columnData.columnName] !== cell.textContent
      ) {
        console.log("Row Data-ID:", dataId);
        console.log("Column ID:", columnData.columnId);
        console.log("Cell content updated:", cell.textContent);
        found[columnData.columnName] = cell.textContent;
        postCustomItemDetails(
          accesToken,
          columnData.columnId,
          cell.textContent,
          dataId
        );
        showPopup(
          `${found.name} Updated`,
          `${found.name} field ${columnData.columnName} has been updated to ${cell.textContent}`
        );
      } else {
        console.log("Attribute not updated: ", dataId);
      }
    }
  }

  async function postCustomItemDetails(
    AccessToken,
    columnID,
    updatedValue,
    fileID
  ) {
    fileURN = encodeURIComponent(fileID);
    const bodyData = [
      {
        id: columnID,
        value: updatedValue,
      },
    ];
  
    const headers = {
      Authorization: "Bearer " + AccessToken,
      "Content-Type": "application/json",
    };
  
    const requestOptions = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(bodyData),
    };
  
    const apiUrl =
      "https://developer.api.autodesk.com/bim360/docs/v1/projects/" +
      projectID +
      "/versions/" +
      fileURN +
      "/custom-attributes:batch-update";
    console.log(apiUrl);
    console.log(requestOptions);
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

  