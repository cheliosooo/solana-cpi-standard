import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalogFromExports,
  discoverRegistryCrates,
  readRustRegistry,
  ROOT,
} from "../scripts/rust-registry.mjs";
import { generate } from "../scripts/generate.mjs";

const fixtureSource = `use solana_cpi_standard_core::{CpiCategory, CpiEntry};
use solana_pubkey::{pubkey, Pubkey};
pub const PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");
pub static CPI_ENTRIES: &[CpiEntry] = &[CpiEntry {
    id: 200,
    label: "EXPORT_FIXTURE",
    program_id: PROGRAM_ID,
    instruction_name: "fixture_instruction",
    category: Some(CpiCategory::Swap),
    expected_target_account_index: Some(0),
}];
#[cfg(test)]
solana_cpi_standard_core::export_cpi_registry! { "export-fixture" => PROGRAM_ID }
`;

test(
  "compiled Rust exports discover new crates, generate TS, and reject collisions and missing exports",
  { timeout: 300000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "cpi-rust-registry-test-"));
    const previousTarget = process.env.CARGO_TARGET_DIR;
    // Reuse dependency builds; this isolated workspace never edits the real registries.
    process.env.CARGO_TARGET_DIR = previousTarget ?? join(ROOT, "target");
    try {
      for (const file of [
        "Cargo.toml",
        "Cargo.lock",
        "crates",
        "programs",
        "tests/fixtures/legacyRegistry.json",
      ]) {
        const target = join(root, file);
        mkdirSync(join(target, ".."), { recursive: true });
        cpSync(join(ROOT, file), target, { recursive: true });
      }
      const crate = join(root, "crates/export-fixture");
      mkdirSync(join(crate, "src"), { recursive: true });
      writeFileSync(
        join(crate, "Cargo.toml"),
        `[package]
name = "solana-cpi-standard-export-fixture"
version.workspace = true
edition.workspace = true
[dependencies]
solana-cpi-standard-core.workspace = true
solana-pubkey.workspace = true
[dev-dependencies]
solana-cpi-standard-core = { workspace = true, features = ["registry-export"] }
`,
      );
      const source = join(crate, "src/lib.rs");
      writeFileSync(source, fixtureSource);
      // The new fixture is absent from the aggregate registry's dependency list.
      const lock = spawnSync(
        "cargo",
        ["check", "--offline", "-p", "solana-cpi-standard-export-fixture"],
        {
          cwd: root,
          encoding: "utf8",
          env: process.env,
        },
      );
      assert.equal(lock.status, 0, lock.stderr);
      assert.deepEqual(
        discoverRegistryCrates(root).map((c) => c.integration),
        ["export-fixture", "jupiter", "kamino", "metaplex-token-metadata", "perena"],
      );
      // There is no input JSON catalog or TypeScript package in this workspace.
      generate(false, root);
      const catalog = JSON.parse(readFileSync(join(root, "registry/catalog.json"), "utf8"));
      const fixture = catalog.programs.find((p) => p.name === "export-fixture");
      assert.equal(fixture.entries[0].id, 200);
      assert.deepEqual(fixture.entries[0].discriminator, [
        ...createHash("sha256").update("global:fixture_instruction").digest().subarray(0, 8),
      ]);
      const tsPath = join(root, "packages/export-fixture/src/generated.ts");
      const generated = readFileSync(tsPath, "utf8");
      assert.match(generated, /EXPORT_FIXTURE: 200/);
      assert.match(generated, /expectedTargetAccountIndex: 0/);
      assert.equal(readFileSync(source, "utf8"), fixtureSource);
      generate(true, root);
      writeFileSync(tsPath, `${generated}\n`);
      assert.throws(() => generate(true, root), /stale.*packages\/export-fixture/);
      assert.equal(readFileSync(tsPath, "utf8"), `${generated}\n`);
      writeFileSync(tsPath, generated);
      const catalogBefore = readFileSync(join(root, "registry/catalog.json"), "utf8");
      writeFileSync(source, fixtureSource.replace("id: 200", "id: 0"));
      assert.throws(() => readRustRegistry(root), /Duplicate.*ID 0.*JUPITER_SWAP.*EXPORT_FIXTURE/);
      assert.throws(() => generate(false, root), /Duplicate.*ID 0/);
      assert.equal(readFileSync(tsPath, "utf8"), generated);
      assert.equal(readFileSync(join(root, "registry/catalog.json"), "utf8"), catalogBefore);
      writeFileSync(source, fixtureSource.replace("id: 200", "id: 2"));
      assert.throws(() => readRustRegistry(root), /retired CPI ID 2.*retired IDs/);
      writeFileSync(source, fixtureSource.replace("#[cfg(test)]", "#[cfg(any())]"));
      assert.throws(
        () => readRustRegistry(root),
        /Missing export from solana-cpi-standard-export-fixture/,
      );
    } finally {
      if (previousTarget === undefined) delete process.env.CARGO_TARGET_DIR;
      else process.env.CARGO_TARGET_DIR = previousTarget;
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("Rust export validation rejects mismatched retirement data and undeclared targets", () => {
  const crates = [
    { name: "crate-a", integration: "a" },
    { name: "crate-b", integration: "b" },
  ];
  const entry = {
    id: 100,
    label: "A",
    programId: "11111111111111111111111111111111",
    instructionName: "",
    discriminator: null,
    category: null,
    expectedTargetAccountIndex: null,
  };
  const first = {
    crate: "crate-a",
    retiredIds: [2],
    programs: [{ name: "a", programIdConstant: "PROGRAM_ID", programId: entry.programId }],
    entries: [entry],
  };
  const second = { ...first, crate: "crate-b", retiredIds: [] };
  assert.throws(() => catalogFromExports(crates, [first, second]), /Retired IDs differ/);
  assert.throws(
    () =>
      catalogFromExports(
        [crates[0]],
        [{ ...first, entries: [{ ...entry, programId: "undeclared" }] }],
      ),
    /undeclared program/,
  );
  assert.throws(() => catalogFromExports([crates[0]], []), /Missing Rust registry export/);
});
