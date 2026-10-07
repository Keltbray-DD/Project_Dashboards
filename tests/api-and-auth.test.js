import { test } from "node:test";
import assert from "node:assert/strict";
import { request, HttpError } from "../src/api/http.js";
import { createAps } from "../src/api/aps.js";
import { base64Url, codeChallenge } from "../src/auth/pkce.js";
import { isInternalEmail } from "../src/auth/roles.js";
import { createStore } from "../src/core/store.js";
import { projectFeatures, FIELD_ATTR_NAME } from "../src/core/config.js";

const jsonResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k] ?? null },
  text: async () => (body === undefined ? "" : JSON.stringify(body)),
  json: async () => body,
});

test("request retries 429s then succeeds, sending the bearer token", async () => {
  const seen = [];
  const responses = [jsonResponse(429, {}), jsonResponse(503, {}), jsonResponse(200, { ok: 1 })];
  const fetch = async (url, init) => {
    seen.push(init.headers.Authorization);
    return responses.shift();
  };
  assert.deepEqual(await request("u", { token: "T", fetch, retryDelayMs: 1 }), { ok: 1 });
  assert.deepEqual(seen, ["Bearer T", "Bearer T", "Bearer T"]);
});

test("request throws HttpError with status and body on failure", async () => {
  const fetch = async () => jsonResponse(403, { detail: "nope" });
  await assert.rejects(request("u", { fetch }), (e) => e instanceof HttpError && e.status === 403 && e.body.detail === "nope");
});

test("request times out a hung call, retries, then throws status 0", async () => {
  let calls = 0;
  const fetch = (url, init) => {
    calls++;
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  };
  await assert.rejects(request("u", { fetch, timeoutMs: 5, retries: 2, retryDelayMs: 1 }), (e) => e instanceof HttpError && e.status === 0 && /timed out/.test(e.body.error));
  assert.equal(calls, 3);
});

test("request recovers when a timed-out call succeeds on retry", async () => {
  let calls = 0;
  const fetch = (url, init) => {
    calls++;
    if (calls === 1) return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    return Promise.resolve(jsonResponse(200, { ok: true }));
  };
  assert.deepEqual(await request("u", { fetch, timeoutMs: 5, retryDelayMs: 1 }), { ok: true });
});

test("aps.walkFolders follows pagination and recurses with folder paths", async () => {
  const pages = {
    "/folders/root/contents?includeHidden=false": {
      data: [
        { type: "items", id: "i1", relationships: { tip: { data: { id: "v1" } } } },
        { type: "folders", id: "sub", attributes: { displayName: "Sub" } },
      ],
      included: [{ id: "v1" }],
      links: { next: { href: "PAGE2" } },
    },
    PAGE2: {
      data: [{ type: "items", id: "i2", relationships: { tip: { data: { id: "v2" } } } }],
      included: [{ id: "v2" }],
    },
    "/folders/sub/contents?includeHidden=false": {
      data: [{ type: "items", id: "i3", relationships: { tip: { data: { id: "v3" } } } }],
      included: [{ id: "v3" }],
    },
  };
  const fetch = async (url) => {
    const key = Object.keys(pages).find((k) => url.endsWith(k));
    return jsonResponse(200, pages[key]);
  };
  const aps = createAps({ getToken: async () => "T", fetch });
  const progress = [];
  const { files, failed } = await aps.walkFolders("b.p", [{ id: "root", path: "Root" }], { gapMs: 0, onProgress: (p) => progress.push(p) });
  assert.deepEqual(
    files.map((f) => [f.item.id, f.folderPath, f.folderId, f.root]).sort(),
    [["i1", "Root", "root", 0], ["i2", "Root", "root", 0], ["i3", "Root / Sub", "sub", 0]]
  );
  assert.deepEqual(failed, []);
  assert.deepEqual(progress.at(-1), { done: 2, queued: 2, files: 3 });
  const flat = await aps.walkFolders("b.p", [{ id: "root", path: "Root", recurse: false }], { gapMs: 0 });
  assert.equal(flat.files.length, 2);
});

