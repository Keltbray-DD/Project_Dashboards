document.addEventListener('DOMContentLoaded',async function(){
    table = document.querySelector('#dataTable');
    tableBody = document.querySelector('#dataTable tbody');
    tableHeader = document.getElementById('dataTable');
    searchInput = document.getElementById('searchInput');
    folderFilter = document.getElementById('folderFilter');

    document.getElementById("MIDP").style.display = "block";
    document.getElementById("chartsSection").style.display = "block"
    
    getProjectFromURL()
    
    getData().then(() => {
        //createFilterOptions()
    })

    // Button visability //
    // MIDP
    if(projects_MIDPs.some(item => item.id === projectID) == false){
        document.getElementById('MIDP_Button').style.display = 'none'
    }

    // Drawing Register
    if(projects_DR.some(item => item.id === projectID) == false){
        document.getElementById('DrawingRegister_Button').style.display = 'none'
    }

    // Transmittal Register
    if(projects_TR.some(item => item.id === projectID) == false){
        document.getElementById('TransmittalRegister_Button').style.display = 'none'
    }

    // MDR
    if(projects_MDR.some(item => item.id === projectID) == false){
        document.getElementById('MDR_Button').style.display = 'none'
    }


    rows = tableBody.getElementsByTagName('tr');
    
    searchInput.addEventListener('keyup', function () {

        const filter = searchInput.value.toLowerCase();

        for (let i = 0; i < rows.length; i++) { // Start at 1 to skip the header row
            const cells = rows[i].getElementsByTagName('td');
            let match = false;

            for (let j = 0; j < cells.length; j++) {
                if (cells[j].textContent.toLowerCase().includes(filter)) {
                    match = true;
                    break;
                }
            }

            if (match) {
                rows[i].style.display = ''; // Show the row
            } else {
                rows[i].style.display = 'none'; // Hide the row
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

    window.addEventListener('beforeunload', function(event) {
        if (editMode) {
          console.log("User is in edit mode. Showing the beforeunload prompt.");
          event.preventDefault();
          event.returnValue = ''; // Display the default browser alert message
          return ''; // For older browsers
        }
      });
    // Get all toggle buttons
    const toggleHeaders = document.querySelectorAll('.toggle-header');

    // Add a click event listener to each button
    toggleHeaders.forEach(button => {
    button.addEventListener('click', function() {
        // Get the target section id from the data attribute
        const targetSectionId = this.getAttribute('data-target');
        const targetSection = document.getElementById(targetSectionId);
        const arrow = this.querySelector('.arrow');

        // Toggle the section's visibility
        targetSection.classList.toggle('hidden');

        // Change the arrow direction based on visibility
        if (targetSection.classList.contains('hidden')) {
        arrow.classList.remove('down');
        arrow.classList.add('left');
        } else {
        arrow.classList.remove('left');
        arrow.classList.add('down');
        }
    });
    });

})
async function generateHeadersParent(){
    switch (projectID) {
        case "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133":
            await generateMIDPHeaders(a66Headers)
            break;

        default:
            await generateMIDPHeaders(defaultHeaders)
            break;
    }
}

async function getJSONDataFromSP(project_id){

    const bodyData = {
        "project_ID":project_id
    };

    const headers = {
        'Content-Type':"application/json",
    };

    const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyData)
    };

    const apiUrl = "https://prod-29.uksouth.logic.azure.com:443/workflows/aa3b3f6ba93f4901acef15184cd5b8de/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=olW_Pb6Al6jJNptqxPXBc-_YBoqN2YOmYiYYBrqd1C8";
    //console.log(apiUrl)
    //console.log(requestOptions)
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

async function getData() {
    rawData = await getJSONDataFromSP(projectID)
    rawData.forEach(async element => {
        await processData(element.JSON_data, element.Title, element.Modified, element.Project_Name)
    });
}

async function processData(data, fileName, updated,Project_Name) {
    tempData = await convertStringToJSON(data)
    console.log(fileName,tempData)
    if(fileName.includes("ACC_Export") ){
        fileData = {
            "fileName": fileName,
            "updated":updated,
            "data":tempData
        }
        orginalACCExport = fileData.data
        document.getElementById('dateUpdated').innerHTML = `Export: ${formatDate(fileData.updated)}`
        document.getElementById('projectName').innerHTML = `${Project_Name}`
        projectName = Project_Name
        document.title = `${Project_Name} Project Data Overview`;
        await generateHeadersParent()
        generateMIDPTable()
    }
}

async function generateMIDPTable() {
    console.log('MIDP Table')
    resetValues()
    await generateFileTable(orginalACCExport)
    await runChecks()
    //populateFolderDropdown(folderPaths)
    generateCharts() 
    colourParentMissing()
    makeCellsEditable().then(() => {
        // Runs after getData completes
        columnEditing();
        addSortableColumns();
        createFilterOptions();
        });
    console.log("files",files)
}

async function generateTransmittalTable() {
    console.log('Transmittal Table')
    resetValues()
    await generateTransmittalFileTable(orginalACCExport)
    await runChecks()
    populateFolderDropdown(folderPaths)
    generateCharts()
    colourParentMissing()
    makeCellsEditable().then(() => {
        // Runs after getData completes
        columnEditing();
        addSortableColumns();
        });
}

function formatDate(isoDate) {
    const date = new Date(isoDate);

    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    };

    return date.toLocaleString('en-GB', options);
}

async function convertStringToJSON(JSONdata) {
    convertedData = JSON.parse(JSONdata)
    //console.log(convertedData)
    return convertedData
}

async function populateFolderDropdown(folderPaths) {
    const uniqueArray = folderPaths.filter((obj, index, self) => 
        index === self.findIndex((o) => o === obj)
    );

    // Populate the dropdown with folder paths
    uniqueArray.forEach(path => {
        const option = document.createElement('option');
        option.value = path;
        option.textContent = path;
        folderFilter.appendChild(option);
    });
}

async function generateFileTable(data) {

    const groupedData = await groupItemData(data)

    Object.values(groupedData).forEach(async (group) => {
        let mainItem = group[0];
        chartChecks(mainItem)
        checkFolder(mainItem.folder_path)
        await addToFilesArray(mainItem)
        await createMainTableRow(mainItem,group)
    });
    //console.log(files);
}

async function generateTransmittalFileTable(data) {

    const groupedData = await groupItemData(data)

    Object.values(groupedData).forEach(async (group) => {
        let mainItem = group[0];
        chartChecks(mainItem)
        checkFolder(mainItem.folder_path)
        await addToFilesArray(mainItem)
        await createTransmittalRow(mainItem,group)
    });
    //console.log(files);
}

async function groupItemData(data) {
    groupedData = data.reduce((acc, item) => {
        // Extract the id without the version part
        const itemIdNoVersion = item.id.split('?')[0];
    
        // Initialize the group if it doesn't exist
        acc[itemIdNoVersion] = acc[itemIdNoVersion] || [];
    
        // Push the current item into the group
        acc[itemIdNoVersion].push(item);
    
        // Optionally sort the items by accversion in descending order within the group
        acc[itemIdNoVersion].sort((a, b) => b.accversion - a.accversion);
    
        return acc;
    }, {});

    return groupedData
}

async function resetValues(){
    files = []
    tableBody.innerHTML = ''
    //folderFilter.options.length = 1
    folderPaths = []
    filteredData = []
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
    folderCount = []
}
async function chartChecks(item) {
    
    if (selectedTab == "DrawingRegister" && item.form != "DR") {
      return;
    }
    if (isMissing(item["title_line_1"])) {
      titleLineMissingCount++;
    } else {
      titleLinePresentCount++;
    }
    if (isMissing(item["revision"])) {
      revisionMissingCount++;
    } else if (!pattern.test(item["revision"])) {
      //console.log(item['revision'])
      revisionFormatCheckInvaildCount++;
    } else {
      revisionPresentCount++;
    }
    if (isMissing(item["file_description"])) {
      descriptionMissingCount++;
    } else if (item["file_description"] == "TIDP Placeholder File") {
      descriptionPlaceHolderCount++;
    } else {
      descriptionPresentCount++;
    }
    if (isMissing(item["status"])) {
      statusMissingCount++;
    } else {
      statusPresentCount++;
    }

      // Ensure the status field exists and is properly accessed
      const status = item["status"];
      if (status) {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      } else {
        // Handle cases where the status might be missing
        statusCounts["Missing"] = (statusCounts["Missing"] || 0) + 1;
      }
    
}

function isMissing(value) {
    return value === undefined || value === null || value === "";
  }

async function addToFilesArray(item) {
    folderPaths.push(item.folder_path)
    filteredData.push(item);
    files.push({
        name:item.name,
        accversion:item.accversion,
        file_url:item.file_url,
        revision:item.revision,
        folder_path:item.folder_path,
        folderid:item.folderid,
        file_description:item.file_description,
        title_line_1:item.title_line_1,
        title_line_2:item.title_line_2,
        title_line_3:item.title_line_3,
        title_line_4:item.title_line_4,
        last_modified_user:item.last_modified_user,
        last_modified_date:item.last_modified_date,
        created_by: item.created_by_user,
        status:item.status,
        activity_code:item.activity_code,
        id:item.id,
        discipline:item.discipline,
        form:item.form,
        spatial:item.spatial,
        notes:item.notes,
        tracking_status:item.tracking_status,
        category:item.category,
        planned_start_date: item.planned_start_date,
        actual_start_date: item.actual_start_date,
        actual_finish_date: item.actual_finish_date,
        planned_finish_date: item.planned_finish_date,
    })
}

async function generateCharts() {
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Title = document.getElementById('missingTitleDataChart').getContext('2d');
    const chartData_Title = {
        labels: ['Files with Title Line 1', 'Files without Title Line 1'],
        datasets: [{
            data: [titleLinePresentCount, titleLineMissingCount],
            backgroundColor: ['rgba(46, 204, 113, 0.6)', 'rgba(255, 99, 132, 0.6)'],
            borderColor: ['rgba(46, 204, 113, 1)', 'rgba(255, 99, 132, 1)'],
            borderWidth: 1
        }]
    };
    if(missingTitleDataChart){
        missingTitleDataChart.destroy();
    }
    missingTitleDataChart = new Chart(ctx_Title, {
        id: 0,
        type: 'pie',
        data: chartData_Title,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    datalabels: {
                        formatter: (value, ctx) => {
                            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = (value / total * 100).toFixed(2) + '%';
                            return percentage;
                        },
                        color: '#fff',
                    }
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "title_line_1"
                    const label = chartData_Title.labels[index];

                    filterTable(label);
                }
            }
        }
    });

    // Create the pie chart to show Title Line 1 data presence
    const ctx_Revision = document.getElementById('missingRevisionDataChart').getContext('2d');
    const chartData_Revision = {
        labels: ['Files with Revision', 'Files without Revision','Files with Invalid ISO Revision'],
        datasets: [{
            data: [revisionPresentCount, revisionMissingCount, revisionFormatCheckInvaildCount],
            backgroundColor: ['rgba(46, 204, 113, 0.6)', 'rgba(255, 99, 132, 0.6)','rgba(255, 219, 187, 0.6)'],
            borderColor: ['rgba(46, 204, 113, 1)', 'rgba(255, 99, 132, 1)','rgba(255, 219, 187, 1)'],
            borderWidth: 1
        }]
    };

    if(missingRevisionDataChart){
        missingRevisionDataChart.destroy();
    }

    missingRevisionDataChart = new Chart(ctx_Revision, {
        id: 1,
        type: 'pie',
        data: chartData_Revision,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                datalabels: {
                    formatter: (value, ctx) => {
                        const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percentage = (value / total * 100).toFixed(2) + '%';
                        return percentage;
                    },
                    color: '#000',
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "revision"
                    const label = chartData_Revision.labels[index];

                    filterTable(label);
                }
            }
        }
    });

    


    // Create the pie chart to show Title Line 1 data presence
    const ctx_Status = document.getElementById('missingStatusDataChart').getContext('2d');
    const chartData_Status = {
        labels: ['Files with Status', 'Files without Status'],
        datasets: [{
            data: [statusPresentCount, statusMissingCount],
            backgroundColor: ['rgba(46, 204, 113, 0.6)', 'rgba(255, 99, 132, 0.6)'],
            borderColor: ['rgba(46, 204, 113, 1)', 'rgba(255, 99, 132, 1)'],
            borderWidth: 1
        }]
    };

    if(missingStatusDataChart){
        missingStatusDataChart.destroy();
    }

    missingStatusDataChart = new Chart(ctx_Status, {
        id: 1,
        type: 'pie',
        data: chartData_Status,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    datalabels: {
                        formatter: (value, ctx) => {
                            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = (value / total * 100).toFixed(2) + '%';
                            return percentage;
                        },
                        color: '#fff',
                    }
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "status"
                    const label = chartData_Status.labels[index];

                    filterTable(label);
                }
            }
        }
    });
    // Create the bar chart to show Status data presence
    // Create the pie chart to show Title Line 1 data presence
    const ctx_Description = document.getElementById('missingDescriptionDataChart').getContext('2d');
    const chartData_Description = {
        labels: ['Files with Description', 'Files without Description', 'Files with Placeholder Description'],
        datasets: [{
            data: [descriptionPresentCount, descriptionMissingCount, descriptionPlaceHolderCount],
            backgroundColor: ['rgba(46, 204, 113, 0.6)', 'rgba(255, 99, 132, 0.6)','rgba(255, 219, 187, 0.6)'],
            borderColor: ['rgba(46, 204, 113, 1)', 'rgba(255, 99, 132, 1)','rgba(255, 219, 187, 1)'],
            borderWidth: 1
        }]
    };

    if(missingDescriptionDataChart){
        missingDescriptionDataChart.destroy();
    }

    missingDescriptionDataChart = new Chart(ctx_Description, {
        id: 1,
        type: 'pie',
        data: chartData_Description,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                    datalabels: {
                        formatter: (value, ctx) => {
                            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = (value / total * 100).toFixed(2) + '%';
                            return percentage;
                        },
                        color: '#fff',
                    }
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "description"
                    const label = chartData_Description.labels[index];

                    filterTable(label);
                }
            }
        }
    });
    // Generate colors with red for "Unknown"
    const labels = Object.keys(statusCounts);
    const backgroundColors = labels.map(label => label === 'Missing' ? 'rgba(255, 99, 132, 0.6)' : 'rgba(93, 173, 226, 0.6)');
    const borderColors = labels.map(label => label === 'Missing' ? 'rgba(255, 99, 132, 1)' : 'rgba(93, 173, 226, 1)');

    const ctx_statusCount = document.getElementById('StatusDataChart').getContext('2d');
    const chartData_statusCount = {
        labels: Object.keys(statusCounts),
        datasets: [{
            label: 'Number of Files',
            data: Object.values(statusCounts),
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1
        }]
    };

    if(statusChart){
        statusChart.destroy();
    }

    statusChart = new Chart(ctx_statusCount, {
        type: 'bar',
        data: chartData_statusCount,
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Files'
                    }
                },
                x: {
                    title: {
                        display: false,
                        text: 'Status'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    formatter: (value) => value,
                    color: '#000',
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "statusBar"
                    const label = chartData_statusCount.labels[index];

                    filterTable(label,field);
                }
            }
        }
    });

        // Generate colors with red for "Unknown"
        const ctx_folders_Count = document.getElementById('folderDataChart').getContext('2d');
    const chartData_folders_Count = {
        labels: Object.keys(folderCount),
        datasets: [{
            label: 'Number of Files',
            data: Object.values(folderCount),
            backgroundColor: ['rgba(247, 220, 111, 0.6)','rgba(133, 193, 233, 0.6)','rgba(165, 105, 189, 0.6)','rgba(205, 97, 85, 0.6)'],
            borderColor: ['rgba(247, 220, 111, 1)','rgba(133, 193, 233, 1)','rgba(165, 105, 189, 1)','rgba(205, 97, 85, 1)'],
            borderWidth: 1
        }]
    };

    if(folders_Chart){
        folders_Chart.destroy();
    }

    folders_Chart = new Chart(ctx_folders_Count, {
        type: 'bar',
        data: chartData_folders_Count,
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Files'
                    }
                },
                x: {
                    title: {
                        display: false,
                        text: 'Status'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    formatter: (value) => value,
                    color: '#000',
                }
            },
            onClick: (evt, activeElements) => {
                if (activeElements.length > 0) {
                    const datasetIndex = activeElements[0].datasetIndex;
                    const index = activeElements[0].index;
                    const field = "folderBar"
                    const label = chartData_folders_Count.labels[index];

                    filterTable(label,field);
                }
            }
        }
    });
}
    // Function to check for undefined, null, or blank fields in an object
    async function hasInvalidFields(obj, ignoredFields) {
        return Object.keys(obj).some(key => {
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
    function highlightCell(value,column) {
        const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
        if (value === undefined || value === null || value === '') {
            return `<span class="highlight">${value === undefined || value === null || value === '' ? 'Missing' : value}</span>`;
        } else if(!pattern.test(value) && column == "revisions"){
            const span = document.createElement('span')
            span.classList.add('highlight')
            span.classList.add('tooltip')
            //span.setAttribute('data-tooltip', "Incorrect format. Use formats like P01, C02, or P02.03");
            span.innerHTML = `${value}`
            return span //`<span class="highlight tooltip">${value}</span>`
        } else {
            return value;
        }
    }
        // Function to highlight cells if the data is undefined, null, or empty
        function highlightCellNotMandatory(value,column) {
            const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
            if (value === undefined || value === null || value === '') {
                return `<span class="highlightYellow">${value === undefined || value === null || value === '' ? 'Missing' : value}</span>`;
            }  else {
                return value;
            }
        }

    // Function to highlight cells if the data is undefined, null, or empty
    function MissingUser(value) {
        if (value === undefined || value === null || value === '') {
            return `<span>${value === undefined || value === null ? 'ACC System' : value}</span>`;
        } else {
            return value;
        }
    }
    function checkFolder(folderPath){
        if(folderPath.includes('WIP')){
            folderCount['WIP'] = (folderCount['WIP'] || 0) + 1;
        } else if(folderPath.includes('CLIENT_SHARED')){
            folderCount['CLIENT_SHARED'] = (folderCount['CLIENT_SHARED'] || 0) + 1;
        } else if(folderPath.includes('SHARED')){
            folderCount['SHARED'] = (folderCount['SHARED'] || 0) + 1;
        } else if(folderPath.includes('PUBLISHED')){
            folderCount['PUBLISHED'] = (folderCount['PUBLISHED'] || 0) + 1;
        }
    }
    function filterTable(label,field) {
        // Clear the table body
        tableBody.innerHTML = '';
        console.log(label)
        fileCount = 0
        // Filter the data based on the selected label
        filteredData.forEach(async item => {
            let InvalidRevision
            const hasTitleLine = item['title_line_1'] !== undefined && item['title_line_1'] !== null && item['title_line_1'] !== '';
            const hasRevisionLine = item['revision'] !== undefined && item['revision'] !== null && item['revision'] !== '';
            const hasStatusLine = item['status'] !== undefined && item['status'] !== null && item['status'] !== '';
            const hasFolderPath = item['folder_path'] !== undefined && item['folder_path'] !== null && item['folder_path'] !== '';
            const hasDescriptionLine = item['file_description'] !== undefined && item['file_description'] !== null && item['file_description'] !== '';
            
            if ((label === 'Files with Title Line 1' && hasTitleLine) || (label === 'Files without Title Line 1' && !hasTitleLine)) {
                await createMainTableRow(item,0)
            }
            if ((label === 'Files with Revision' && hasRevisionLine && pattern.test(item['revision'])) || (label === 'Files without Revision' && !hasRevisionLine) || (label === 'Files with Invalid ISO Revision' && !pattern.test(item['revision']) && hasRevisionLine)) {
                await createMainTableRow(item,0)
            }
            if (((label === 'Files with Description' && hasDescriptionLine && item['file_description'] !== "TIDP Placeholder File" )|| (label === 'Files without Description' && !hasDescriptionLine) || (label === 'Files with Placeholder Description' && item['file_description'] === "TIDP Placeholder File" && hasDescriptionLine))) {
                await createMainTableRow(item,0)
            }
            if ((label === 'Files with Status' && hasStatusLine || (label === 'Files without Status' && !hasStatusLine))) {
                await createMainTableRow(item,0)
            }
            if ((field === 'statusBar' && hasStatusLine  && item['status'] === label) || (field === 'statusBar' && !hasStatusLine  && item['status'] === undefined)) {
                await createMainTableRow(item,0)
            }
            if ((field === 'folderBar' && hasFolderPath  && item['folder_path'].includes(label)) || (field === 'folderBar' && !hasFolderPath  && item['folder_path'] === undefined)) {
                await createMainTableRow(item,0)
            }
            colourParentMissing()
            await columnEditing()
        });
        runChecks()

    }

async function createMainTableRow(item,group) {
    const mainRow = document.createElement('tr');
    mainRow.classList.add('main-row');
    mainRow.setAttribute('data-id', item.id);
    mainRow.innerHTML = `
        <td>
            ${group.length > 1 ? '<i class="fas fa-chevron-right expand-icon"></i>' : ''}
        </td>
        <td>${item.name}</td>
        <td>${item.accversion}</td>
        <td><a href="${item.file_url}" target="_blank">View</a></td>
        <td class="editable">${highlightCell(item.revision,"revision")}</td>
        <td>${item.folder_path}</td>
        <td class="editable">${highlightCell(item['file_description'])}</td>
        <td class="editable">${highlightCell(item['title_line_1'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_2'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_3'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_4'])}</td>
        <td class="editable">${highlightCell(item['status'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['activity_code'])}</td>
        ${projectID === "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133" 
            ? `<td class="editable">${highlightCell(item.series)}</td>` 
            : ''
          }
        <td>${MissingUser(item.last_modified_user)}</td>
        <td>${highlightCell(new Date(item.last_modified_date).toLocaleString())}</td>
        <td>${MissingUser(item.created_by_user)}</td>
        <td>${item.spatial}</td>
`;

    tableBody.appendChild(mainRow);
    //console.log(mainRow)
    if (group.length > 1) {
        mainRow.querySelector('.expand-icon').addEventListener('click', function () {
            //console.log(2)
            const isExpanded = this.classList.contains('fa-chevron-down');
            this.classList.toggle('fa-chevron-down', !isExpanded);
            this.classList.toggle('fa-chevron-right', isExpanded);

            group.slice(1).forEach(item => {
                //console.log(3)
                const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
                if (itemRow) {
                    //console.log(4)
                    itemRow.classList.toggle('hidden-row', isExpanded);
                }
            });
        });
        group.slice(1).forEach(async item => {
            //console.log(1)
            await createExpandableTableRow(item)
        });
    }
    return //mainRow
}

async function createTransmittalRow(item,group) {
    const mainRow = document.createElement('tr');
    mainRow.classList.add('main-row');
    mainRow.setAttribute('data-id', item.id);
    mainRow.innerHTML = `
        <td>
            ${group.length > 1 ? '<i class="fas fa-chevron-right expand-icon"></i>' : ''}
        </td>
        <td>${item.name}</td>
        <td>${item.accversion}</td>
        <td><a href="${item.file_url}" target="_blank">View</a></td>
        <td class="editable">${highlightCell(item.revision,"revision")}</td>
        <td>${item.folder_path}</td>
        <td class="editable">${highlightCell(item['file_description'])}</td>
        <td class="editable">${highlightCell(item['title_line_1'])}</td>
`;

    tableBody.appendChild(mainRow);
    //console.log(mainRow)
    if (group.length > 1) {
        mainRow.querySelector('.expand-icon').addEventListener('click', function () {
            //console.log(2)
            const isExpanded = this.classList.contains('fa-chevron-down');
            this.classList.toggle('fa-chevron-down', !isExpanded);
            this.classList.toggle('fa-chevron-right', isExpanded);

            group.slice(1).forEach(item => {
                //console.log(3)
                const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
                if (itemRow) {
                    //console.log(4)
                    itemRow.classList.toggle('hidden-row', isExpanded);
                }
            });
        });
        group.slice(1).forEach(async item => {
            //console.log(1)
            await createExpandableTransmittalTableRow(item)
        });
    }
    return //mainRow
}
async function createExpandableTableRow(item) {
    const itemRow = document.createElement('tr');
    itemRow.classList.add('expandable-row', 'hidden-row');
    itemRow.setAttribute('data-id', item.id);
    itemRow.innerHTML =`         
        <td>
            
        </td>   
        <td>${item.name}</td>
        <td>${item.accversion}</td>
        <td><a href="${item.file_url}" target="_blank">View</a></td>
        <td class="editable">${highlightCell(item.revision,"revision")}</td>
        <td>${item.folder_path}</td>
        <td class="editable">${highlightCell(item['file_description'])}</td>
        <td class="editable">${highlightCell(item['title_line_1'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_2'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_3'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['title_line_4'])}</td>
        <td class="editable">${highlightCell(item['status'])}</td>
        <td class="editable">${highlightCellNotMandatory(item['activity_code'])}</td>
        ${projectID === "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133" 
            ? `<td class="editable">${highlightCell(item.series)}</td>` 
            : ''
          }
        <td>${MissingUser(item.last_modified_user)}</td>
        <td>${highlightCell(new Date(item.last_modified_date).toLocaleString())}</td>
        <td>${MissingUser(item.created_by_user)}</td>
        <td>${item.spatial}</td>

    `;
    tableBody.appendChild(itemRow);
}

async function createExpandableTransmittalTableRow(item) {
    const itemRow = document.createElement('tr');
    itemRow.classList.add('expandable-row', 'hidden-row');
    itemRow.setAttribute('data-id', item.id);
    itemRow.innerHTML =`         
        <td>
            
        </td>   
        <td>${item.name}</td>
        <td>${item.accversion}</td>
        <td><a href="${item.file_url}" target="_blank">View</a></td>
        <td class="editable">${highlightCell(item.revision,"revision")}</td>
        <td>${item.folder_path}</td>
        <td class="editable">${highlightCell(item['file_description'])}</td>
        <td class="editable">${highlightCell(item['title_line_1'])}</td>
    `;
    tableBody.appendChild(itemRow);
}

function countRowsInTable(){
    // Count only the rows within the tbody
    const rowCount = tableBody.rows.length;
    console.log('Number of body rows:', rowCount);
}


async function colourParentMissing() {
        // Select all span elements with the class 'highlight'
        const highlightedSpans = document.querySelectorAll('span.highlight');

        // Iterate through each highlighted span
        highlightedSpans.forEach(function (span) {
            // Get the parent element of the current span
            const parent = span.parentElement;
    
            // Do something with the parent element, for example, apply a style
            if (parent) {
                //console.log(parent); // Log the parent element to the console
                parent.style.backgroundColor = '#ffcccc';
            }
        });

        // Select all span elements with the class 'highlight'
        const highlightedYellowSpans = document.querySelectorAll('span.highlightYellow');

        // Iterate through each highlighted span
        highlightedYellowSpans.forEach(function (span) {
            // Get the parent element of the current span
            const parent = span.parentElement;
    
            // Do something with the parent element, for example, apply a style
            if (parent) {
                //console.log(parent); // Log the parent element to the console
                parent.classList.add("highlightYellow")
            }
        });
}

async function getProjectFromURL(){
    // Get the URL of the current page
    var url = window.location.href;

    // Check if the URL contains a parameter named 'id'
    if (url.indexOf('id=') !== -1) {
        // Extract the value of the 'id' parameter
        var id = url.split('id=')[1];

        // Display the extracted ID
        console.log('Extracted ID:', id);

        setDefaultSelectedValue(id)

    } else {
        console.log('No ID parameter found in the URL');
    }
  }

  function checkURL(){
    // Get the query string portion of the URL
    var queryString = window.location.search;

    // Check if the query string contains an 'id' parameter
    if (queryString.includes('id=')) {
        console.log('The URL contains an Project ID parameter');
        getProjectFromURL()
    } else {
        console.log('The URL does not contain an Project ID parameter');
    }
  }

  // Function to set the default selected value
  function setDefaultSelectedValue(id) {
    var defaultValue = id; // Replace '456' with the desired default value
    console.log(defaultValue)
    projectID = defaultValue
    rawProjectID = defaultValue.replace('b.','')
    
}

async function resetTable() {
    tableBody.innerHTML = '';
    getData()
    resetHeaders()
    folderFilter.value = 'all'; // Reset dropdown to "All"
    searchInput.value = null;
}

async function revisionCheck() {
    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        const value = cells[4].textContent.trim();
        const folder = cells[5].textContent.trim();

        if (!pattern.test(value)) {
            // Add a data-tooltip attribute for the custom tooltip
            cells[4].classList.add('tooltip');

            if(value.includes("Missing")){
                cells[4].setAttribute('data-tooltip', "Data is missing please correct on ACC");
                
            }else{
                cells[4].style.backgroundColor = '#FFDBBB';
            }
            
            if(folder.includes("WIP")){
                cells[4].setAttribute('data-tooltip', "Incorrect format. Correct format is P##.## as the file is in the WIP folder");
            }else if(folder.includes("SHARED")){
                cells[4].setAttribute('data-tooltip', "Incorrect format. Correct format is P## as the file is in the SHARED folder");
            }else if(folder.includes("PUBLISHED")){
                cells[4].setAttribute('data-tooltip', "Incorrect format. Correct format is C## as the file is in the PUBLISHED folder");
            }else{
                cells[4].setAttribute('data-tooltip', "Incorrect format. Use formats like P01, C02, or P02.03");
            }
            

        }
    }
 }

 async function titlelineCheck() {

    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        const value = cells[7].textContent.trim();
        const folder = cells[5].textContent.trim();
            // Add a data-tooltip attribute for the custom tooltip
            
            if(value == "Missing"){
                cells[7].classList.add('tooltip');
                cells[7].setAttribute('data-tooltip', "All files require a Title Line please amend on ACC");
        }        
    }
 }
 async function descriptionlineCheck() {

    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        const value = cells[6].textContent.trim();
        const folder = cells[5].textContent.trim();
            // Add a data-tooltip attribute for the custom tooltip
    
        if(value == "Missing"){
            cells[6].classList.add('tooltip');
            cells[6].setAttribute('data-tooltip', "All files require a description please amend on ACC");
        }
        if(value == "TIDP Placeholder File"){
            cells[6].classList.add("highlightYellow");
        }
    }
 }
 async function statusCheck() {

    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {

        const cells = rows[i].getElementsByTagName('td');
        //console.log(cells)
        const value = cells[11].textContent.trim();
        const folder = cells[5].textContent.trim();
            // Add a data-tooltip attribute for the custom tooltip
            
            if(value == "Missing"){
                cells[10].classList.add('tooltip-left');
                if(folder.includes("WIP")){
                    cells[10].setAttribute('data-tooltip', "Missing status, as the file is in WIP please use S0");
                }else if(folder.includes("SHARED")){
                    cells[10].setAttribute('data-tooltip', "Missing status, as the file is in WIP please use S1-7");
                }else if(folder.includes("PUBLISHED")){
                    cells[10].setAttribute('data-tooltip', "Missing status, as the file is in WIP please use A4-7");
                }else{
                    cells[10].setAttribute('data-tooltip', "Incorrect format. Use formats like P01, C02, or P02.03");
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

async function openTab(evt, tabName) {
    // Declare all variables
    var i, tabcontent, tablinks;
    selectedTab = tabName

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
    document.getElementById('openModal').style.display = 'block'
    document.getElementById('chartButton').style.display = 'block'
    switch (tabName) {
        case "MIDP":
            tableBody = document.querySelector('#dataTable tbody');
            tableHeader = document.getElementById('dataTable');
            searchInput = document.getElementById('searchInput');
            folderFilter = document.getElementById('folderFilter');
            tableBody.innerHTML = ''
            searchInput.value =''
            //tableHeader.innerHTML=''
            generateMIDPTable()
            break;

        case "DrawingRegister":
            tableBody = document.querySelector('#dataTableDR tbody');
            tableHeader = document.getElementById('dataTableDR');
            searchInput = document.getElementById('searchInputDR');
            folderFilter = document.getElementById('folderFilterDR');
            tableBody.innerHTML = ''
            searchInput.value =''
            //tableHeader.innerHTML=''
            generateMIDPTable()
            break;

        case "TransmittalRegister":
            tableBody = document.querySelector('#dataTableTR tbody');
            tableHeader = document.getElementById('dataTableTR');
            searchInput = document.getElementById('searchInputTR');
            folderFilter = document.getElementById('folderFilterTR');
            tableBody.innerHTML = ''
            searchInput.value =''
            DCDataRetrieval()
            generateTransmittalTable()
            document.getElementById('openModal').style.display = 'none'
            document.getElementById('chartButton').style.display = 'none'
            document.getElementById('chartsSection').style.display = "none";
            break;

        case "MDR":
            tableBody = document.querySelector('#dataTableMDR tbody');
            tableHeader = document.getElementById('dataTableMDR');
            searchInput = document.getElementById('searchInputMDR');
            folderFilter = document.getElementById('folderFilterMDR');
            tableBody.innerHTML = ''
            searchInput.value =''
            await getNSArray()
            generateMDRTable(files)
            document.getElementById('openModal').style.display = 'none'
            document.getElementById('chartButton').style.display = 'none'
            document.getElementById('chartsSection').style.display = "none";
            break;
            
        default:
            break;
    }
    rows = tableBody.getElementsByTagName('tr');
    searchInput.addEventListener('keyup', function () {

        const filter = searchInput.value.toLowerCase();

        for (let i = 0; i < rows.length; i++) { // Start at 1 to skip the header row
            const cells = rows[i].getElementsByTagName('td');
            let match = false;

            for (let j = 0; j < cells.length; j++) {
                if (cells[j].textContent.toLowerCase().includes(filter)) {
                    match = true;
                    break;
                }
            }

            if (match) {
                rows[i].style.display = ''; // Show the row
            } else {
                rows[i].style.display = 'none'; // Hide the row
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

  function calculatePercentage(part, total) {
    if (total === 0) {
        return 0; // Avoid division by zero
    }
    const percentage = (part / total) * 100;
    return parseFloat(percentage.toFixed(2)); // Round to 2 decimal places
}
async function runChecks(){
    countRowsInTable()
    await revisionCheck()
    await descriptionlineCheck()
    await titlelineCheck()
    if(selectedTab != 'TransmittalRegister'){
        await statusCheck()
    }
    await invalidFileCheck()
    complianceCalc()
}

async function invalidFileCheck(){
    invalidObjects = []
    files.forEach(async obj => {
        if (await hasInvalidFields(obj,ignoreFieldsInvaildCheck)) {
            //console.log(obj)
            invalidObjects.push(obj);
        }
    });
    //console.log(invalidObjects)
}

function complianceCalc(){
    totals = 0
    overall = 0
    overallComplianceScore = document.getElementById('OverallCompliance')
   //overallComplianceScore.innerHTML = `Overall Project Compliance: ${}%`
    totals = files.length
    invalidFilesCount = invalidObjects.length
    overall = titleLinePresentCount + statusPresentCount + revisionPresentCount + descriptionPresentCount
    overallTotal = totals*4
    overallComplianceChart = newGaugeChartdata(overallComplianceChart,"OverallCompliance","Overall Project Compliance",calculatePercentage(overall, overallTotal),100-calculatePercentage(overall, overallTotal),100,true)
    filesWithMissingDataChart = newGaugeChartdata(filesWithMissingDataChart,"StatusCompliance","Files with Missing Metadata",invalidFilesCount,totals-invalidFilesCount,totals,false,true)
}

function gaugeDisplay(element,title,percentageValue, total,invert,percentageRequired){
    let colourSteps
    if(!invert){
        colourSteps = [
            { range: [0, total*0.20], color: "rgba(207,32,32,0.5)" },
            { range: [total*0.20, total*0.40], color: "rgba(247,100,32,0.5)" },
            { range: [total*0.40, total*0.60], color: "rgba(255,187,16,0.5)" },
            { range: [total*0.60, total*0.80], color: "rgba(207,223,40,0.5)" },
            { range: [total*0.8, total], color: "rgba(66,183,74,0.5)" }
          ]
    }else{
        colourSteps = [
            { range: [0, total*0.20], color: "rgba(66,183,74,0.5)" },
            { range: [total*0.20, total*0.40], color: "rgba(207,223,40,0.5)" },
            { range: [total*0.40, total*0.60], color: "rgba(255,187,16,0.5)" },
            { range: [total*0.60, total*0.80], color: "rgba(247,100,32,0.5)" },
            { range: [total*0.8, total], color: "rgba(207,32,32,0.5)" }
          ]
    }
    if(percentageRequired){symbol = "%"}
    var data = [
        {
            domain: { x: [0, 1], y: [0, 1] },
            value: percentageValue,
            title: { text:title },
            type: "indicator",
            mode: "gauge+number",
            gauge: {
                axis: { range: [null, total], tickwidth: 1, tickcolor: "darkblue" },
                bar: { color: "rgba(65,105,225,0.8)" },
                bordercolor: "",
                borderwidth: 0,
                steps:colourSteps
            }  
        }
    ];
    
    var layout = { 
        width: "100%", 
        height: 150, 
        // Position the chart title using annotation at the bottom
        annotations: [
            {
                text: title,
                xref: 'paper',
                yref: 'paper',
                x: 0.5, // Center it horizontally
                y: -0.3, // Position it below the chart
                showarrow: false,
                font: {
                    size: 16,
                    color: 'black'
                }
            }
        ],
        margin: { t: 20, b: 30 } 
    };

    Plotly.newPlot(element, data, layout);
}

function newGaugeChartdata(elementVar,element,title,score,max,total,percentage,colourInvert){
    const ctx_render = document.getElementById(element).getContext('2d');
    if(elementVar){
        elementVar.destroy();
    }
    // setup
if(colourInvert){
    if(score/(score+max)<0.2){
        backC = [
            'rgba(66,183,74,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(66,183,74, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]

    }else if(score/(score+max)<0.4){

          backC = [
            'rgba(207,223,40,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(207,223,40, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<0.6){
        backC = [
            'rgba(255,187,16,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(255,187,16, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<0.8){
        backC = [
            'rgba(247,100,32,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(247,100,32, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<1){
        backC = [
            'rgba(207,32,32,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(207,32,32, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }
    else{
        backC = [
            'rgba(255, 26, 104, 0.2)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(255, 26, 104, 1)',
            'rgba(0, 0, 0, 1)'
          ]
    }
}else{
    if(score/(score+max)<0.2){
        backC = [
            'rgba(207,32,32,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(207,32,32, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<0.4){
        backC = [
            'rgba(247,100,32,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(247,100,32, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<0.6){
        backC = [
            'rgba(255,187,16,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(255,187,16, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<0.8){
        backC = [
            'rgba(207,223,40,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(207,223,40, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }else if(score/(score+max)<1){
        backC = [
            'rgba(66,183,74,0.5)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(66,183,74, 1)',
            'rgba(0, 0, 0, 0.3)'
          ]
    }
    else{
        backC = [
            'rgba(255, 26, 104, 0.2)',
            'rgba(0, 0, 0, 0.2)'
          ]
        borderC = [
            'rgba(255, 26, 104, 1)',
            'rgba(0, 0, 0, 1)'
          ]
    }
}
    
    const data = {
        labels: ['Mon', 'Tue'],
        datasets: [{
          data: [score,max],
          backgroundColor:backC, 
          borderColor: borderC,
          borderWidth: 1,
          cutout:'90%',
          circumference:180,
          rotation:270,
        }]
      };

      const gaugeChartText = {
        id: 'gaugeChartText',
        afterDatasetsDraw(chart, args, pluginOptions) {
          const { ctx, data, chartArea: { top, bottom, left, right, width, height }, scales: { r } } = chart;
      
          ctx.save();
          const xCoor = chart.getDatasetMeta(0).data[0].x;
          const yCoor = chart.getDatasetMeta(0).data[0].y;

            function textLabel(fontSize,color,textBaseLine,textAlign,textValue,x,y) {
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = color;
                ctx.textBaseLine = textBaseLine;
                ctx.textAlign = textAlign
                ctx.fillText(textValue, x, y);
            }
            textLabel(14,'#666','bottom','left',0,left,yCoor + 20)
            textLabel(14,'#666','bottom','right',total,right,yCoor + 20)
            if(percentage){
                textLabel(50,'#666','bottom','center',`${score}%`,xCoor,yCoor)
            }else{
                textLabel(60,'#666','bottom','center',score,xCoor,yCoor)
            }
            textLabel(18,'#666','bottom','center',title,xCoor,yCoor + 20)


        }
      };
  
      // config 
      const config = {
        type: 'doughnut',
        data: data,
        options: {
            maintainAspectRatio: true, // Maintain default aspect ratio
            responsive: true,          // Make it responsive
            aspectRatio: 1.5,            // Set specific aspect ratio if needed
          plugins:{
            legend:{
                display:false
            },
            tooltip:{
                enabled:false
            }
          }
        },
        plugins:[gaugeChartText]
      };
      
      // render init block
      const myChart = new Chart(
        ctx_render,
        config
      );
      return myChart
}

function openChartsSelection(tabName){
    if(document.getElementById(tabName).style.display == "block"){
        document.getElementById(tabName).style.display = "none";
    }else{
        document.getElementById(tabName).style.display = "block"
    }
    return
    chartButton = document.getElementById('chartButton')
        // Update button text with Unicode symbols
    chartButton.textContent = showCharts 
    ? '📊 Show Charts'  // Pencil symbol for edit mode
    : '📊 Hide Charts';  // Checkmark symbol for non-edit mode
        

}

// Function to show popup with fade-in
function showPopup(title,message) {
    const popup = document.getElementById("popup");
    popup.classList.add("show"); // Add 'show' class to make the popup visible
    popup.innerHTML = `<h4>${title}</h4><br><span>${message}</span>`;
    // Hide the popup after 5 seconds with fade-out
    setTimeout(function() {
        popup.classList.remove("show"); // Remove 'show' class to fade it out
    }, 10000);
}

// Call the function to show popup when the page loads
window.onload = function() {
    //showPopup("Title Test","Test Message");
};
/////////////////////////////////////////////////////////////// Metadata Update Section

async function makeCellsEditable() {

    await getCustomDetailsData()
    // Get the toggle button and all editable cells
    toggleEditBtn = document.getElementById('toggleEditBtn');
    editableCellsText = document.querySelectorAll('.editable');
    editableCellsAll = document.querySelectorAll('.editable, .editable-drop, .editable-date');
    let editMode = false; // Keep track of whether cells are editable or not
  
    // Define an array where each value corresponds to a column 
  
    // Function to toggle the editable state of the cells
    function toggleEditMode() {
      editMode = !editMode; // Toggle edit mode
      
  
      editableCellsAll.forEach(cell => {
        cell.contentEditable = editMode; // Enable or disable contenteditable
        cell.classList.toggle('edit-mode', editMode); // Toggle the class for edit mode
        if (editMode) {
            cell.classList.add('editMode'); // Add the 'missing' class
          } else {
            cell.classList.remove('editMode'); // Remove the 'missing' class
          }
      });

      document.querySelectorAll('.editable-drop').forEach(function (cell) {
        // Attach click event listener to the cell
        cell.addEventListener('click', function () {
            if(editMode){
                // If a dropdown is already there, avoid re-adding it
                if (cell.querySelector('select')) return;
                    
                // Get the current text/content of the cell
                const currentText = cell.textContent.trim();

                // Create a select element
                const select = document.createElement('select');

                // Create dropdown options
                const options = ['NOT STARTED', 'IN PROGRESS', 'ON TRACK','DELAY', 'COMPLETE'];
                options.forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option;
                    optionElement.text = option;
                    if (option === currentText) {
                        optionElement.selected = true;
                    }
                    select.appendChild(optionElement);
                });

                // Replace the cell's content with the dropdown
                cell.textContent = ''; // Clear the cell content
                cell.appendChild(select);

                // Focus on the dropdown
                select.focus();

                // Handle the change event when the user selects an option
                select.addEventListener('change', function () {
                    
                    cell.textContent = select.value
                    console.log(cell.textContent)
                    patchDataToACC(editMode,cell)
                    cellClass = highlightTrackingStatusCellAfterPatch(cell.textContent)
                    console.log(cellClass)
                    cell.classList.add(cellClass)

                });

                // Handle blur event (when the dropdown loses focus)
                select.addEventListener('blur', function () {
                    cell.textContent = select.value; // Set the cell content to the selected value
                    cell.innerHTML = highlightTrackingStatusCell(select.value); // Update cell content with the selected value
                });

                // Handle Enter key press to select the option
                select.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter') {
                        cell.textContent = select.value; // Update cell content with the selected value
                        select.blur(); // Trigger blur event
                    }
                });
            }
            
        });
    });
    document.querySelectorAll('.editable-date').forEach(cell => {
        cell.addEventListener('click', function() {
            if(editMode){
                // Avoid creating another input if already editing
                if (currentlyEditing === cell) return;

                if (!cell.querySelector('input')) {
                    currentlyEditing = cell; // Set the currently editing cell

                    const originalValue = cell.textContent.trim();
                    const input = document.createElement('input');
                    input.type = 'date';
                    input.value = originalValue;

                    // Replace the cell's text content with the date picker
                    cell.innerHTML = '';
                    cell.appendChild(input);

                    // Focus the input field
                    input.focus();

                    // Handle patching only when the user selects a date (or exits the field)
                    input.addEventListener('change', () => {
                        cell.textContent = input.value;
                        patchDataToACC(editMode,cell)
                        cell.textContent = new Date(input.value).toLocaleDateString('en-GB');
                        cell.style.backgroundColor = '#d1dfda'
                        colourParentMDR()
                        colourParentMissing()
                    });

                    // When the input is blurred, finalize and exit editing mode
                    input.addEventListener('blur', () => {
                        cell.textContent = new Date(input.value || originalValue).toLocaleDateString('en-GB');
                        currentlyEditing = null; // Reset currently editing
                    });

                    input.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            cell.textContent = input.value;
                            
                            patchDataToACC(editMode,cell)
                            currentlyEditing = null; // Reset currently editing
                            colourParentMDR()
                            colourParentMissing()
                        }
                    });
                }
            }
            
        });
    });
  
      // Update button text
    // Update button text with Unicode symbols
    toggleEditBtn.textContent = editMode 
        ? '✔️ Disable Edit Mode'  // Pencil symbol for edit mode
        : '✏️ Enable Edit Mode';  // Checkmark symbol for non-edit mode
        toggleEditBtn.style.backgroundColor = editMode ? 'orange' : '';

    }
  
    // Add click event listener to the toggle button
    toggleEditBtn.addEventListener('click', toggleEditMode);

    if(selectedTab === "MDR"){
        columnNames = columnNamesMDR
    }else{
        columnNames = columnNamesDefault
    }
    // Attach the 'blur' event listener only once, when the DOM is fully loaded
    editableCellsText.forEach(async cell => {
        cell.addEventListener('blur', function() {
            patchDataToACC(editMode,this)
            colourParentMissing()
      });
    }); 
}

async function patchDataToACC(editMode,cell){
    if (editMode) {  // Only run the code if in edit mode
        // Find the parent row (tr) of the cell
        const row = cell.closest('tr');
        
        // Get the data-id attribute from the row
        const dataId = row.getAttribute('data-id');
        
        // Get the index of the column (cell index within the row)
        const columnIndex = cell.cellIndex;
        console.log(columnNames)
        // Get the corresponding column name from the array
        const columnData = columnNames.find(column => column.columnIndex === columnIndex);
        let found = files.find(item => item.id === dataId);
        // Log the data-id, column index, column name, and updated content

          if(
                cell.textContent !== "Missing" &&
                (found[columnData.columnName] !== cell.textContent )
            ){
              console.log('Row Data-ID:', dataId);
              console.log('Column ID:', columnData.columnId);
              console.log('Cell content updated:', cell.textContent);
              found[columnData.columnName] = cell.textContent;
              postCustomItemDetails(accesToken,columnData.columnId,cell.textContent,dataId)
              showPopup(`${found.name} Updated`,`${found.name} field ${columnData.columnName} has been updated to ${cell.textContent}`);
          }else{
              console.log("Attribute not updated: ",dataId)
          }

      }
}
    
    // Initialize cells as non-editable (read-only) by default
    //toggleEditMode(); // Calls the function once to set the initial state

  
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

async function getCustomDetailsData(){
    try{
        accesToken = await getAccessToken("data:read data:write")
    } catch (error) {
        console.error('Error:', error);
    }
    rootData = await getProjectTopFolder(accesToken,hubID,projectID)
    ProjectFiles = rootData.data.filter(item => {
        return item.attributes.name === "Project Files"
    })
    startFolderID = ProjectFiles[0].id

    customAttributes = await getItemDetails(accesToken,startFolderID)
    console.log("Custom Attributes:",customAttributes)

    titleline1ID = await findObjectByName("Title Line 1",customAttributes)
    titleline2ID = await findObjectByName("Title Line 2",customAttributes)
    titleline3ID = await findObjectByName("Title Line 3",customAttributes)
    titleline4ID = await findObjectByName("Title Line 4",customAttributes)
    revisionCodeID = await findObjectByName("Revision",customAttributes)
    revisionDescID = await findObjectByName("Revision Description",customAttributes)
    statusCodeID = await findObjectByName("Status",customAttributes)

    activityCodeID = await findObjectByName("Activity Code",customAttributes)
    ClassificationID = await findObjectByName("Classification",customAttributes)
    FileDescriptionID = await findObjectByName("File Description",customAttributes)
    StateID = await findObjectByName("State",customAttributes)

    trackingStatusID = await findObjectByName("Tracking Status",customAttributes)
    notesID = await findObjectByName("Notes",customAttributes)
    categoryID = await findObjectByName("Category",customAttributes)
    actualStartDateID = await findObjectByName("Actual Start Date",customAttributes)
    plannedStartDateyID = await findObjectByName("Planned Start Date",customAttributes)
    actualFinishDateID = await findObjectByName("Actual Finish Date",customAttributes)
    plannedFinishDateyID = await findObjectByName("Planned Finish Date",customAttributes)

switch (projectID) {
    case 'b.76c59b97-feaf-413c-9bd0-43cf8aaa3133':
        seriesID = await findObjectByName("Series",customAttributes)

        columnNamesDefault = [
            {columnName:"revision",columnIndex:4,columnId:revisionCodeID.id}, 
            {columnName:"file_description",columnIndex:6,columnId:FileDescriptionID.id}, 
            {columnName:"title_line_1",columnIndex:7,columnId:titleline1ID.id}, 
            {columnName:"title_line_2",columnIndex:8,columnId:titleline2ID.id}, 
            {columnName:"title_line_3",columnIndex:9,columnId:titleline3ID.id}, 
            {columnName:"title_line_4",columnIndex:10,columnId:titleline4ID.id}, 
            {columnName:"status",columnIndex:11,columnId:statusCodeID.id},
            {columnName:"activity_code",columnIndex:12,columnId:activityCodeID.id},
            {columnName:"series",columnIndex:13,columnId:seriesID.id},
        ]
        break;

    default:
        columnNamesDefault = [
            {columnName:"revision",columnIndex:4,columnId:revisionCodeID.id}, 
            {columnName:"file_description",columnIndex:6,columnId:FileDescriptionID.id}, 
            {columnName:"title_line_1",columnIndex:7,columnId:titleline1ID.id}, 
            {columnName:"title_line_2",columnIndex:8,columnId:titleline2ID.id}, 
            {columnName:"title_line_3",columnIndex:9,columnId:titleline3ID.id}, 
            {columnName:"title_line_4",columnIndex:10,columnId:titleline4ID.id}, 
            {columnName:"status",columnIndex:11,columnId:statusCodeID.id},
            {columnName:"activity_code",columnIndex:12,columnId:activityCodeID.id},
        ]
        break;
}
;
if(projectID === "b.2e6449f9-ce25-4a9c-8835-444cb5ea03bf"){
    columnNamesMDR = [
        {columnName:"revision",columnIndex:3,columnId:revisionCodeID.id}, 
        {columnName:"title",columnIndex:4,columnId:titleline1ID.id}, 
        {columnName:"category",columnIndex:5,columnId:categoryID.id},
        {columnName:"status",columnIndex:6,columnId:trackingStatusID.id},
        {columnName:"notes",columnIndex:7,columnId:notesID.id},
        {columnName:"planned_start_date",columnIndex:8,columnId:plannedStartDateyID.id},
        {columnName:"actual_start_date",columnIndex:9,columnId:actualStartDateID.id},
        {columnName:"planned_finish_date",columnIndex:10,columnId:plannedFinishDateyID.id},
        {columnName:"actual_finish_date",columnIndex:11,columnId:actualFinishDateID.id},
        
    ];
}


    console.log(columnNamesDefault)
}

async function getItemDetails(AccessToken,FolderID){

    const headers = {
        'Authorization':"Bearer "+AccessToken,
    };

    const requestOptions = {
        method: 'GET',
        headers: headers,
    };

    const apiUrl = "https://developer.api.autodesk.com/bim360/docs/v1/projects/"+projectID.replace("b.", "")+"/folders/"+FolderID+"/custom-attribute-definitions";
    //console.log(apiUrl)
    //console.log(requestOptions)
    signedURLData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data
        //console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata.results
        })
        .catch(error => console.error('Error fetching data:', error));
    return signedURLData
    }

async function getProjectTopFolder(accessTokenDataRead,hubID,projectID){

    const bodyData = {

        };

    const headers = {
        'Authorization':"Bearer "+accessTokenDataRead,
        //'Content-Type':'application/json'
    };

    const requestOptions = {
        method: 'GET',
        headers: headers,
        //body: JSON.stringify(bodyData)
    };

    const apiUrl = "https://developer.api.autodesk.com/project/v1/hubs/"+hubID+"/projects/b."+projectID.replace("b.", "")+"/topFolders";
    //console.log(apiUrl)
    //console.log(requestOptions)
    responseData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data

        //console.log(JSONdata)

        return JSONdata
        })
        .catch(error => console.error('Error fetching data:', error));

    return responseData
    }

async function getAccessToken(scopeInput){

    const bodyData = {
        scope: scopeInput,
        };

    const headers = {
        'Content-Type':'application/json'
    };

    const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(bodyData)
    };

    const apiUrl = "https://prod-18.uksouth.logic.azure.com:443/workflows/d8f90f38261044b19829e27d147f0023/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=-N-bYaES64moEe0gFiP5J6XGoZBwCVZTmYZmUbdJkPk";
    //console.log(apiUrl)
    //console.log(requestOptions)
    signedURLData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data

        //console.log(JSONdata)

        return JSONdata.access_token
        })
        .catch(error => console.error('Error fetching data:', error));


    return signedURLData
    }

    async function findObjectByName(name,data) {
        let output
        output = await data.find(obj => obj.name === name);
        //console.log(output)
        if(output && output.arrayValues && output.length === 0){
    
        }else{
            return output
        }
    
        }

////////////////////////////////////////////////////////// Column Manipulation

async function columnEditing() {
    const modal = document.getElementById("columnModal");
    const openModalBtn = document.getElementById("openModal");
    const closeModalBtn = document.querySelector(".close");
    const applyColumnsBtn = document.getElementById("applyColumns");
    const table = tableHeader
    const columnSelector = document.getElementById('columnSelector');
    const theadThs = table.querySelectorAll('thead tr th');
    const STORAGE_KEY = 'columnPreferences'; // LocalStorage key
   
    // Function to dynamically generate the checkboxes based on the column headers
    // Function to dynamically generate the checkboxes based on the column headers
    function generateCheckboxes() {
        columnSelector.innerHTML = ''
        theadThs.forEach((th, index) => {
          const columnName = th.textContent.trim();
  
          // Skip generation if the column is in the ignoredColumns list
          if (ignoredColumns.includes(columnName)) {
            return; // Skip this iteration
          }
  
          const checkboxWrapper = document.createElement('label');
          checkboxWrapper.innerHTML = `<input type="checkbox" data-column="${index + 1}" checked> ${columnName}`;
          columnSelector.appendChild(checkboxWrapper);
        });
      }

    // Function to toggle column visibility based on checkbox selection
    function toggleColumns() {
        const checkboxes = document.querySelectorAll('#columnSelector input[type="checkbox"]');
        const preferences = {};
        checkboxes.forEach(checkbox => {
          const columnIndex = checkbox.getAttribute('data-column');
          const isChecked = checkbox.checked;
  
          // Toggle visibility of both <th> and <td> elements in the corresponding column
          const th = table.querySelector(`thead th:nth-child(${columnIndex})`);
          const tds = table.querySelectorAll(`tbody td:nth-child(${columnIndex})`);
  
          if (isChecked) {
            th.classList.remove('hide'); // Show the <th>
            tds.forEach(td => td.classList.remove('hide')); // Show all <td>s in the column
          } else {
            th.classList.add('hide'); // Hide the <th>
            tds.forEach(td => td.classList.add('hide')); // Hide all <td>s in the column
          }
  
          // Save the preference
          preferences[columnIndex] = isChecked;
        });
  
        // Save preferences to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      }
  
      // Function to synchronize checkboxes with current column visibility
      function syncCheckboxesWithTable() {
        const checkboxes = document.querySelectorAll('#columnSelector input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          const columnIndex = checkbox.getAttribute('data-column');
          const th = table.querySelector(`thead th:nth-child(${columnIndex})`);
  
          // If the column is hidden, uncheck the checkbox; otherwise, check it
          checkbox.checked = !th.classList.contains('hide');
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
              th.classList.add('hide'); // Hide the <th>
              const tds = table.querySelectorAll(`tbody td:nth-child(${columnIndex})`);
              tds.forEach(td => td.classList.add('hide')); // Hide all <td>s in the column
            } else {
              th.classList.remove('hide'); // Show the <th>
              const tds = table.querySelectorAll(`tbody td:nth-child(${columnIndex})`);
              tds.forEach(td => td.classList.remove('hide')); // Show all <td>s in the column
            }
          });
        } else {
          // If no preferences exist, apply the defaultHiddenColumns
          theadThs.forEach((th, index) => {
            const columnName = th.textContent.trim();
            if (defaultHiddenColumns.includes(columnName)) {
              th.classList.add('hide'); // Hide the <th>
              const tds = table.querySelectorAll(`tbody td:nth-child(${index + 1})`);
              tds.forEach(td => td.classList.add('hide')); // Hide all <td>s in the column
            }
          });
        }
      }
  
      // Open the modal and sync the checkboxes when the "Select Columns" button is clicked
      openModalBtn.onclick = function() {
        modal.style.display = "block";
        syncCheckboxesWithTable(); // Sync the checkboxes with current table visibility
      };
  
      // Close the modal when the "x" button is clicked
      closeModalBtn.onclick = function() {
        modal.style.display = "none";
      };
  
      // Close the modal when clicking outside of the modal content
      window.onclick = function(event) {
        if (event.target == modal) {
          modal.style.display = "none";
        }
      };
  
      // Apply selected columns when the "Apply" button is clicked
      applyColumnsBtn.onclick = function() {
        toggleColumns();
        modal.style.display = "none"; // Close the modal
      };

      // Initialize the table visibility, generate checkboxes, and load user preferences
      generateCheckboxes();
      loadPreferences(); // Load preferences from localStorage or apply defaults
        }


    function sortTableByColumn(table, column, order = 'asc') {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));

        const sortedRows = rows.sort((rowA, rowB) => {
            const cellA = rowA.querySelector(`td:nth-child(${column + 1})`).textContent.trim();
            const cellB = rowB.querySelector(`td:nth-child(${column + 1})`).textContent.trim();

            if (!isNaN(cellA) && !isNaN(cellB)) { // Sort numerically if the data is numeric
                return order === 'asc' ? cellA - cellB : cellB - cellA;
            }

            return order === 'asc' 
                ? cellA.localeCompare(cellB) 
                : cellB.localeCompare(cellA);
        });

        // Remove current rows
        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }

        // Append sorted rows
        sortedRows.forEach(row => tbody.appendChild(row));
    }

