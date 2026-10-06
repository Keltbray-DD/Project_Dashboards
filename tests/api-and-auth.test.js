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

test("aps.walkFolder follows pagination and recurses with folder paths", async () => {
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
  const found = await aps.walkFolder("b.p", "root", "Root");
  assert.deepEqual(
    found.map((f) => [f.item.id, f.folderPath, f.folderId]).sort(),
    [["i1", "Root", "root"], ["i2", "Root", "root"], ["i3", "Root / Sub", "sub"]]
  );
  const flat = await aps.walkFolder("b.p", "root", "Root", { recurse: false });
  assert.equal(flat.length, 2);
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
