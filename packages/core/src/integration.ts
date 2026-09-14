import { Buffer } from "buffer";
import type { AccountMeta, Address, Instruction } from "@solana/kit";
import type { CpiData, CpiEntry } from "./types";

/** Shared adapter implementation; generated packages supply program-specific entries. */
export function createIntegration<const Entries extends readonly CpiEntry[]>(entries: Entries) {
  type Id = Entries[number]["id"];
  const registry = new Map<number, CpiEntry>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.id) || entry.id < 0 || entry.id > 255 || registry.has(entry.id)) {
      throw new Error(`Invalid or duplicate CPI ID: ${entry.id}`);
    }
    const roles = new Set<string>();
    if (!Array.isArray(entry.requiredAccounts))
      throw new Error("Missing required account bindings");
    for (const binding of entry.requiredAccounts) {
      if (
        typeof binding.role !== "string" ||
        !/^[a-z][a-z0-9_:]*$/.test(binding.role) ||
        roles.has(binding.role)
      )
        throw new Error("Invalid or duplicate account role");
      if (!Number.isInteger(binding.index) || binding.index < 0 || binding.index > 253)
        throw new Error("Invalid account binding index");
      roles.add(binding.role);
    }
    registry.set(entry.id, entry);
  }
  function getEntry(id: Id): CpiEntry {
    const entry = registry.get(id);
    if (!entry) throw new Error(`CPI ID ${id} is not registered in this integration`);
    return entry;
  }
  return {
    createCpiData(
      cpiType: Id,
      accounts: readonly AccountMeta[],
      data?: Uint8Array,
      lookupTables?: Address[],
    ): CpiData {
      const entry = getEntry(cpiType);
      return {
        cpiType,
        programId: entry.programId,
        accounts: accounts.map((account) => ({ ...account })),
        data,
        lookupTables,
      };
    },
    fromInstruction(
      cpiType: Id,
      instruction: Instruction,
      options?: { programProvidedArgs?: boolean; lookupTables?: Address[] },
    ): CpiData {
      const entry = getEntry(cpiType);
      if (instruction.programAddress !== entry.programId)
        throw new Error("Instruction program does not match CPI entry");
      let data = Buffer.from(instruction.data ?? []);
      if (entry.discriminator) {
        const discriminator = Buffer.from(entry.discriminator);
        if (!data.subarray(0, discriminator.length).equals(discriminator)) {
          throw new Error("Instruction discriminator does not match CPI entry");
        }
        data = data.subarray(discriminator.length);
      }
      return {
        cpiType,
        programId: entry.programId,
        accounts: (instruction.accounts ?? []).map((account) => ({ ...account })),
        data: options?.programProvidedArgs ? undefined : data,
        lookupTables: options?.lookupTables,
      };
    },
  };
}
