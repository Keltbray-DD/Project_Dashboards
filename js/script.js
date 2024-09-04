document.addEventListener('DOMContentLoaded',function(){
    tableBody = document.querySelector('#dataTable tbody');
    searchInput = document.getElementById('searchInput');
    folderFilter = document.getElementById('folderFilter');
    document.getElementById("MIDP").style.display = "block";
    getProjectFromURL()
    getData()

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
    folderFilter.addEventListener('change', function () {
        const selectedPath = this.value;

        for (let i = 0; i < rows.length; i++) { // Skip the header row
            const row = rows[i];
            const folderPath = row.getElementsByTagName('td')[5].textContent.trim();

            if (selectedPath === 'all' || folderPath === selectedPath) {
                row.style.display = ''; // Show the row
            } else {
                row.style.display = 'none'; // Hide the row
            }
        }
    });
        
})

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
    rawData.forEach(element => {
        processData(element.JSON_data, element.Title, element.Modified, element.Project_Name)
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
        await generateFileTable(fileData.data)
        document.getElementById('dateUpdated').innerHTML = `Export: ${formatDate(fileData.updated)}`
        document.getElementById('projectName').innerHTML = `${Project_Name}`
        colourParentMissing()
    }

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

    return date.toLocaleString('en-US', options);
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

    // Grouping and sorting data by name and accversion
    const groupedData = data.reduce((acc, item) => {
        acc[item.name] = acc[item.name] || [];
        acc[item.name].push(item);
        acc[item.name].sort((a, b) => b.accversion - a.accversion); // Sort by accversion descending
        return acc;
    }, {});

    folderFilter.options.length = 1
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

    Object.values(groupedData).forEach(group => {
        let mainItem = group[0];
        if(selectedTab == "DrawingRegister" && mainItem.form != "DR"){
                return
        }
        if (isMissing(mainItem['title_line_1'])) {
            titleLineMissingCount++;
        }else {
            titleLinePresentCount++;
        }
        if (isMissing(mainItem['revision'])) {
            revisionMissingCount++;
        }else if (!pattern.test(mainItem['revision'])) {
            //console.log(mainItem['revision'])
            revisionFormatCheckInvaildCount++
        } else {
            revisionPresentCount++;
        }
        if (isMissing(mainItem['file_description'])) {
            descriptionMissingCount++;
        } else {
            descriptionPresentCount++;
        }
        if (isMissing(mainItem['status'])) {
            statusMissingCount++;
        } else {
            statusPresentCount++;
        }
        
     
        function isMissing(value) {
            return value === undefined || value === null || value === '';
        }
        // Ensure the status field exists and is properly accessed
        const status = mainItem['status'];

        if (status) {
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        } else {
            // Handle cases where the status might be missing
            statusCounts['Missing'] = (statusCounts['Missing'] || 0) + 1;
        }
        
        folderPaths.push(mainItem.folder_path)
        filteredData.push(mainItem);
        const mainRow = document.createElement('tr');
        mainRow.classList.add('main-row');
        mainRow.setAttribute('data-id', mainItem.id);
        mainRow.innerHTML = `
                <td>
                    ${group.length > 1 ? '<i class="fas fa-chevron-right expand-icon"></i>' : ''}
                </td>
                <td>${mainItem.name}</td>
                <td>${highlightCell(mainItem.accversion)}</td>
                <td><a href="${mainItem.file_url}" target="_blank">View</a></td>
                <td>${highlightCell(mainItem.revision,"revision")}</td>
                <td>${highlightCell(mainItem.folder_path)}</td>
                <td>${highlightCell(mainItem['file_description'])}</td>
                <td>${highlightCell(mainItem['title_line_1'])}</td>
                <td>${MissingUser(mainItem.last_modified_user)}</td>
                <td>${highlightCell(new Date(mainItem.last_modified_date).toLocaleString())}</td>
                <td>${highlightCell(mainItem['status'])}</td>
        `;
    
        tableBody.appendChild(mainRow);

        //console.log(mainRow)
        if (group.length > 1) {
            mainRow.querySelector('.expand-icon').addEventListener('click', function () {
                const isExpanded = this.classList.contains('fa-chevron-down');
                this.classList.toggle('fa-chevron-down', !isExpanded);
                this.classList.toggle('fa-chevron-right', isExpanded);

                group.slice(1).forEach(item => {
                    const itemRow = tableBody.querySelector(`[data-id='${item.id}']`);
                    if (itemRow) {
                        itemRow.classList.toggle('hidden-row', isExpanded);
                    }
                });
            });

            group.slice(1).forEach(item => {
                const itemRow = document.createElement('tr');
                itemRow.classList.add('expandable-row', 'hidden-row');
                itemRow.setAttribute('data-id', item.id);
                itemRow.innerHTML =`         
                    <td>
                        
                    </td>   
                    <td>${item.name}</td>
                    <td>${highlightCell(item.accversion)}</td>
                    <td><a href="${item.file_url}" target="_blank">View</a></td>
                    <td>${highlightCell(item.revision)}</td>
                    <td>${highlightCell(item.folder_path)}</td>
                    <td>${highlightCell(item['file_description'])}</td>
                    <td>${highlightCell(item['title_line_1'])}</td>
                    <td>${MissingUser(item.last_modified_user)}</td>
                    <td>${highlightCell(new Date(item.last_modified_date).toLocaleString())}</td>
                    <td>${highlightCell(item['status'])}</td>
            `;
            tableBody.appendChild(itemRow);
            });
        }

    });
    countRowsInTable()
    revisionCheck()
    titlelineCheck()
    statusCheck()
    populateFolderDropdown(folderPaths)
        // Create the pie chart to show Title Line 1 data presence
        const ctx_Title = document.getElementById('missingTitleDataChart').getContext('2d');
        const chartData_Title = {
            labels: ['Files with Title Line 1', 'Files without Title Line 1'],
            datasets: [{
                data: [titleLinePresentCount, titleLineMissingCount],
                backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
                borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
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
                backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)','rgba(255, 219, 187, 0.6)'],
                borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)','rgba(255, 219, 187, 1)'],
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
                backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
                borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
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
            labels: ['Files with Description', 'Files without Description'],
            datasets: [{
                data: [descriptionPresentCount, descriptionMissingCount],
                backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
                borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
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
    const backgroundColors = labels.map(label => label === 'Missing' ? 'rgba(255, 99, 132, 0.6)' : 'rgba(54, 162, 235, 0.6)');
    const borderColors = labels.map(label => label === 'Missing' ? 'rgba(255, 99, 132, 1)' : 'rgba(54, 162, 235, 1)');

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
            span.setAttribute('data-tooltip', "Incorrect format. Use formats like P01, C02, or P02.03");
            span.innerHTML = `${value}`
            return span //`<span class="highlight tooltip">${value}</span>`
        } else {
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

    function filterTable(label,field) {
        // Clear the table body
        tableBody.innerHTML = '';
        console.log(label)
        fileCount = 0
        // Filter the data based on the selected label
        filteredData.forEach(item => {
            let InvalidRevision
            const hasTitleLine = item['title_line_1'] !== undefined && item['title_line_1'] !== null && item['title_line_1'] !== '';
            const hasRevisionLine = item['revision'] !== undefined && item['revision'] !== null && item['revision'] !== '';
            const hasStatusLine = item['status'] !== undefined && item['status'] !== null && item['status'] !== '';
            const hasDescriptionLine = item['file_description'] !== undefined && item['file_description'] !== null && item['file_description'] !== '';
            
            if ((label === 'Files with Title Line 1' && hasTitleLine) || (label === 'Files without Title Line 1' && !hasTitleLine)) {
                createTableRow(item)
            }
            if ((label === 'Files with Revision' && hasRevisionLine && pattern.test(item['revision'])) || (label === 'Files without Revision' && !hasRevisionLine) || (label === 'Files with Invalid ISO Revision' && !pattern.test(item['revision']) && hasRevisionLine)) {
                createTableRow(item)
            }
            if ((label === 'Files with Description' && hasDescriptionLine || (label === 'Files without Description' && !hasDescriptionLine))) {
                createTableRow(item)
            }
            if ((label === 'Files with Status' && hasStatusLine || (label === 'Files without Status' && !hasStatusLine))) {
                createTableRow(item)
            }
            if ((field === 'statusBar' && hasStatusLine  && item['status'] === label) || (field === 'statusBar' && !hasStatusLine  && item['status'] === undefined)) {
                createTableRow(item)
            }
            colourParentMissing()
            
        });
        countRowsInTable()
        titlelineCheck()
        revisionCheck()
        statusCheck()

    }

async function createTableRow(item) {
    const mainRow = document.createElement('tr');
    mainRow.classList.add('main-row');
    mainRow.setAttribute('data-id', item.id);
    mainRow.innerHTML = `
            <td>
                
            </td>
            <td>${item.name}</td>
            <td>${highlightCell(item.accversion)}</td>
            <td><a href="${item.file_url}" target="_blank">View</a></td>
            <td>${highlightCell(item.revision)}</td>
            <td>${highlightCell(item.folder_path)}</td>
            <td>${highlightCell(item['file_description'])}</td>
            <td>${highlightCell(item['title_line_1'])}</td>
            <td>${MissingUser(item.last_modified_user)}</td>
            <td>${highlightCell(new Date(item.last_modified_date).toLocaleString())}</td>
            <td>${highlightCell(item['status'])}</td>
    `;

    tableBody.appendChild(mainRow);
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
    
}

async function resetTable() {
    tableBody.innerHTML = '';
    getData()
    folderFilter.value = 'all'; // Reset dropdown to "All"
    searchInput.value = null;
}

function revisionCheck() {
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

 function titlelineCheck() {

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
 function titlelineCheck() {

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
    }
 }
 function statusCheck() {

    const rows = tableBody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        const value = cells[10].textContent.trim();
        const folder = cells[5].textContent.trim();
            // Add a data-tooltip attribute for the custom tooltip
            
            if(value == "Missing"){
                cells[10].classList.add('tooltip-left');
                if(folder.includes("WIP")){
                    cells[10].setAttribute('data-tooltip', "Incorrect format. Correct format is P##.## as the file is in the WIP folder");
                }else if(folder.includes("SHARED")){
                    cells[10].setAttribute('data-tooltip', "Incorrect format. Correct format is P## as the file is in the SHARED folder");
                }else if(folder.includes("PUBLISHED")){
                    cells[10].setAttribute('data-tooltip', "Incorrect format. Correct format is C## as the file is in the PUBLISHED folder");
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

function openTab(evt, tabName) {
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

    switch (tabName) {
        case "MIDP":
            tableBody = document.querySelector('#dataTable tbody');
            searchInput = document.getElementById('searchInput');
            folderFilter = document.getElementById('folderFilter');
            getData()
            break;

        case "DrawingRegister":
            tableBody = document.querySelector('#dataTableDR tbody');
            searchInput = document.getElementById('searchInputDR');
            folderFilter = document.getElementById('folderFilterDR');
            getData()
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
    folderFilter.addEventListener('change', function () {
        const selectedPath = this.value;

        for (let i = 0; i < rows.length; i++) { // Skip the header row
            const row = rows[i];
            const folderPath = row.getElementsByTagName('td')[5].textContent.trim();

            if (selectedPath === 'all' || folderPath === selectedPath) {
                row.style.display = ''; // Show the row
            } else {
                row.style.display = 'none'; // Hide the row
            }
        }
    });
  }