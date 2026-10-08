import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOption, indexDescriptions, loadValueDescriptions } from "../src/data/namingStandard.js";

test("parseOption reads objects and strings", () => {
  assert.deepEqual(parseOption({ value: "ARP", description: "Arup" }), { value: "ARP", description: "Arup" });
  assert.deepEqual(parseOption("ARP"), { value: "ARP", description: "" });
  assert.deepEqual(parseOption({ value: "DR", description: "DR" }), { value: "DR", description: "" });
});

test("indexDescriptions maps naming-standard fields to row fields", () => {
  const out = indexDescriptions([
    [
      { name: "Originator", options: [{ value: "ARP", description: "Arup" }, { value: "KEL", description: "" }] },
      { name: "project pin", options: [{ value: "HI7411", description: "A66 NTP" }] },
      { name: "Number", options: [{ value: "0001", description: "x" }] }, // not a row field
    ],
    [{ name: "Originator", options: [{ value: "ARP", description: "Other" }, { value: "JAC", description: "Jacobs" }] }],
  ]);
  assert.deepEqual(out, { originator: { ARP: "Arup", JAC: "Jacobs" }, project_pin: { HI7411: "A66 NTP" } });
});

test("loadValueDescriptions uses the first folder with a naming standard", async () => {
  globalThis.sessionStorage = undefined; // no cache in Node
  const asked = [];
  const aps = {
    async folder(_p, id) {
      asked.push(id);
      return { data: { attributes: { extension: { data: { namingStandardIds: id === "f2" ? ["ns1"] : [] } } } } };
    },
    async namingStandard(_p, id) {
      assert.equal(id, "ns1");
      return [{ name: "Form", options: [{ value: "DR", description: "Drawing" }] }];
    },
  };
  assert.deepEqual(await loadValueDescriptions(aps, "p", ["f1", "f2", "f3"]), { form: { DR: "Drawing" } });
  assert.deepEqual(asked, ["f1", "f2"]);
  assert.deepEqual(await loadValueDescriptions(aps, "p", []), {});
});