test("aps.walkFolders skips a folder that fails, keeps the rest and caps parallel requests", async () => {
  const tree = { root: ["a", "b", "c", "d"], a: [], b: [], c: [], d: [] };
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = async (url) => {
    const id = url.match(/folders\/([^/]+)\/contents/)[1];
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    if (id === "b") return jsonResponse(403, { reason: "no access" });
    return jsonResponse(200, {
      data: [
        ...tree[id].map((child) => ({ type: "folders", id: child, attributes: { displayName: child.toUpperCase() } })),
        { type: "items", id: `i-${id}`, relationships: { tip: { data: { id: `v-${id}` } } } },
      ],
      included: [{ id: `v-${id}` }],
    });
  };
  const aps = createAps({ getToken: async () => "T", fetch });
  const { files, failed } = await aps.walkFolders("b.p", [{ id: "root", path: "" }], { concurrency: 2, gapMs: 0 });
  assert.deepEqual(files.map((f) => f.folderPath).sort(), ["", "A", "C", "D"]);
  assert.deepEqual(failed.map((f) => [f.folderPath, f.status]), [["B", 403]]);
  assert.ok(maxInFlight <= 2, `at most 2 requests at once (saw ${maxInFlight})`);
});

test("aps.findFolders finds matching folders up to two levels down, with relative paths", async () => {
  const folders = (...names) => ({ data: names.map((n) => ({ type: "folders", id: n, attributes: { displayName: n } })) });
  const pages = {
    start: folders("0C.WIP", "Z.PROJECT_ADMIN", "Project Area"),
    "Z.PROJECT_ADMIN": folders("Contracts"),
    "Project Area": folders("0G.PUBLISHED"),
  };
  const fetch = async (url) => jsonResponse(200, pages[decodeURIComponent(url.match(/folders\/([^/]+)\/contents/)[1])] || { data: [] });
  const aps = createAps({ getToken: async () => "T", fetch });
  const found = await aps.findFolders("b.p", "start", /WIP|SHARED|PUBLISHED/i);
  assert.deepEqual(found, [{ id: "0C.WIP", path: "0C.WIP" }, { id: "0G.PUBLISHED", path: "Project Area / 0G.PUBLISHED" }]);
});

test("aps.updateCustomAttributes reports per-attribute failures on HTTP 200", async () => {
  const fetch = async () => jsonResponse(200, { results: [{ id: "a", status: 200 }, { id: "b", status: 400 }] });
  const aps = createAps({ getToken: async () => "T", fetch });
  const res = await aps.updateCustomAttributes("p", "urn:v?version=1", [{ id: "a", value: "x" }]);
  assert.equal(res.ok, false);
  assert.equal(res.failed.length, 1);
});

test("PKCE challenge matches the RFC 7636 test vector", async () => {
  assert.equal(
    await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  );
  assert.equal(base64Url(new Uint8Array([251, 255])), "-_8");
});

test("isInternalEmail matches whole domains only", () => {
  const domains = ["aureos.com", "keltbray.com"];
  assert.equal(isInternalEmail("Jo.Bloggs@Aureos.com", domains), true);
  assert.equal(isInternalEmail("a@uk.keltbray.com", domains), true);
  assert.equal(isInternalEmail("keltbray@gmail.com", domains), false);
  assert.equal(isInternalEmail("a@notaureos.com", domains), false);
  assert.equal(isInternalEmail("", domains), false);
});

test("store notifies with changed keys only", () => {
  const s = createStore({ a: 1, b: 2 });
  const calls = [];
  s.subscribe((_state, changed) => calls.push(changed));
  s.set({ a: 1 });
  s.set({ a: 2, b: 2 });
  s.set((st) => ({ b: st.b + 1 }));
  assert.deepEqual(calls, [["a"], ["b"]]);
  assert.deepEqual(s.get(), { a: 2, b: 3 });
});

test("config: project features and field → attribute names", () => {
  assert.deepEqual(projectFeatures("b.76c59b97-feaf-413c-9bd0-43cf8aaa3133").extraFields, ["series"]);
  assert.deepEqual(projectFeatures("unknown").registers, ["midp"]);
  assert.equal(FIELD_ATTR_NAME.project_pin, "Project Pin");
  assert.equal(FIELD_ATTR_NAME.title_line_1, "Title Line 1");
});
