let projectID
//const projectID = "b.76c59b97-feaf-413c-9bd0-43cf8aaa3133";

let tableBody;
let searchInput;
let folderFilter;

let titleLineMissingCount = 0;
let titleLinePresentCount = 0;
let revisionMissingCount = 0;
let revisionPresentCount = 0;
let statusMissingCount = 0;
let statusPresentCount = 0;
let revisionFormatCheckInvaildCount = 0;
let revisionFormatCheckPresentCount = 0;

let fileData =[];
let statusCounts = [];
let filteredData = [];
let folderPaths = [];

let missingTitleDataChart
let missingRevisionDataChart
let formatRevisionDataChart
let missingStatusDataChart
let statusChart

const pattern = /^[A-Z]\d{2}(\.\d{2})?$/;