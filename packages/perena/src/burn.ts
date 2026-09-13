import { Buffer } from "buffer";

/**
 * Inner arguments for Perena burn CPI.
 *
 * Matches Rust `PerenaBurnArgs` in crates/perena/src/args.rs.
 * Borsh size: 16 bytes (2 × u64 LE).
 */
export interface PerenaBurnArgs {
  /** Amount of USD* to burn */
  amountToBurn: bigint;
  /** Minimum yielding tokens to receive (slippage protection) */
  minimumYieldingWithdrawn: bigint;
}

export function getPerenaBurnArgs(data: PerenaBurnArgs): Uint8Array {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(data.amountToBurn, 0);
  buf.writeBigUInt64LE(data.minimumYieldingWithdrawn, 8);
  return buf;
}
