import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getIntegrations, validateCatalog, validateCompatibility } from "../scripts/catalog.mjs";
const original = JSON.parse(readFileSync(new URL("../registry/catalog.json", import.meta.url)));
const legacy = JSON.parse(readFileSync(new URL("./fixtures/legacyRegistry.json", import.meta.url)));
const copy = () => structuredClone(original);
test("catalog preserves all existing IDs and program identities", () => {
  validateCatalog(original);
  validateCompatibility(original, legacy);
  assert.equal(original.programs.flatMap((p) => p.entries).length, 19);
});
test("one Kamino integration includes both programs without changing CPI meanings", () => {
  const kamino = getIntegrations(original).find((i) => i.name === "kamino");
  assert.deepEqual(
    kamino.programs.map((p) => p.name),
    ["kamino-lending", "kamino-farms"],
  );
  assert.deepEqual(
    kamino.programs.flatMap((p) => p.entries.map((e) => e.id)).sort((a, b) => a - b),
    [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  );
  const duplicate = copy();
  duplicate.programs.find((p) => p.name === "kamino-farms").entries[0].id = 8;
  assert.throws(() => validateCatalog(duplicate), /Duplicate/);
  const changed = copy();
  changed.programs.find((p) => p.name === "kamino-farms").programId = changed.programs.find(
    (p) => p.name === "kamino-lending",
  ).programId;
  assert.throws(() => validateCompatibility(changed, legacy), /changed meaning/);
});
for (const [name, mutate] of [
  [
    "invalid integration name",
    (c) => {
      c.programs[0].integration = "../kamino";
    },
  ],
  [
    "cross-program duplicate",
    (c) => {
      c.programs[1].entries[0].id = 0;
    },
  ],
  [
    "retired ID",
    (c) => {
      c.programs[0].entries[0].id = 2;
    },
  ],
  [
    "out-of-range ID",
    (c) => {
      c.programs[0].entries[0].id = 256;
    },
  ],
  [
    "negative ID",
    (c) => {
      c.programs[0].entries[0].id = -1;
    },
  ],
  [
    "fractional ID",
    (c) => {
      c.programs[0].entries[0].id = 0.5;
    },
  ],
  [
    "duplicate label",
    (c) => {
      c.programs[1].entries[0].label = "JUPITER_SWAP";
    },
  ],
  [
    "duplicate program",
    (c) => {
      c.programs[1].programId = c.programs[0].programId;
    },
  ],
])
  test(`catalog rejects ${name}`, () => {
    const c = copy();
    mutate(c);
    assert.throws(() => validateCatalog(c));
  });
test("existing entries cannot be repurposed or silently removed", () => {
  const changed = copy();
  changed.programs[0].entries[0].instructionName = "other";
  assert.throws(() => validateCompatibility(changed, legacy), /changed meaning/);
  const removed = copy();
  removed.programs[0].entries = [];
  assert.throws(() => validateCompatibility(removed, legacy), /must be retired/);
  removed.retiredIds.push(0);
  validateCompatibility(removed, legacy);
  removed.retiredIds = removed.retiredIds.filter((id) => id !== 2);
  assert.throws(() => validateCompatibility(removed, legacy), /stay reserved/);
});
