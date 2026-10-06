// Dev-only mock backend. Loaded as a classic script BEFORE the app
// module on dev/*.html, it replaces window.fetch with canned Autodesk and
// Power Automate responses built from generated data, so the UI can be
// developed and demoed without signing in. Never loaded by the real pages.
//
// The refresh token is redirected to a separate storage key so using
// the mock never disturbs a real signed-in session on the same origin.
(function () {
  "use strict";

  // ---------- isolate auth storage ----------
  const REAL_KEY = "user_refresh_token";
  const MOCK_KEY = "mock_user_refresh_token";
  const getItem = Storage.prototype.getItem;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (k) { return getItem.call(this, k === REAL_KEY ? MOCK_KEY : k); };
  Storage.prototype.setItem = function (k, v) { return setItem.call(this, k === REAL_KEY ? MOCK_KEY : k, v); };
  Storage.prototype.removeItem = function (k) { return removeItem.call(this, k === REAL_KEY ? MOCK_KEY : k); };
  if (!localStorage.getItem(REAL_KEY)) localStorage.setItem(REAL_KEY, "mock-refresh");

  // ---------- deterministic generated data ----------
  let seed = 42;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pad = (n, w) => String(n).padStart(w, "0");

  const ORIGINATORS = ["ARP", "KEL", "JAC", "WSP"];
  const FUNCTIONS = ["DRN", "HWY", "STR", "GEN", "ENV"];
  const SPATIAL = ["ZZ", "CH01", "CH02", "CH03"];
  const FORMS = ["DR", "M3", "RP", "SP", "SH"];
  const TITLES = ["Drainage layout", "General arrangement", "Long sections", "Outfall details", "Catchment plan", "Pavement layout", "Retaining wall details", "Signing and lining", "Environmental mitigation", "Utilities diversion"];
  const DISCIPLINE_FOLDER = { DRN: "Drainage", HWY: "Highways", STR: "Structures", GEN: "General", ENV: "Environmental" };

  const files = [];
  const attrs = {}; // version urn → [{ name, value }]
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  for (let i = 0; i < 420; i++) {
    const orig = pick(ORIGINATORS);
    const func = pick(FUNCTIONS);
    const spatial = pick(SPATIAL);
    const form = pick(FORMS);
    const ext = rnd() < 0.75 ? "pdf" : pick(["dwg", "rvt", "xlsx"]);
    const name = `EX0001-${orig}-${func}-${spatial}-${form}-C-${pad(1000 + i, 4)}.${ext}`;
    const title = `${pick(TITLES)} ${1 + (i % 9)}`;

    // Lifecycle: every doc has a WIP copy; some reach SHARED, fewer PUBLISHED.
    const stages = [["01 WIP", `P01.0${1 + (i % 3)}`]];
    if (rnd() < 0.6) stages.push(["02 SHARED", "P01"]);
    if (stages.length === 2 && rnd() < 0.45) stages.push(["03 PUBLISHED", "C01"]);
    if (stages.length === 3 && rnd() < 0.3) stages.push(["01 WIP", "P02.01"]);

    stages.forEach(([folder, revision], s) => {
      const id = `${i}-${s}`;
      const version = 1 + Math.floor(rnd() * 3);
      const urn = `urn:adsk.wipemea:fs.file:vf.mock${id}?version=${version}`;
      const lineage = `urn:adsk.wipemea:dm.lineage:mock${id}`;
      const sub = folder === "01 WIP" ? ` / ${DISCIPLINE_FOLDER[func]}` : "";
      files.push({
        Name: name,
        itemIdVersion: urn,
        itemID: lineage,
        folderID: `urn:adsk.wipemea:fs.folder:co.${folder.replace(/\W/g, "")}${sub.replace(/\W/g, "")}`,
        folderPath: `Project Files / ${folder}${sub}`,
        lastModifiedUserName: pick(["Jo Bloggs", "Sam Patel", "Alex Reid", "Chris Wong"]),
        lastModifiedTime: iso(rnd() * 40 * 86400000),
        createUserName: pick(["Jo Bloggs", "Sam Patel", "Alex Reid"]),
      });
      // Some deliberate gaps so compliance has something to find.
      const blankOr = (v, p) => (rnd() < p ? "" : v);
      const rev = rnd() < 0.04 ? "Rev A" : blankOr(revision, 0.03);
      attrs[urn] = [
        { name: "Title Line 1", value: blankOr(title, 0.04) },
        { name: "Title Line 2", value: blankOr("Sheet " + (1 + (i % 4)), 0.5) },
        { name: "Revision", value: rev },
        { name: "Status", value: blankOr(folder.includes("PUBLISHED") ? pick(["A1", "A2"]) : folder.includes("SHARED") ? pick(["S2", "S3", "S4"]) : "S0", 0.05) },
        { name: "File Description", value: rnd() < 0.08 ? "TIDP Placeholder File" : blankOr(`${title} — ${DISCIPLINE_FOLDER[func]}`, 0.06) },
        { name: "Form", value: blankOr(form, 0.02) },
        { name: "Originator", value: blankOr(orig, 0.01) },
        { name: "Function", value: blankOr(func, 0.03) },
        { name: "Spatial", value: blankOr(spatial, 0.22) },
        { name: "Discipline", value: func === "STR" ? "S" : "C" },
        { name: "Activity Code", value: blankOr("AC-" + pad(i % 40, 3), 0.4) },
      ];
    });
  }

  const PROJECTS = [
    { id: "b.mock-project-0001", name: "Example Project", code: "EX0001", image: "" },
    { id: "b.mock-project-0002", name: "Example Framework (no data)", code: "EX0002", image: "" },
  ];

  // ---------- routing ----------
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  async function handle(url, init) {
    const method = (init && init.method) || "GET";
    const body = init && init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;

    if (url.includes("/authentication/v2/token")) {
      return json({ access_token: "mock-access", refresh_token: "mock-refresh", expires_in: 3600 });
    }
    if (url.includes("userprofile.autodesk.com/userinfo")) {
      return json({ sub: "MOCKUSER", name: "Josh Cole", email: "josh.cole@aureos.com", picture: "" });
    }
    if (url.includes("30f57be09dd04690be4212eb4ed6df65")) {
      await delay(400);
      return json(PROJECTS);
    }
    if (url.includes("aa3b3f6ba93f4901acef15184cd5b8de")) {
      await delay(700);
      return json({
        type: "single",
        data: [{
          Title: "EX0001 extract",
          ProjectName: body && body.project_Name,
          Modified: iso(12 * 60000),
          files_list: JSON.stringify(body && body.project_Name === "Example Project" ? files : []),
          folder_array_deliverables: "[]",
        }],
      });
    }
    if (url.includes("9c87a5536bdb4693a934559d0ce9d483")) {
      await delay(300);
      return json({ ok: true });
    }
    if (url.includes("versions:batch-get") && method === "POST") {
      await delay(250 + rnd() * 250);
      return json({ results: (body.urns || []).map((urn) => ({ urn, customAttributes: attrs[urn] || [] })) });
    }
    if (url.includes("/versions") && url.includes("/items/")) {
      return json({ data: [] });
    }
    console.warn("[mock-api] unhandled", method, url);
    return json({ message: "not mocked" }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    // Static assets (CSS, fonts, icons, modules) go to the network as normal.
    if (!/autodesk\.com|powerplatform\.com/.test(url)) return realFetch(input, init);
    return handle(url, init);
  };

  window.__MOCK__ = { files, attrs, PROJECTS };
  console.info(`[mock-api] active — ${files.length} file versions across ${new Set(files.map((f) => f.Name)).size} documents`);
})();
