let projectID
const hubID = "b.24d2d632-e01b-4ca0-b988-385be827cb04"
let accesToken
//const projectID = "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133";

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

let files = [];
let fileData =[];
let statusCounts = [];
let filteredData = [];
let folderPaths = [];
let invalidObjects = [];
let columnNames = [];

let missingTitleDataChart
let missingRevisionDataChart
let formatRevisionDataChart
let missingStatusDataChart
let missingDescriptionDataChart
let statusChart

let selectedTab

const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;
const defaultHiddenColumns = [
    "Last Modified Date",
    "Last Modified User",
    "Title Line 2",
    "Title Line 3",
    "Title Line 4",
    "Activity Code",
    "Last Modified User"
]; // Columns to hide by default