function addSortableColumns() {
        // Add click event listeners to all sortable tables
        document.querySelectorAll('.sortable').forEach(table => {
            table.querySelectorAll('th').forEach((header, index) => {
                header.addEventListener('click', () => {
                    const currentOrder = header.getAttribute('data-order');
                    const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
                    console.log(1)
                    // Sort the table
                    sortTableByColumn(table, index, newOrder);
    
                    // Update the order attribute
                    header.setAttribute('data-order', newOrder);
    
                    // Remove the sort indicator from all headers in the current table
                    table.querySelectorAll('th').forEach(th => {
                        th.classList.remove('asc', 'desc');
                    });
    
                    // Add the new sort indicator
                    header.classList.add(newOrder);
                });
            });
        });
}

// Function to reset all headers in all tables
function resetHeaders() {
    // Loop through all sortable tables
    document.querySelectorAll('.sortable').forEach(table => {
        // Loop through all table headers
        table.querySelectorAll('th').forEach(header => {
            // Reset the sorting order to its default (e.g., 'desc')
            header.setAttribute('data-order', 'desc');

            // Remove any sorting classes (asc, desc)
            header.classList.remove('asc', 'desc');
        });
    });
}

//////////////////////////////////////////// MDR Generation

function generateMDRTable(data) {
    const tableBody = document.querySelector('#dataTableMDR tbody');
    let currentCategory = '';
    // Grouping the files by discipline (extracted from the name)
    const groupedByDiscipline = data.reduce((acc, file) => {
        // Extract the discipline code (e.g., 'EYA' or 'EYC') from the name
        const discipline = file.discipline
        
        // Initialize an array for this discipline if it doesn't exist
        if (!acc[discipline]) {
            acc[discipline] = [];
        }
        
        // Push the file object into the appropriate discipline array
        acc[discipline].push(file);
        
        return acc;
    }, {});

    console.log(groupedByDiscipline);
    Object.values(groupedByDiscipline).forEach(async (group) => {
        group.forEach((row, index) => {
            // Check if the category has changed
            if (row.discipline !== currentCategory.value) {

                currentCategory = arrayDiscipline.find(obj => obj.value === row.discipline);
                
                categoryRow = currentCategory.value
                console.log(currentCategory.description)
                // Insert a sub-header row for the new category
                const subHeaderRow = document.createElement('tr');
                subHeaderRow.classList.add('sub-header');
                subHeaderRow.setAttribute('data-category', `${currentCategory.value.replaceAll(' ','-')}`);
                
                const subHeaderCell = document.createElement('td');
                subHeaderCell.setAttribute('colspan', '11');
                subHeaderCell.classList.add('sub-header');
                subHeaderCell.textContent = currentCategory.description;
    
                subHeaderRow.appendChild(subHeaderCell);
                tableBody.appendChild(subHeaderRow);
    
                // Add click event listener to the sub-header to toggle visibility
                subHeaderRow.addEventListener('click', function() {
                    var category = this.getAttribute('data-category')
                    const categoryRows = document.querySelectorAll(`[data-category=row-${category.replaceAll(' ','-')}]`);
                    //console.log(categoryRows, category)
                    categoryRows.forEach(rowElement => {
                        rowElement.classList.toggle('hidden');
                    });
                });
            }
    
            // Insert the data row and add a specific class for each category group
            const dataRow = document.createElement('tr');
            formValue = arrayForm.find(obj => obj.value === row.form);
            //dataRow.classList.add(`category-${index}`); // Class to associate rows with their respective sub-header
            dataRow.setAttribute('data-id', row.id);
            dataRow.setAttribute('data-category',`row-${currentCategory.value.replaceAll(' ','-')}`)
            dataRow.innerHTML = `

                <td>${row.name}</td>
                <td><a href="${row.file_url}" target="_blank">View</a></td>
                <td class="editable">${highlightCell(row.revision,"revision")}</td>
                <td class="editable">${highlightCell(row.title_line_1)}</td>
                <td class="">${currentCategory.description} ${formValue.description}</td>
                <td class="editable-drop">${highlightTrackingStatusCell(row.tracking_status)}</td>
                <td class="editable">${highlightUndefinedCell(row.notes)}</td>
                <td class="editable-date">${highlightUndefinedCell(new Date(row.planned_start_date).toLocaleDateString('en-GB'))}</td>
                <td class="editable-date">${highlightUndefinedCell(new Date(row.actual_start_date).toLocaleDateString('en-GB'))}</td>
                <td class="editable-date">${highlightUndefinedCell(new Date(row.planned_finish_date).toLocaleDateString('en-GB'))}</td>
                <td class="editable-date">${highlightUndefinedCell(new Date(row.actual_finish_date).toLocaleDateString('en-GB'))}</td>
            `;
            tableBody.appendChild(dataRow);

        });
        let currentlyEditing = null;

    })
    


    makeCellsEditable()
    colourParentMDR()

}
function highlightUndefinedCell(value,column) {
    
    if (value === undefined || value === null || value === '' || value === 'Invalid Date') {
        return `<span class="MDRCell highlight"></span>`;
    }else{
        return `<span>${value}</span>`
    }
}

