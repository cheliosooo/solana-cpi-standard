const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { address, AccountRole } = require("../packages/core/node_modules/@solana/kit");
const core = require("../packages/core/dist");
const jupiter = require("../packages/jupiter/dist");
const kamino = require("../packages/kamino/dist");
const perena = require("../packages/perena/dist");
const metadata = require("../packages/metaplex-token-metadata/dist");
const a = address("11111111111111111111111111111111");
const b = address("SysvarRent111111111111111111111111111111111");
const meta = (address, role = AccountRole.READONLY) => ({ address, role });
const swap = () =>
  jupiter.createCpiData(
    jupiter.CpiTypes.JUPITER_SWAP,
    [meta(a), meta(b, AccountRole.WRITABLE_SIGNER)],
    Uint8Array.from([170, 187]),
    [a],
  );
const deposit = () =>
  kamino.createCpiData(
    kamino.CpiTypes.K_DEPOSIT,
    [meta(b), meta(a, AccountRole.WRITABLE)],
    undefined,
    [a, b],
  );

test("wire packing matches shared Rust Borsh fixture", () => {
  const { refs, accounts, lookupTables } = core.createCpiRefs([swap(), deposit()], {
    trackAddresses: [a],
  });
  assert.deepEqual([...refs.cpi.accounts.indices], [0, 1, 2, 3, 2, 1]);
  assert.deepEqual([...refs.cpi.accounts.lengths], [3, 3]);
  assert.deepEqual([...refs.cpi.types], [0, 16]);
  assert.deepEqual([...refs.cpi.args], [2, 0, 170, 187, 255, 255]);
  assert.deepEqual([...refs.tracked], [1]);
  assert.deepEqual(accounts, [
    meta(jupiter.PROGRAM_ID),
    meta(a, AccountRole.WRITABLE),
    meta(b, AccountRole.WRITABLE),
    meta(kamino.KAMINO_LENDING_PROGRAM_ID),
  ]);
  assert.deepEqual(lookupTables, [a, b]);
  const vectors = [
    refs.cpi.accounts.indices,
    refs.cpi.accounts.lengths,
    refs.cpi.types,
    refs.cpi.args,
    refs.tracked,
  ];
  const borsh = Buffer.concat(
    vectors.map((data) => {
      const length = Buffer.alloc(4);
      length.writeUInt32LE(data.length);
      return Buffer.concat([length, data]);
    }),
  );
  assert.deepEqual(borsh, readFileSync(`${__dirname}/fixtures/instructionRefs.bin`));
});

test("groups share a pool and tracked addresses resolve across groups", () => {
  const result = core.createMultiCpiRefs([[swap()], [deposit()]], {
    trackAddresses: [kamino.KAMINO_LENDING_PROGRAM_ID],
  });
  assert.deepEqual(
    result.refsGroups.map((r) => [...r.cpi.accounts.indices]),
    [
      [0, 1, 2],
      [3, 2, 1],
    ],
  );
  assert.deepEqual(
    result.refsGroups.map((r) => [...r.tracked]),
    [[3], [3]],
  );
  result.refsGroups[0].tracked[0] = 0;
  assert.deepEqual([...result.refsGroups[1].tracked], [3]);
});

test("ordered initial accounts preserve duplicates and inputs remain unchanged", () => {
  const initialAccounts = [meta(a), meta(b), meta(a)];
  const cpis = [swap()];
  const before = structuredClone({ initialAccounts, cpis });
  const result = core.createCpiRefs(cpis, { initialAccounts, trackAddresses: [a] });
  assert.deepEqual(
    result.accounts.map((m) => m.address),
    [a, b, a, jupiter.PROGRAM_ID],
  );
  assert.deepEqual([...result.refs.cpi.accounts.indices], [3, 0, 1]);
  assert.deepEqual([...result.refs.tracked], [0]);
  assert.deepEqual({ initialAccounts, cpis }, before);
});

test("empty refs and unknown tracked addresses", () => {
  const { refs, accounts } = core.createCpiRefs([]);
  assert.deepEqual(accounts, []);
  for (const bytes of [
    refs.cpi.types,
    refs.cpi.args,
    refs.cpi.accounts.lengths,
    refs.cpi.accounts.indices,
    refs.tracked,
  ])
    assert.equal(bytes.length, 0);
  assert.throws(() => core.createCpiRefs([], { trackAddresses: [a] }), /not found/);
});

test("args distinguish skip, empty and bytes and reject sentinel collision", () => {
  assert.deepEqual(core.serializeArgs(), Buffer.from([255, 255]));
  assert.deepEqual(core.serializeArgs(new Uint8Array()), Buffer.from([0, 0]));
  assert.deepEqual(
    new core.CpiArgsBuilder()
      .skip()
      .noArgs()
      .add(Uint8Array.from([8]))
      .build(),
    Buffer.from([255, 255, 0, 0, 1, 0, 8]),
  );
  const max = core.serializeArgs(new Uint8Array(65534));
  assert.equal(max.length, 65536);
  assert.equal(max.readUInt16LE(), 65534);
  assert.throws(() => core.serializeArgs(new Uint8Array(65535)), RangeError);
  assert.throws(() => core.serializeArgs(new Uint8Array(65536)), RangeError);
});

