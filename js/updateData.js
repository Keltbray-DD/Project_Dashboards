document.addEventListener('DOMContentLoaded', function() {
  console.log(1)
  // Get the toggle button and all editable cells
  toggleEditBtn = document.getElementById('toggleEditBtn');
  editableCells = document.querySelectorAll('.editable');

  let editMode = false; // Keep track of whether cells are editable or not

  // Define an array where each value corresponds to a column
  const columnNames = [{columnName:"Name",columnId:12345}, {columnName:"Age",columnId:54321}];

  // Function to toggle the editable state of the cells
  function toggleEditMode() {
    editMode = !editMode; // Toggle edit mode

    editableCells.forEach(cell => {
      cell.contentEditable = editMode; // Enable or disable contenteditable
    });

    // Update button text
    toggleEditBtn.textContent = editMode ? 'Disable Edit Mode' : 'Enable Edit Mode';
  }

  // Add click event listener to the toggle button
  toggleEditBtn.addEventListener('click', toggleEditMode);

  // Attach the 'blur' event listener only once, when the DOM is fully loaded
  editableCells.forEach(cell => {
    cell.addEventListener('blur', function() {
      if (editMode) {  // Only run the code if in edit mode
        // Find the parent row (tr) of the cell
        const row = this.closest('tr');
        
        // Get the data-id attribute from the row
        const dataId = row.getAttribute('data-id');
        
        // Get the index of the column (cell index within the row)
        const columnIndex = this.cellIndex;

        // Get the corresponding column name from the array
        const columnName = columnNames[columnIndex].columnId;

        // Log the data-id, column index, column name, and updated content
        console.log('Row Data-ID:', dataId);
        console.log('Column Index:', columnIndex);
        console.log('Column Name:', columnName);
        console.log('Cell content updated:', this.textContent);
      }
    });
  });

  // Initialize cells as non-editable (read-only) by default
  //toggleEditMode(); // Calls the function once to set the initial state
});

async function postCustomItemDetails(AccessToken,columnID,updatedValue,fileID){
  fileURN = encodeURIComponent(fileID)
    const bodyData = [
        {
          "id": columnID,
          "value": updatedValue
        }
      ];

    const headers = {
        'Authorization':"Bearer "+AccessToken,
        'Content-Type': 'application/json',
    };

    const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyData)
    };

    const apiUrl = "https://developer.api.autodesk.com/bim360/docs/v1/projects/"+projectID+"/versions/"+fileURN+"/custom-attributes:batch-update";
    console.log(apiUrl)
    console.log(requestOptions)
    signedURLData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data
        console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata
        })
        .catch(error => console.error('Error fetching data:', error));
    return signedURLData
    }