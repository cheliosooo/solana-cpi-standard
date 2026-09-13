import { Buffer } from "buffer";
import { AccountRole, type AccountMeta, type Address } from "@solana/kit";
import { CpiArgsBuilder } from "./args";
import type { CpiData, InstructionRefs } from "./types";

export interface DeduplicateOptions {
  /** Preserve positions, including duplicates. CPI references use the first occurrence. */
  initialAccounts?: readonly AccountMeta[];
  trackAddresses?: readonly Address[];
}
export interface CreateCpiRefsResult {
  accounts: AccountMeta[];
  refs: InstructionRefs;
  lookupTables: Address[];
}
export interface CreateMultiCpiRefsResult {
  accounts: AccountMeta[];
  refsGroups: InstructionRefs[];
  lookupTables: Address[];
}

/** Pack multiple independent groups against a shared remaining-account pool.
 * Signer flags are stripped: the host supplies its authorized signer/PDA on chain.
 * Any outer transaction signatures must be declared by the host instruction itself.
 */
export function createMultiCpiRefs(
  groups: readonly (readonly CpiData[])[],
  options: DeduplicateOptions = {},
): CreateMultiCpiRefsResult {
  const accounts = (options.initialAccounts ?? []).map((account) => ({ ...account }));
  const index = new Map<Address, number>();
  accounts.forEach((account, i) => {
    if (!index.has(account.address)) index.set(account.address, i);
  });
  const lookupTables = new Set<Address>();
  const refsGroups = groups.map((cpis) => {
    if (cpis.length > 256) throw new RangeError("A CPI group supports at most 256 slots");
    const indices: number[] = [];
    const lengths: number[] = [];
    const types: number[] = [];
    const args = new CpiArgsBuilder();
    for (const cpi of cpis) {
      if (!Number.isInteger(cpi.cpiType) || cpi.cpiType < 0 || cpi.cpiType > 255)
        throw new RangeError("CPI ID must fit in u8");
      const cpiAccounts = [{ address: cpi.programId, role: AccountRole.READONLY }, ...cpi.accounts];
      if (cpiAccounts.length > 255)
        throw new RangeError("A CPI supports at most 255 accounts including its program");
      lengths.push(cpiAccounts.length);
      types.push(cpi.cpiType);
      for (const account of cpiAccounts) {
        let position = index.get(account.address);
        if (position === undefined) {
          position = accounts.length;
          index.set(account.address, position);
          accounts.push({ ...account });
        } else {
          // Kit roles are flags: bit 0 writable, bit 1 signer. Preserve the
          // most permissive role until signer flags are stripped below.
          accounts[position].role = (accounts[position].role | account.role) as AccountRole;
        }
        indices.push(position);
      }
      if (cpi.data === undefined) args.skip();
      else args.add(cpi.data);
      cpi.lookupTables?.forEach((table) => lookupTables.add(table));
    }
    if (accounts.length > 256) throw new RangeError("Account pool supports at most 256 positions");
    return {
      cpi: {
        accounts: { indices: Buffer.from(indices), lengths: Buffer.from(lengths) },
        types: Buffer.from(types),
        args: args.build(),
      },
      tracked: Buffer.alloc(0),
    };
  });
  // Empty groups still need the initial-account limit checked.
  if (accounts.length > 256) throw new RangeError("Account pool supports at most 256 positions");
  const tracked = Buffer.from(
    (options.trackAddresses ?? []).map((address) => {
      const position = index.get(address);
      if (position === undefined) throw new Error(`Tracked address ${address} not found in pool`);
      return position;
    }),
  );
  refsGroups.forEach((refs) => {
    refs.tracked = Buffer.from(tracked);
  });
  return {
    accounts: accounts.map((account) => ({
      ...account,
      role: (account.role & AccountRole.WRITABLE) as AccountRole,
    })),
    refsGroups,
    lookupTables: [...lookupTables],
  };
}

export function createCpiRefs(
  cpis: readonly CpiData[],
  options?: DeduplicateOptions,
): CreateCpiRefsResult {
  const { accounts, refsGroups, lookupTables } = createMultiCpiRefs([cpis], options);
  return { accounts, refs: refsGroups[0], lookupTables };
}
