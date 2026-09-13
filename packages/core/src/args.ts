import { Buffer } from "buffer";

/**
 * CPI args buffer utilities.
 *
 * # Wire format (per CPI slot)
 *
 * ```text
 * [u16 LE length]
 *   • 0xFFFF → skip (program must compute args)
 *   • 0      → no instruction args (invoke with empty data)
 *   • N > 0  → N bytes of client-provided data follow
 * ```
 *
 * Protocol-specific getter functions (e.g. `getPerenaMintArgs`) return raw
 * serialized bytes (no prefix). Wrap them with `serializeArgs()` to add
 * the u16 length prefix before packing into the CPI args buffer.
 */

/** Sentinel u16 value meaning "program must provide args." */
export const SKIP_SENTINEL = 0xffff;

/**
 * Serialize CPI args with a u16 LE length prefix.
 *
 * - Called with data    → `[u16_len, ...data]`  (client provides args; len may be 0)
 * - Called without data → `[0xFF, 0xFF]`         (skip — program provides args)
 *
 * @example
 * ```typescript
 * serializeArgs(getPerenaMintArgs({ ... })) // [16, 0, ...16 bytes]
 * serializeArgs(jupiterSwapData)            // [N, 0, ...N bytes]
 * serializeArgs(Buffer.alloc(0))            // [0, 0] — no-args instruction
 * serializeArgs()                           // [0xFF, 0xFF] — skip
 * ```
 */
export function serializeArgs(data?: Buffer | Uint8Array): Buffer {
  if (data === undefined) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(SKIP_SENTINEL);
    return buf;
  }
  const len = data.length;
  if (len >= SKIP_SENTINEL) {
    throw new RangeError("CPI args must be at most 65534 bytes; 65535 is the skip sentinel");
  }
  const buf = Buffer.alloc(2 + len);
  buf.writeUInt16LE(len);
  if (len > 0) {
    Buffer.from(data).copy(buf, 2);
  }
  return buf;
}

/**
 * Fluent builder for packing CPI args into a single buffer.
 *
 * Each `.add()` call wraps the provided data with a u16 length prefix
 * via `serializeArgs`, then appends it.
 *
 * @example
 * ```typescript
 * const cpiArgs = new CpiArgsBuilder()
 *   .add(getPerenaMintArgs({ amountYieldingDeposit: 1e6, minBankMintMinted: 9e5 }))
 *   .add(jupiterSwapData)
 *   .noArgs()            // no-args instruction (len = 0)
 *   .skip()              // program provides args (0xFFFF)
 *   .build();
 * ```
 */
export class CpiArgsBuilder {
  private parts: Buffer[] = [];

  /**
   * Add client-provided args for the next CPI slot.
   * Automatically wraps with a u16 LE length prefix.
   */
  add(data: Buffer | Uint8Array): this {
    this.parts.push(serializeArgs(data));
    return this;
  }

  /**
   * Mark the next CPI slot as a no-args instruction (length = 0).
   * The Rust side will invoke the CPI with empty instruction data.
   */
  noArgs(): this {
    this.parts.push(serializeArgs(Buffer.alloc(0)));
    return this;
  }

  /**
   * Mark the next CPI slot as program-provided (sentinel 0xFFFF).
   * The Rust handler must compute args and call `invoke_cpi` directly.
   */
  skip(): this {
    this.parts.push(serializeArgs());
    return this;
  }

  /** Build the final packed buffer. */
  build(): Buffer {
    return Buffer.concat(this.parts);
  }
}
