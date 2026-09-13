import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

/** @param {string} value */
export function assertLocalRpcUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Sandbox writes require an HTTP loopback RPC URL");
  }
  return url.href;
}

/**
 * @param {string} url
 * @param {string} method
 * @param {unknown[]} params
 * @returns {Promise<unknown>}
 */
export async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

/** Reference: tokenized-positions/scripts/surfpool-deploy.js. Only local writes. */
export async function deploySandbox(rpcUrl, programId, binaryPath) {
  assertLocalRpcUrl(rpcUrl);
  const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const program = new PublicKey(programId);
  const [programData] = PublicKey.findProgramAddressSync([program.toBuffer()], loader);
  const binary = readFileSync(binaryPath);
  const data = Buffer.alloc(45 + binary.length);
  data.writeUInt32LE(3, 0); // UpgradeableLoaderState::ProgramData
  data[12] = 1;
  program.toBuffer().copy(data, 13);
  binary.copy(data, 45);
  const programBytes = Buffer.alloc(36);
  programBytes.writeUInt32LE(2, 0); // UpgradeableLoaderState::Program
  programData.toBuffer().copy(programBytes, 4);
  for (const [key, bytes, executable] of [
    [programData, data, false],
    [program, programBytes, true],
  ]) {
    const lamports = await rpc(rpcUrl, "getMinimumBalanceForRentExemption", [bytes.length]);
    await rpc(rpcUrl, "surfnet_setAccount", [
      key.toBase58(),
      { data: bytes.toString("hex"), executable, owner: loader.toBase58(), lamports },
    ]);
  }
}