function highlightTrackingStatusCellAfterPatch(value) {
    
    if (value === undefined || value === null || value === '') {
        return `highlight`;
    }else{
        switch (value) {
            case 'NOT STARTED':
                return `highlightMDRYellow`;
            case 'ON TRACK':
                return `highlightMDRGreen`;
            case 'IN PROGRESS':
                return `highlightMDROrange`;
            case 'DELAY':
                return `highlightMDRRed`;
            case 'COMPLETE':
                return `highlightMDRPurple`;
            default:
                break;
        }
        return
    }
}

function highlightTrackingStatusCell(value,column) {
    
    if (value === undefined || value === null || value === '') {
        return `<span class="MDRCell highlight"></span>`;
    }else{
        switch (value) {
            case 'NOT STARTED':
                return `<span class="MDRCell highlightMDRYellow">${value}</span>`;
            case 'ON TRACK':
                return `<span class="MDRCell highlightMDRGreen">${value}</span>`;
            case 'IN PROGRESS':
                return `<span class="MDRCell highlightMDROrange">${value}</span>`;
            case 'DELAY':
                return `<span class="MDRCell highlightMDRed">${value}</span>`;
            case 'COMPLETE':
                return `<span class="MDRCell highlightMDRPurple">${value}</span>`;
            default:
                break;
        }
        return `<span>${value}</span>`
    }
}

