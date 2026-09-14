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

const namedBaseline = JSON.parse(
  readFileSync(new URL("./fixtures/namedAccountRegistry.json", import.meta.url)),
);
const withdrawal = (catalog) =>
  catalog.programs.find((p) => p.name === "kamino-lending").entries.find((e) => e.id === 17);
for (const [name, change] of [
  [
    "missing roles",
    (e) => {
      delete e.requiredAccounts;
    },
  ],
  [
    "duplicate role",
    (e) => {
      e.requiredAccounts.push({ ...e.requiredAccounts[0] });
    },
  ],
  [
    "invalid role",
    (e) => {
      e.requiredAccounts[0].role = "User Account";
    },
  ],
  [
    "invalid index",
    (e) => {
      e.requiredAccounts[0].index = 254;
    },
  ],
  [
    "fractional index",
    (e) => {
      e.requiredAccounts[0].index = 0.5;
    },
  ],
])
  test(`catalog rejects ${name} in account bindings`, () => {
    const c = copy();
    change(withdrawal(c));
    assert.throws(() => validateCatalog(c));
  });
test("binding baseline rejects weakened, renamed, moved or added requirements", () => {
  validateCompatibility(original, namedBaseline);
  for (const change of [
    (e) => {
      e.requiredAccounts.pop();
    },
    (e) => {
      e.requiredAccounts[1].role = "other_destination";
    },
    (e) => {
      e.requiredAccounts[1].index = 8;
    },
    (e) => {
      e.requiredAccounts.push({ role: "new_requirement", index: 2 });
    },
  ]) {
    const c = copy();
    change(withdrawal(c));
    assert.throws(() => validateCompatibility(c, namedBaseline), /changed account binding/);
  }
  const reordered = copy();
  withdrawal(reordered).requiredAccounts.reverse();
  validateCompatibility(reordered, namedBaseline);
  const lostLegacyTarget = copy();
  withdrawal(lostLegacyTarget).requiredAccounts.shift();
  assert.throws(() => validateCompatibility(lostLegacyTarget, legacy), /user_account/);
});
