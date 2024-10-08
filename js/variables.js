let projectID;
const hubID = "b.24d2d632-e01b-4ca0-b988-385be827cb04"
let accesToken;
let namingstandardID;
let projectName;
//const projectID = "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133";

let table
let tableBody;
let tableHeader;
let searchInput;
let folderFilter;
let rows;
let overallComplianceScore;
let editableCells
let toggleEditBtn

let fileDescriptionColumn
let statusColumn
let titleline1Column
let revisionColumn

let titleLineMissingCount = 0;
let titleLinePresentCount = 0;
let revisionMissingCount = 0;
let revisionPresentCount = 0;
let statusMissingCount = 0;
let statusPresentCount = 0;
let revisionFormatCheckInvaildCount = 0;
let revisionFormatCheckPresentCount = 0;
let descriptionMissingCount = 0
let descriptionPresentCount = 0
let descriptionPlaceHolderCount = 0;

let orginalACCExport = [];
let files = [];
let fileData =[];
let statusCounts = [];
let folderCount = [];
let filteredData = [];
let folderPaths = [];
let invalidObjects = [];
let columnNamesDefault = [];
let columnNamesMDR = [];
let columnNames =[];
let arrayDiscipline =[];
let arrayForm =[];
let ignoreFieldsInvaildCheck = ["last_modified_user","created_by","title_line_2","title_line_3","title_line_4","activity_code","actual_finish_date","actual_start_date","folderid","planned_finish_date","planned_start_date","tracking_status","notes","category","spatial"];
let csvDataReviewStore = [];
let csvDataTransmittalStore = [];
let TransmittalData = [];
let ReviewData = [];

let missingTitleDataChart
let missingRevisionDataChart
let formatRevisionDataChart
let missingStatusDataChart
let missingDescriptionDataChart
let statusChart
let folders_Chart
let overallComplianceChart
let filesWithMissingDataChart
let currentlyEditing;

//let mainRow

let selectedTab = "MIDP"

const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
const ignoredColumns = ['','File Name','Version','Spatial'];  // You can also use indices like [0, 3]
const defaultHiddenColumns = [
    "Last Modified Date",
    "Last Modified User",
    "Title Line 2",
    "Title Line 3",
    "Title Line 4",
    "Activity Code",
    "Created by",
    "Spatial"
]; // Columns to hide by default

const projects_MIDPs = [
    {name:"HI7411",id:"b.76c59b97-feaf-413c-9bd0-43cf8aaa3133"},
    {name:"DT1117",id:"b.2e6449f9-ce25-4a9c-8835-444cb5ea03bf"},
    {name:"DT1116",id:"b.7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
]

const projects_DR = [
    {name:"HI7411",id:"b.76c59b97-feaf-413c-9bd0-43cf8aaa3133"},
    {name:"DT1117",id:"b.2e6449f9-ce25-4a9c-8835-444cb5ea03bf"},
    {name:"DT1116",id:"b.7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
]

const projects_TR = [
    {name:"DT1116",id:"b.7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
]

const projects_MDR = [
    {name:"DT1117",id:"b.2e6449f9-ce25-4a9c-8835-444cb5ea03bf"},
]

const defaultHeaders = [
    { width: '10px', content: '' },
    { width: '300px', content: 'File Name', order: 'desc' },
    { width: '50px', content: 'Version', order: 'desc' },
    { width: '60px', content: 'File URL', order: 'desc' },
    { width: '60px', content: 'Revision', order: 'desc' },
    { content: 'Folder Path', order: 'desc' },
    { content: 'File Description', order: 'desc' },
    { content: 'Title Line 1', order: 'desc' },
    { content: 'Title Line 2', order: 'desc' },
    { content: 'Title Line 3', order: 'desc' },
    { content: 'Title Line 4', order: 'desc' },
    { width: '60px', content: 'Status', order: 'desc' },
    { content: 'Activity Code', order: 'desc' },
    { width: '120px', content: 'Last Modified User', order: 'desc' },
    { width: '120px', content: 'Last Modified Date', order: 'desc' },
    { width: '120px', content: 'Created by', order: 'desc' },
    { content: 'Spatial', order: 'desc' },
];

const a66Headers = [
    { width: '10px', content: '' },
    { width: '300px', content: 'File Name', order: 'desc' },
    { width: '50px', content: 'Version', order: 'desc' },
    { width: '60px', content: 'File URL', order: 'desc' },
    { width: '60px', content: 'Revision', order: 'desc' },
    { content: 'Folder Path', order: 'desc' },
    { content: 'File Description', order: 'desc' },
    { content: 'Title Line 1', order: 'desc' },
    { content: 'Title Line 2', order: 'desc' },
    { content: 'Title Line 3', order: 'desc' },
    { content: 'Title Line 4', order: 'desc' },
    { width: '60px', content: 'Status', order: 'desc' },
    { content: 'Activity Code', order: 'desc' },
    { content: 'Series', order: 'desc' },
    { width: '120px', content: 'Last Modified User', order: 'desc' },
    { width: '120px', content: 'Last Modified Date', order: 'desc' },
    { width: '120px', content: 'Created by', order: 'desc' },
    { content: 'Spatial', order: 'desc' },
];