async function colourParentMDR() {
    // Select all span elements with the class 'highlight'
    const highlightedSpans = document.querySelectorAll('span.MDRCell');

    // Iterate through each highlighted span
    highlightedSpans.forEach(function (span) {
        // Get the parent element of the current span
        const parent = span.parentElement;

        // Determine the background color based on specific class names
        let spanBackgroundColor;

        // Check for different highlight classes and set the appropriate color
        if (span.classList.contains('highlightMDRYellow')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor; // Assuming span has a background color defined in CSS
        } else if (span.classList.contains('highlightMDRGreen')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
        } else if (span.classList.contains('highlightMDROrange')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
        } else if (span.classList.contains('highlightMDRRed')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
        } else if (span.classList.contains('highlightMDRPurple')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
        }else if (span.classList.contains('highlight')) {
            spanBackgroundColor = window.getComputedStyle(span).backgroundColor;
        }

        // Apply the background color to the parent element
        if (parent && spanBackgroundColor) {
            parent.style.backgroundColor = spanBackgroundColor;
        }
    });
}

////////////////////////////////////// Get Project Naming Standard
async function getNSArray() {
    await getNamingStandardID(files)
    
    namingstandard = await getNamingStandardforproject(accesToken,namingstandardID,rawProjectID)
    console.log(namingstandard)
    arrayDiscipline = namingstandard.find(item => item.name === "Discipline")
    arrayDiscipline = arrayDiscipline ? arrayDiscipline.options : [];
    arrayForm = namingstandard.find(item => item.name === "Form")
    arrayForm = arrayForm ? arrayForm.options : [];
    console.log(arrayDiscipline)
    console.log(arrayForm)
}


