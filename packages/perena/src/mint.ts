import { Buffer } from "buffer";

/**
 * Inner arguments for Perena mint CPI.
 *
 * Matches Rust `PerenaMintArgs` in crates/perena/src/args.rs.
 * Borsh size: 16 bytes (2 × u64 LE).
 */
export interface PerenaMintArgs {
  /** Amount of yielding tokens to deposit (e.g., USDC amount) */
  amountYieldingDeposit: bigint;
  /** Minimum USD* to receive (slippage protection) */
  minBankMintMinted: bigint;
}

export function getPerenaMintArgs(data: PerenaMintArgs): Uint8Array {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(data.amountYieldingDeposit, 0);
  buf.writeBigUInt64LE(data.minBankMintMinted, 8);
  return buf;
}
