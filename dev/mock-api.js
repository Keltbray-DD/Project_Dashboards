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

  // ?as=client signs in as an external client; ?as=internal switches back.
  const asParam = new URLSearchParams(location.search).get("as");
  if (asParam) sessionStorage.setItem("mock_as", asParam);
  const AS_CLIENT = sessionStorage.getItem("mock_as") === "client";

  // ?slow=1 makes metadata loading take a while (like a big live project);
  // ?size=N sets the number of documents (default 420).
  const qs = new URLSearchParams(location.search);
  const SLOW = qs.get("slow") === "1";
  const DOC_COUNT = Math.max(1, parseInt(qs.get("size") || "420", 10));
  // ?flaky=1: batch-get randomly throttles (429), errors (500) or hangs,
  // and ~1% of files are reported unavailable (deleted / no access).
  const FLAKY = qs.get("flaky") === "1";
  // ?hang=ms shortens how long a hung request waits (default: until the
  // app's own timeout aborts it).
  const flakyStats = { calls: 0, throttled: 0, errored: 0, hung: 0 };

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

  for (let i = 0; i < DOC_COUNT; i++) {
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
        folderPath: `${folder}${sub}`,
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
        { name: "Document Classification", value: blankOr(pick(["Official", "Official", "Official-Sensitive"]), 0.07) },
      ];
    });
  }

  // Older versions share their tip’s attributes in the mock.
  const tipByBase = {};
  for (const urn of Object.keys(attrs)) tipByBase[urn.split("?")[0]] = urn;
  const attrsFor = (urn) => attrs[urn] || attrs[tipByBase[urn.split("?")[0]]] || [];

  let defId = 1;
  const def = (name, type, arrayValues) => ({ id: "attr-" + defId++, name, type, ...(arrayValues ? { arrayValues } : {}) });
  const ATTR_DEFS = [
    def("Title Line 1", "string"), def("Title Line 2", "string"), def("Title Line 3", "string"), def("Title Line 4", "string"),
    def("Revision", "string"), def("Status", "array", ["S0", "S1", "S2", "S3", "S4", "A1", "A2", "A3", "B1"]),
    def("File Description", "string"), def("Activity Code", "string"),
    def("Document Classification", "array", ["Official", "Official-Sensitive"]),
  ];

  const PROJECTS = [
    { id: "b.mock-project-0001", name: "Example Project", code: "EX0001", image: "" },
    { id: "b.mock-project-0002", name: "Example Empty Project", code: "EX0002", image: "" },
    { id: "b.mock-project-0003", name: "Example Framework", code: "EX0003", image: "" },
  ];

  // ---------- live folder trees ----------
  // Each mock start folder is a tree built from its files' folderPaths
  // (relative to that folder). Listed like Forma's folder contents: paged
  // 100 entries at a time; clients get 403 on WIP folders.
  const ROOT_FOLDER = "urn:adsk.wipemea:fs.folder:co.ProjectFiles";
  const folderNodes = new Map(); // folder id → { rootId, list, path }
  const folderIdFor = (rootId, path) => (path ? rootId + "." + path.replace(/\W/g, "") : rootId);
  function addTree(rootId, list) {
    const add = (path) => folderNodes.set(folderIdFor(rootId, path), { rootId, list, path });
    add("");
    for (const f of list) {
      const parts = f.folderPath.split(" / ");
      parts.forEach((_, i) => add(parts.slice(0, i + 1).join(" / ")));
    }
  }
  function folderContents(folderId, url) {
    const node = folderNodes.get(folderId);
    if (!node) return { data: [] };
    const { rootId, list, path } = node;
    if (AS_CLIENT && /WIP/.test(path)) return { forbidden: true };
    const depth = path ? path.split(" / ").length : 0;
    const children = [...folderNodes.values()]
      .filter((n) => n.rootId === rootId && n.path && n.path.split(" / ").length === depth + 1 && (!path || n.path.startsWith(path + " / ")))
      .map((n) => n.path);
    const entries = [
      ...children.map((p) => ({ type: "folders", id: folderIdFor(rootId, p), attributes: { displayName: p.split(" / ").pop() } })),
      ...list.filter((f) => f.folderPath === path).map((f) => ({
        type: "items",
        id: f.itemID,
        attributes: { displayName: f.Name, createUserName: f.createUserName },
        relationships: { tip: { data: { id: f.itemIdVersion } } },
        _file: f,
      })),
    ];
    const PAGE = 100;
    const page = Number(new URL(url).searchParams.get("page[number]") || 0);
    const slice = entries.slice(page * PAGE, (page + 1) * PAGE);
    const next = (page + 1) * PAGE < entries.length ? url.replace(/&page\[number\]=\d+|$/, "&page[number]=" + (page + 1)) : null;
    return {
      data: slice.map(({ _file, ...e }) => e),
      included: slice.filter((e) => e._file).map(({ _file: f }) => ({
        type: "versions",
        id: f.itemIdVersion,
        attributes: { displayName: f.Name, versionNumber: Number(f.itemIdVersion.split("=")[1]), lastModifiedUserName: f.lastModifiedUserName, lastModifiedTime: f.lastModifiedTime, createTime: f.lastModifiedTime },
      })),
      ...(next ? { links: { next: { href: next } } } : {}),
    };
  }

  // "Example Project" (EX0001): one tree under Project Files.
  addTree(ROOT_FOLDER, files);

  // An additional MIDP folder ("RAMS") outside the WIP / SHARED / PUBLISHED
  // folders: loaded and shown, but Compliance counts it as "not checked".
  const RAMS_FOLDER = "urn:adsk.wipemea:fs.folder:co.RAMS";
  const ramsFiles = [1, 2, 3, 4, 5].map((n) => {
    const urn = `urn:adsk.wipemea:fs.file:vf.mockrams${n}?version=1`;
    attrs[urn] = [{ name: "Title Line 1", value: n === 3 ? "" : `Method statement ${n}` }, { name: "Status", value: "S0" }];
    return {
      Name: `EX0001-KEL-GEN-ZZ-RA-C-${pad(n, 4)}.pdf`,
      itemIdVersion: urn,
      itemID: `urn:adsk.wipemea:dm.lineage:mockrams${n}`,
      folderPath: "",
      lastModifiedUserName: "Sam Patel",
      lastModifiedTime: iso(n * 86400000),
      createUserName: "Sam Patel",
    };
  });
  addTree(RAMS_FOLDER, ramsFiles);

  // Framework extract for "Example Framework", shaped like the real one
  // (DT1117): a Parent record for the framework plus one Child record per
  // region, named by Sub_folder_name, each with its own start folder.
  // Inside a region each top-level folder is a sub-project. Documents are
  // spread by number: across regions, then across that region's
  // sub-projects; every 17th sits at region level (the region's own WIP /
  // SHARED / PUBLISHED folders), every 40th on the Parent (framework-wide)
  // and every 53rd in a training folder (dropped by the dashboard).
  // "Depot" has no Sub_folder_name (ProjectName fallback) and its extract
  // paths start with the region folder, to exercise both shapes.
  const FRAMEWORK = [
    { name: "North", subs: ["NO101_Alder_Road (PS000101)", "NO102 - Birch Lane Substation (PS000102)", "NO103_Cedar_Park (PS000103) CANCELLED"] },
    { name: "South", subs: ["SO201_Dock_Street (PS000201)", "SO202_Elm_Grove (PS000202)"] },
    { name: "East", subs: ["EA301_Fen_Bridge (PS000301)", "EA302_Grange_Farm (PS000302)", "EA303_Heath_Lane (PS000303)"] },
    { name: "Depot", subs: ["DE401_Main_Depot (PS000401)"], noFolderName: true, pathHasRegion: true },
  ];
  const FRAMEWORK_ROOT = "urn:adsk.wipemea:fs.folder:co.Framework";
  const regionRoot = (region) => "urn:adsk.wipemea:fs.folder:co.Region" + region.name;
  const frameworkParent = [];
  const frameworkBuckets = FRAMEWORK.map(() => []);
  {
    const docIndex = (f) => parseInt(f.Name.match(/-(\d{4})\./)[1], 10) - 1000;
    for (const f of files) {
      const d = docIndex(f);
      if (d % 40 === 0) {
        frameworkParent.push({ ...f, folderPath: "XX-FRAMEWORK / " + f.folderPath });
        continue;
      }
      const i = d % FRAMEWORK.length;
      const region = FRAMEWORK[i];
      const top =
        d % 53 === 0 ? "XX0000_Training_Example"
        : d % 17 === 0 ? ""
        : region.subs[Math.floor(d / FRAMEWORK.length) % region.subs.length];
      frameworkBuckets[i].push({ ...f, folderPath: top ? top + " / " + f.folderPath : f.folderPath });
    }
    addTree(FRAMEWORK_ROOT, frameworkParent);
    FRAMEWORK.forEach((region, i) => addTree(regionRoot(region), frameworkBuckets[i]));
  }
  function frameworkExtract() {
    const choice = (Value) => ({ Value });
    return {
      type: "framework",
      data: [
        {
          Title: "mock-project-0003",
          ProjectName: "Example Framework",
          Framework_lineage: choice("Parent"),
          start_folder_id: FRAMEWORK_ROOT,
          Modified: iso(5 * 60000),
          files_list: JSON.stringify(frameworkParent),
          folder_array_deliverables: "[]",
        },
        ...FRAMEWORK.map((region, i) => ({
          Title: "mock-project-0003",
          ProjectName: "Example Framework " + region.name,
          Framework_lineage: choice("Child"),
          ...(region.noFolderName ? {} : { Sub_folder_name: region.name }),
          start_folder_id: regionRoot(region),
          Modified: iso((10 + i) * 60000),
          files_list: JSON.stringify(region.pathHasRegion ? frameworkBuckets[i].map((f) => ({ ...f, folderPath: region.name + " / " + f.folderPath })) : frameworkBuckets[i]),
          folder_array_deliverables: "[]",
        })),
      ],
    };
  }

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
      return json(AS_CLIENT
        ? { sub: "MOCKCLIENT", name: "Client User", email: "client.user@example.com", picture: "" }
        : { sub: "MOCKUSER", name: "Josh Cole", email: "josh.cole@aureos.com", picture: "" });
    }
    if (url.includes("30f57be09dd04690be4212eb4ed6df65")) {
      await delay(400);
      return json(PROJECTS);
    }
    if (url.includes("aa3b3f6ba93f4901acef15184cd5b8de")) {
      await delay(700);
      if (body && body.project_Name === "Example Framework") return json(frameworkExtract());
      return json({
        type: "single",
        data: [{
          Title: "EX0001 extract",
          ProjectName: body && body.project_Name,
          Modified: iso(12 * 60000),
          ...(body && body.project_Name === "Example Project"
            ? { start_folder_id: ROOT_FOLDER, additional_MIDP_folders: JSON.stringify([{ folderID: RAMS_FOLDER, folderName: "RAMS" }]) }
            : {}),
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
      await delay(SLOW ? 2500 + rnd() * 1500 : 250 + rnd() * 250);
      // ?down=1 (or __MOCK__.down = true in the console): every batch fails,
      // to test the "couldn't load — Retry" path. Set it false, then Retry.
      if (window.__MOCK__.down) return json({ message: "Service unavailable" }, 503);
      if (FLAKY) {
        flakyStats.calls++;
        const r = Math.random();
        if (r < 0.05) {
          // Hang until the app aborts the request.
          flakyStats.hung++;
          return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
        }
        if (r < 0.25) { flakyStats.throttled++; return new Response("{}", { status: 429, headers: { "Retry-After": "1" } }); }
        if (r < 0.35) { flakyStats.errored++; return json({ message: "Internal error" }, 500); }
      }
      // ~1% of files, chosen by their number so it's stable across calls.
      const unavailable = (urn) => FLAKY && parseInt(urn.replace(/\D/g, "").slice(-4), 10) % 97 === 0;
      const urns = body.urns || [];
      return json({
        results: urns.filter((u) => !unavailable(u)).map((urn) => ({ urn, customAttributes: attrsFor(urn) })),
        errors: urns.filter(unavailable).map((urn) => ({ urn, title: "Not found" })),
      });
    }
    if (url.includes("/topFolders")) {
      return json({ data: [{ id: ROOT_FOLDER, attributes: { name: "Project Files" } }] });
    }
    const contentsMatch = url.match(/\/folders\/([^/?]+)\/contents/);
    if (contentsMatch) {
      await delay(SLOW ? 600 : 120);
      const contents = folderContents(decodeURIComponent(contentsMatch[1]), url);
      return contents.forbidden ? json({ reason: "Forbidden" }, 403) : json(contents);
    }
    if (url.includes("/custom-attribute-definitions")) {
      await delay(200);
      return json({ results: ATTR_DEFS });
    }
    if (url.includes("custom-attributes:batch-update") && method === "POST") {
      await delay(300);
      const urn = decodeURIComponent(url.split("/versions/")[1].split("/custom-attributes")[0]);
      const values = JSON.parse(init.body);
      // A value of "FAIL" simulates Forma rejecting the change.
      if (values.some((v) => v.value === "FAIL")) return json({ results: values.map((v) => ({ id: v.id, status: 400 })) });
      for (const v of values) {
        const def = ATTR_DEFS.find((d) => d.id === v.id);
        const list = attrs[urn] || (attrs[urn] = []);
        const existing = list.find((a) => a.name === def.name);
        if (existing) existing.value = v.value; else list.push({ name: def.name, value: v.value });
      }
      return json({ results: values.map((v) => ({ id: v.id, status: 200 })) });
    }
    const itemMatch = url.match(/\/items\/([^/]+)\/versions/);
    if (itemMatch) {
      await delay(300);
      const lineage = decodeURIComponent(itemMatch[1]);
      const file = files.find((f) => f.itemID === lineage);
      if (!file) return json({ data: [] });
      const tip = parseInt(file.itemIdVersion.split("=")[1], 10);
      const base = file.itemIdVersion.split("?")[0];
      const data = [];
      for (let v = tip; v >= 1; v--) {
        data.push({
          id: base + "?version=" + v,
          attributes: { displayName: file.Name, versionNumber: v, createTime: iso((tip - v + 1) * 5 * 86400000), lastModifiedTime: iso((tip - v + 1) * 5 * 86400000), createUserName: file.createUserName },
        });
      }
      return json({ data });
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

  window.__MOCK__ = { files, attrs, PROJECTS, flakyStats, down: qs.get("down") === "1" };
  window.__DEV_PROJECT_FEATURES__ = {
    "mock-project-0001": { code: "EX0001", registers: ["midp", "drawingRegister"], extraFields: [] },
    "mock-project-0003": { code: "EX0003", registers: ["midp", "drawingRegister"], extraFields: [] },
  };
  console.info(`[mock-api] active — ${files.length} file versions across ${new Set(files.map((f) => f.Name)).size} documents`);
})();