async function getNamingStandardforproject(access_token,ns_id,project_id){

    const headers = {
        'Authorization':"Bearer "+access_token,
    };

    const requestOptions = {
        method: 'GET',
        headers: headers,
    };

    const apiUrl = "https://developer.api.autodesk.com/bim360/docs/v1/projects/"+project_id+"/naming-standards/"+namingstandardID;
    //console.log(apiUrl)
    //console.log(requestOptions)
    responseData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data
        //console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata.definition.fields
        })
        .catch(error => console.error('Error fetching data:', error));
    return responseData
    }

async function getNamingStandardID(folderArray){
    wipFolderID = folderArray.filter(item => {
        return item.folder_path.includes("0C.WIP")})
    console.log("Keltrbay WIP Folder for NS",wipFolderID[0]);
    defaultFolder = wipFolderID[0].folderid
    returnData = await getFolderDetails(accesToken,rawProjectID,defaultFolder)
    
    console.log(returnData)
    namingstandardID = returnData.data.attributes.extension.data.namingStandardIds[0]
    console.log(namingstandardID)

    return
    }

async function getFolderDetails(accessTokenDataRead,projectID,folderID){

    const headers = {
        'Authorization':"Bearer "+accessTokenDataRead,
    };

    const requestOptions = {
        method: 'GET',
        headers: headers,
    };

    const apiUrl = "https://developer.api.autodesk.com/data/v1/projects/b."+projectID+"/folders/"+folderID;
    //console.log(apiUrl)
    //console.log(requestOptions)
    responseData = await fetch(apiUrl,requestOptions)
        .then(response => response.json())
        .then(data => {
            const JSONdata = data
        //console.log(JSONdata)
        //console.log(JSONdata.uploadKey)
        //console.log(JSONdata.urls)
        return JSONdata
        })
        .catch(error => console.error('Error fetching data:', error));
    return responseData
    }

    function exportTableToExcel(tableId,exportName) {
        // Get the table element
        console.log(1)
        const d = new Date().toLocaleString();
        console.log(2)
        // Create a new workbook object
        var workbook = XLSX.utils.book_new();
        console.log(3)
        // 1. Create Cover Sheet data
        var coverData = [
            [""],
            ["",`${exportName} Export`],
            [""],
            ["",`This report contains data related to ${projectName} and should be used appropriately`],
            [""],
            ["","Generated on: " + d]
        ];
        console.log(4)
        // Convert cover data to worksheet
        var coverSheet = XLSX.utils.aoa_to_sheet(coverData);
        console.log(5)

        // Add the cover sheet to the workbook with a sheet name "Cover"
        XLSX.utils.book_append_sheet(workbook, coverSheet, "Cover");
        console.log(6)
        // 2. Add the Table Sheet
        var table = document.getElementById(tableId);
        console.log(7)
        // Convert the modified table data to a sheet
        var tableSheet = XLSX.utils.table_to_sheet(table);
        console.log(8)
        // Add the table sheet to the workbook with a sheet name "Data"
        XLSX.utils.book_append_sheet(workbook, tableSheet, "Data");
        console.log(9)
        // Use SheetJS to export the worksheet to an Excel file
        XLSX.writeFile(workbook, `${exportName}_${projectName}_${d}.xlsx`);
        console.log(10)
}



