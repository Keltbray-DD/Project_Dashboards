const appName = "Forma Docs Dashboard";
const appVersion = "v1.5.1";

let projectID;
const hubID = "b.24d2d632-e01b-4ca0-b988-385be827cb04"
// PKCE public client ID for the Autodesk APS app. Safe to ship in the
// browser — the matching APS app must be configured as a Public Client so
// the /token endpoint accepts client_id + code_verifier instead of a
// confidential client_secret.
const apsClientId = "rIZ4T6uq2qbVGsBucgGz8zwSPPrENzupOQGkO9ii01U4nNT0"
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

let isClient = true
let userEmail

let tableType

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
let mainFileArray = [];
let files = [];
let fileData =[];
let originalFileData = [];
let rawFileData = [];
let statusCounts = [];
let folderCount = [];
let filteredData = [];
let folderPaths = [];
let invalidObjects = [];
let columnNamesDefault = [];
let columnNames =[];
let arrayDiscipline =[];
let arrayFunction = [];
let arrayForm =[];
let ignoreFieldsInvaildCheck = ["last_modified_user","created_by_user","title_line_2","title_line_3","title_line_4","activity_code","actual_finish_date","actual_start_date","folderid","planned_finish_date","planned_start_date","tracking_status","notes","category","spatial","deliverable"];
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

// Maps the ACC custom attribute display name (as stored in the project's
// naming standard) to the field key our `files[]` rows use. The batch-get
// response gives us {name, value} per attribute — this is how we translate
// "Title Line 1" → title_line_1 etc. when patching a file row in place.
const ATTR_NAME_MAP = {
    "Title Line 1": "title_line_1",
    "Title Line 2": "title_line_2",
    "Title Line 3": "title_line_3",
    "Title Line 4": "title_line_4",
    "Revision": "revision",
    "Revision Description": "revision_description",
    "Status": "status",
    "State": "state",
    "Activity Code": "activity_code",
    "File Description": "file_description",
    "Classification": "classification",
    "Tracking Status": "tracking_status",
    "Notes": "notes",
    "Category": "category",
    "Actual Start Date": "actual_start_date",
    "Planned Start Date": "planned_start_date",
    "Actual Finish Date": "actual_finish_date",
    "Planned Finish Date": "planned_finish_date",
    "Series": "series",
    // The following come from ACC's naming-standard validation — they
    // populate the Drawing Register / SHEAF filters and other downstream
    // rendering. If your project's attribute is named differently (e.g.
    // "Project PIN" with a capital PIN), add another key here pointing
    // at the same field.
    "Form": "form",
    "Deliverable": "deliverable",
    "Discipline": "discipline",
    "Function": "function",
    "Originator": "originator",
    "Project Pin": "project_pin",
    "Project PIN": "project_pin",
    "Spatial": "spatial",
};

const projects_MIDPs = [
    {name:"HI7411",id:"76c59b97-feaf-413c-9bd0-43cf8aaa3133"},
    {name:"DT1117",id:"2e6449f9-ce25-4a9c-8835-444cb5ea03bf"},
    {name:"DT1116",id:"7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
]

const projects_DR = [
    {name:"HI7411",id:"76c59b97-feaf-413c-9bd0-43cf8aaa3133"},
    {name:"DT1117",id:"2e6449f9-ce25-4a9c-8835-444cb5ea03bf"}
]

const projects_SHEAF_DR = [
    {name:"DT1116",id:"7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
]

const projects_TR = [
    {name:"DT1116",id:"7c7ca0c5-bfc3-4ef1-9396-c72c6270f457"}
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

const drawingRegisterHeaders = [
    { width: '10px', content: '' },
    { width: '300px', content: 'File Name', order: 'desc' },
    { width: '50px', content: 'Version', order: 'desc' },
    { width: '60px', content: 'File URL', order: 'desc' },
    { width: '60px', content: 'Revision', order: 'desc' },
    { content: 'Folder Path', order: 'desc' },
    { content: 'File Description', order: 'desc' },
    { content: 'Title Line 1', order: 'desc' },
    { width: '60px', content: 'Status', order: 'desc' },
    { width: '120px', content: 'Issued', order: 'desc' },
];