test("u8 fields reject overflow, fractions and negatives", () => {
  for (const cpiType of [-1, 0.5, 256, NaN])
    assert.throws(() => core.createCpiRefs([{ ...swap(), cpiType }]), RangeError);
  assert.equal(core.createCpiRefs(Array.from({ length: 256 }, swap)).refs.cpi.types.length, 256);
  assert.throws(() => core.createCpiRefs(Array.from({ length: 257 }, swap)), RangeError);
  assert.equal(
    core.createCpiRefs([{ ...swap(), accounts: Array(254).fill(meta(a)) }]).refs.cpi.accounts
      .lengths[0],
    255,
  );
  assert.throws(
    () => core.createCpiRefs([{ ...swap(), accounts: Array(255).fill(meta(a)) }]),
    RangeError,
  );
  const initialAccounts = Array(255).fill(meta(a));
  assert.equal(
    core.createCpiRefs([], { initialAccounts: [...initialAccounts, meta(b)] }).accounts.length,
    256,
  );
  assert.throws(
    () => core.createCpiRefs([], { initialAccounts: Array(257).fill(meta(a)) }),
    RangeError,
  );
  assert.throws(() => core.createCpiRefs([swap()], { initialAccounts }), RangeError);
  assert.throws(
    () => core.createMultiCpiRefs([], { initialAccounts: Array(257).fill(meta(a)) }),
    RangeError,
  );
});

test("every generated integration agrees with the catalog", () => {
  const catalog = require("../registry/catalog.json");
  const integrations = {
    jupiter,
    perena,
    kamino,
    "metaplex-token-metadata": metadata,
  };
  const ids = new Set();
  for (const program of catalog.programs) {
    const integration = integrations[program.integration ?? program.name];
    for (const entry of program.entries) {
      assert.equal(integration.CpiTypes[entry.label], entry.id);
      assert.equal(ids.has(entry.id), false);
      ids.add(entry.id);
      assert.equal(integration.createCpiData(entry.id, []).programId, program.programId);
    }
  }
  assert.equal(ids.size, 19);
});

test("instruction adapters validate programs and Anchor discriminators", () => {
  const entry = kamino.CPI_ENTRIES.find((e) => e.id === kamino.CpiTypes.K_DEPOSIT);
  const data = Buffer.concat([
    Buffer.from(entry.discriminator),
    Buffer.from([7, 0, 0, 0, 0, 0, 0, 0]),
  ]);
  const instruction = {
    programAddress: kamino.KAMINO_LENDING_PROGRAM_ID,
    accounts: [meta(a)],
    data,
  };
  assert.deepEqual(kamino.fromInstruction(entry.id, instruction).data, data.subarray(8));
  assert.equal(
    kamino.fromInstruction(entry.id, instruction, { programProvidedArgs: true }).data,
    undefined,
  );
  assert.throws(
    () => kamino.fromInstruction(entry.id, { ...instruction, programAddress: jupiter.PROGRAM_ID }),
    /program/,
  );
  assert.throws(
    () => kamino.fromInstruction(entry.id, { ...instruction, data: Buffer.alloc(0) }),
    /discriminator/,
  );
  assert.throws(
    () => kamino.fromInstruction(entry.id, { ...instruction, data: Buffer.alloc(8) }),
    /discriminator/,
  );
  assert.throws(() => kamino.createCpiData(0, []), /not registered/);
  const raw = jupiter.fromInstruction(0, {
    programAddress: jupiter.PROGRAM_ID,
    data: Uint8Array.from([1, 2]),
  });
  assert.deepEqual([...raw.data], [1, 2]);
});

test("one Kamino adapter routes lending and farms IDs to their respective programs", () => {
  assert.equal(kamino.CPI_ENTRIES.length, 12);
  for (const [id, program, otherProgram] of [
    [kamino.CpiTypes.K_DEPOSIT, kamino.KAMINO_LENDING_PROGRAM_ID, kamino.KAMINO_FARMS_PROGRAM_ID],
    [
      kamino.CpiTypes.K_HARVEST_REWARD,
      kamino.KAMINO_FARMS_PROGRAM_ID,
      kamino.KAMINO_LENDING_PROGRAM_ID,
    ],
  ]) {
    const entry = kamino.CPI_ENTRIES.find((e) => e.id === id);
    const data = Buffer.concat([Buffer.from(entry.discriminator), Buffer.alloc(8)]);
    const ix = { programAddress: program, accounts: [meta(a)], data };
    assert.equal(kamino.createCpiData(id, []).programId, program);
    assert.equal(kamino.fromInstruction(id, ix).programId, program);
    assert.deepEqual(kamino.fromInstruction(id, ix).data, Buffer.alloc(8));
    assert.throws(
      () => kamino.fromInstruction(id, { ...ix, programAddress: otherProgram }),
      /program/,
    );
  }
});

test("Perena amount payloads retain exact u64 layout and precision", () => {
  const amount = BigInt("18446744073709551615");
  const mint = perena.getPerenaMintArgs({
    amountYieldingDeposit: amount,
    minBankMintMinted: BigInt(7),
  });
  assert.equal(Buffer.from(mint).toString("hex"), "ffffffffffffffff0700000000000000");
  const burn = perena.getPerenaBurnArgs({
    amountToBurn: BigInt(7),
    minimumYieldingWithdrawn: amount,
  });
  assert.equal(Buffer.from(burn).toString("hex"), "0700000000000000ffffffffffffffff");
  assert.throws(
    () =>
      perena.getPerenaMintArgs({ amountYieldingDeposit: BigInt(-1), minBankMintMinted: BigInt(0) }),
    RangeError,
  );
  assert.throws(
    () =>
      perena.getPerenaBurnArgs({
        amountToBurn: amount + BigInt(1),
        minimumYieldingWithdrawn: BigInt(0),
      }),
    RangeError,
  );
});
