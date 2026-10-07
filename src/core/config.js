// App-wide constants. Everything that used to be scattered across
// variables.js, get_data.js and acc_functions.js lives here, so there is
// one place to change a flow URL or add a project feature.

export const APP_NAME = "Project Dashboard";
export const APP_VERSION = "v2.1.0";

export const APS_BASE = "https://developer.api.autodesk.com";
export const APS_USERINFO_URL = "https://api.userprofile.autodesk.com/userinfo";

// ACC hub (account) the dashboard reads from.
export const HUB_ID = "b.24d2d632-e01b-4ca0-b988-385be827cb04";

// PKCE public client. Safe to ship in the browser: the APS app is a
// Public Client, so /token accepts client_id + code_verifier, no secret.
export const APS_CLIENT_ID = "rIZ4T6uq2qbVGsBucgGz8zwSPPrENzupOQGkO9ii01U4nNT0";
export const APS_SCOPES = "data:read data:write data:create";

// Power Automate flows. NOTE: these are unauthenticated SAS URLs — anyone
// with the URL can call them (see docs/v2-plan.md, open items).
const PA_BASE =
  "https://default917b4d06d2e9475983a3e7369ed74e.8f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/";
const PA_QS = "/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=";
export const PA_FLOWS = {
  projects: PA_BASE + "30f57be09dd04690be4212eb4ed6df65" + PA_QS + "AKQMd6IhhtwV5Rid6zC7KTH3LPtniMWevgkP9UlSKko",
  extract: PA_BASE + "aa3b3f6ba93f4901acef15184cd5b8de" + PA_QS + "rsVMeC9t3eP3LkX1-vcOI2Xk4M-aopqMjV8W_7Y-LF4",
  feedback: PA_BASE + "9c87a5536bdb4693a934559d0ce9d483" + PA_QS + "47zaCSAjFCwW5znjpZKgifJK8YVhJQdsICqIJM91MQ4",
};

// Single projects read their files live from Forma: these MIDP container
// folders (0C.WIP, 0E.SHARED, 0F.SHARED_TO_CLIENT, 0G.PUBLISHED, …) under
// the extract's start folder, plus any additional MIDP folders.
export const MIDP_FOLDER_PATTERN = /WIP|SHARED|PUBLISHED/i;

// Sidebar sections. Each groups the views for one discipline, in order.
// A section only appears when the user can see at least one of its views
// (role + project features decide which views exist — see
// pages/dashboard.js). Route names must be unique across sections.
//
// To add a discipline later (e.g. Project Management, Quality), add an
// entry here and register its views in pages/dashboard.js VIEWS.
export const SECTIONS = [
  { id: "information-management", label: "Information Management", views: ["midp", "drawings", "compliance"] },
  // { id: "project-management", label: "Project Management", views: [] },
  // { id: "quality", label: "Quality", views: [] },
];

export const sectionOf = (route) => SECTIONS.find((s) => s.views.includes(route));

// Email domains treated as internal (admin view). Cosmetic only — real
// authorisation is ACC checking the user's own token on every call.
export const INTERNAL_EMAIL_DOMAINS = ["aureos.com", "keltbray.com", "keltbray.co.uk"];

// ISO 19650 revision code: P01, C02, P02.03 …
export const ISO_REVISION_PATTERN = /^[A-Z]\d{2}(\.\d{2})?$/;

// Placeholder description written by the TIDP upload process.
export const PLACEHOLDER_DESCRIPTION = "TIDP Placeholder File";

// Forma custom-attribute display name → row field key. The batch-get
// response gives {name, value} per attribute; this translates it.
// Two spellings of Project PIN exist across projects.
export const ATTR_NAME_MAP = {
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
  "Document Classification": "classification",
  "Tracking Status": "tracking_status",
  "Notes": "notes",
  "Category": "category",
  "Actual Start Date": "actual_start_date",
  "Planned Start Date": "planned_start_date",
  "Actual Finish Date": "actual_finish_date",
  "Planned Finish Date": "planned_finish_date",
  "Series": "series",
  "Form": "form",
  "Deliverable": "deliverable",
  "Discipline": "discipline",
  "Function": "function",
  "Originator": "originator",
  "Project Pin": "project_pin",
  "Project PIN": "project_pin",
  "Spatial": "spatial",
};

// Field key → the Forma attribute name to PATCH. Reverse of the map
// above, preferring the first spelling listed.
export const FIELD_ATTR_NAME = Object.entries(ATTR_NAME_MAP).reduce((acc, [name, field]) => {
  if (!(field in acc)) acc[field] = name;
  return acc;
}, {});

// Per-project features. Replaces the three hardcoded GUID lists
// (projects_MIDPs / projects_DR / projects_SHEAF_DR) and the inline
// HI7411 checks. Projects not listed get DEFAULT_FEATURES.
//   registers  — which register views the project has
//   extraFields — additional editable fields (e.g. Series)
const DEFAULT_FEATURES = { registers: ["midp"], extraFields: [] };
export const PROJECT_FEATURES = {
  "76c59b97-feaf-413c-9bd0-43cf8aaa3133": { code: "HI7411", registers: ["midp", "drawingRegister"], extraFields: ["series"] },
  "2e6449f9-ce25-4a9c-8835-444cb5ea03bf": { code: "DT1117", registers: ["midp", "drawingRegister"], extraFields: [] },
  "7c7ca0c5-bfc3-4ef1-9396-c72c6270f457": { code: "DT1116", registers: ["midp", "drawingRegister"], extraFields: [] },
};

export function projectFeatures(projectId) {
  const id = bareProjectId(projectId);
  // dev/mock-api.js declares features for its mock projects here.
  const dev = globalThis.__DEV_PROJECT_FEATURES__?.[id];
  return { ...DEFAULT_FEATURES, ...(PROJECT_FEATURES[id] || dev || {}) };
}

// Project IDs arrive both as "b.<guid>" and as the bare GUID.
export function bareProjectId(id) {
  return String(id || "").replace(/^b\./, "");
}