////////////////////////////////////// Get CSV Data from ACC Data Connector

async function DCDataRetrieval() {
    fetchReviewData().then(() => {
        matchUpDataReviews()
    })
    fetchTransmittalData().then(() => {
        matchUpDataTransmittal()
    })

}

async function fetchReviewData() {
  const response = await fetch(
    "https://prod-31.uksouth.logic.azure.com:443/workflows/541207f0087a4e06840db05622c13314/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2IbQoVS587nd49mhlZPNcveMT_9AWI9l3tnF13BzY6Y",
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
    "https://prod-25.uksouth.logic.azure.com:443/workflows/42ed32848c554de6941a862147e7c2f0/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=sBz9k9kvbkkoZcnhhGKWzCbf48pGQmwITSQhH39Jd5o",
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

async function matchUpDataReviews() {
            
    const reviewListArray = csvDataReviewStore.reviews_reviews;
    const reviewDocumentsArray = csvDataReviewStore.reviews_review_documents;
    const reviewRecipientsArray = csvDataReviewStore.transmittals_transmittal_recipients;

    ReviewData = reviewListArray.map(workflowTransmittal => {
        // Find all matching documents where workflow_transmittal_id matches workflowTransmittal.id
        const matchingDocuments = reviewDocumentsArray.filter(document => document.review_id === workflowTransmittal['ï»¿id']);
        //const matchingRecipients = transmittalRecipientsArray.filter(recipient => recipient.review_id === workflowTransmittal['ï»¿id']);
        // Combine the workflowTransmittal with its matching documents
        return {
            ...workflowTransmittal,
            Documents: matchingDocuments,  // Add the matching documents to the workflow transmittal
            //Recipients: matchingRecipients
        };
    });

    // Log the matched results to the console
    console.log('ReviewData',ReviewData);

}
async function matchUpDataTransmittal() {
    
    const transmittalListArray = csvDataTransmittalStore.transmittals_workflow_transmittals;
    const transmittalDocumentsArray = csvDataTransmittalStore.transmittals_transmittal_documents;
    const transmittalRecipientsArray = csvDataTransmittalStore.transmittals_transmittal_recipients;

    TransmittalData = transmittalListArray.map(workflowTransmittal => {
        // Find all matching documents where workflow_transmittal_id matches workflowTransmittal.id
        const matchingDocuments = transmittalDocumentsArray.filter(document => document.workflow_transmittal_id === workflowTransmittal['ï»¿id']);
        const matchingRecipients = transmittalRecipientsArray.filter(recipient => recipient.workflow_transmittal_id === workflowTransmittal['ï»¿id']);
        // Combine the workflowTransmittal with its matching documents
        return {
            ...workflowTransmittal,
            Documents: matchingDocuments,  // Add the matching documents to the workflow transmittal
            Recipients: matchingRecipients
        };
    });

    // Log the matched results to the console
    console.log('TransmittalData',TransmittalData);

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
    var tableMIDP = document.querySelector('#dataTable');
    var tableDR = document.querySelector('#dataTableDR');
  
    // Check if tableMIDP and tableDR are valid elements
    console.log(tableMIDP);
    console.log(tableDR);
  
    // If the tables are found in the DOM, append thead
    if (tableMIDP && tableDR) {
      let headerArray = [tableMIDP, tableDR];
      
      headerArray.forEach(element => {
        console.log(element); // Log each element to ensure it's a valid HTML element
        let clonedThead = thead.cloneNode(true); // Clone the thead to append to multiple tables
        element.appendChild(clonedThead); // Append the cloned thead to each table
      });
    } else {
      console.error("Table elements not found. Check your selectors.");
    }
  }
  

async function createFilterOptions() {
  const thead = table.querySelector("thead");
  const tbody = tableBody;
  const filterContainer = document.querySelector(".filterOptions");
  const toggleButton = document.getElementById("toggleFiltersButton");
  // Define columns to exclude from filtering (zero-based index)
  const excludedColumns = [0, 1, 2, 3, 4]; // Exclude "Created By" (index 3) and "Date Modified" (index 4)
  filterContainer.innerHTML=''
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