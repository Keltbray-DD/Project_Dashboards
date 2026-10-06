import { test } from "node:test";
import assert from "node:assert/strict";
import { isDrawingRegisterRow, isClientVisible } from "../src/data/registers.js";
import { stackDocuments } from "../src/data/stacking.js";

test("drawing register: C revision + DR form, or Deliverable = Yes", () => {
  assert.equal(isDrawingRegisterRow({ revision: "C01", form: "DR" }), true);
  assert.equal(isDrawingRegisterRow({ revision: "P02", form: "DR" }), false);
  assert.equal(isDrawingRegisterRow({ revision: "C01", form: "M3" }), false);
  assert.equal(isDrawingRegisterRow({ revision: "P01", form: "RP", deliverable: "Yes" }), true);
  assert.equal(isDrawingRegisterRow({}), false);
});

test("client visibility: PUBLISHED and SHARED_TO_CLIENT folders only", () => {
  assert.equal(isClientVisible({ folder_path: "Project Files / 03 PUBLISHED / Drainage" }), true);
  assert.equal(isClientVisible({ folder_path: "Project Files / 0F.Shared_To_Client" }), true);
  assert.equal(isClientVisible({ folder_path: "Project Files / 02 SHARED" }), false);
  assert.equal(isClientVisible({ folder_path: "Project Files / 01 WIP" }), false);
});

test("stacking only client-visible rows never exposes a WIP copy as current", () => {
  const rows = [
    { name: "D-1.pdf", folder_path: "01 WIP", revision: "P02.01" },
    { name: "D-1.pdf", folder_path: "03 PUBLISHED", revision: "C01" },
    { name: "D-2.pdf", folder_path: "02 SHARED", revision: "P01" },
  ];
  const docs = stackDocuments(rows.filter(isClientVisible));
  assert.deepEqual(docs.map((d) => [d.docNo, d.current.revision, d.siblings.length]), [["D-1", "C01", 0]]);
});
