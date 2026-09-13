import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertLocalRpcUrl, deploySandbox } from "../scripts/surfpool.mjs";

test("sandbox writes are limited to explicit HTTP loopback endpoints", () => {
  for (const url of ["http://127.0.0.1:8899", "http://localhost:8899", "http://[::1]:8899"]) {
    assert.equal(assertLocalRpcUrl(url), `${url}/`);
  }
  for (const url of [
    "https://api.mainnet-beta.solana.com",
    "http://devnet.solana.com",
    "http://127.0.0.1.example.com",
    "https://localhost:8899",
  ]) {
    assert.throws(() => assertLocalRpcUrl(url), /loopback/);
  }
});
test("deployment refuses a remote endpoint before reading or writing anything", async () => {
  await assert.rejects(
    deploySandbox("https://api.mainnet-beta.solana.com", "unused", "does-not-exist.so"),
    /loopback/,
  );
});
test("integration runner lists suites and rejects unknown ones before a build", () => {
  const script = fileURLToPath(new URL("../scripts/test-integrations.mjs", import.meta.url));
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  for (const name of [
    "jupiter",
    "perena",
    "kamino",
    "kamino-lending",
    "kamino-farms",
    "metaplex-token-metadata",
  ])
    assert.match(help.stdout, new RegExp(name));
  const invalid = spawnSync(process.execPath, [script, "not-a-suite"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown suite/);
  assert.equal(invalid.stdout, "");
});
