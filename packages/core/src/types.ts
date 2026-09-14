import type { Buffer } from "buffer";
import type { AccountMeta, Address } from "@solana/kit";

/** Accounts exclude the program; the packing helpers prepend it. */
export interface CpiData {
  cpiType: number;
  programId: Address;
  accounts: AccountMeta[];
  /** Anchor arguments without discriminator, or complete raw instruction data.
   * Undefined means the invoking program must supply arguments; empty means no args. */
  data?: Uint8Array;
  lookupTables?: Address[];
}
export interface CpiMapping {
  indices: Buffer;
  lengths: Buffer;
}
export interface CpiRefs {
  accounts: CpiMapping;
  types: Buffer;
  args: Buffer;
}
export interface InstructionRefs {
  cpi: CpiRefs;
  tracked: Buffer;
}
export type CpiCategory =
  | "Swap"
  | "Deposit"
  | "Withdraw"
  | "Borrow"
  | "Repay"
  | "ClaimIncentives"
  | "UpdateMintMetadata";
/** Semantic role names, distinct from Solana Kit signer/writable AccountRole flags. */
export type CpiAccountRole = string;
export const USER_ACCOUNT = "user_account";
export const SOURCE_TOKEN_ACCOUNT = "source_token_account";
export const DESTINATION_TOKEN_ACCOUNT = "destination_token_account";
export interface AccountBinding {
  readonly role: CpiAccountRole;
  readonly index: number;
}
export interface CpiEntry {
  readonly id: number;
  readonly label: string;
  readonly programId: Address;
  readonly discriminator: readonly number[] | null;
  readonly category: CpiCategory | null;
  readonly requiredAccounts: readonly AccountBinding[];
}
