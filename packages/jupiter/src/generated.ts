// Generated from the Rust CPI registries. Run pnpm codegen; do not edit.
import { address } from "@solana/kit";
import { createIntegration } from "@solana-cpi-standard/core";

export const PROGRAM_ID = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
export const CpiTypes = {
  JUPITER_SWAP: 0,
} as const;
export type CpiType = typeof CpiTypes[keyof typeof CpiTypes];

export const CPI_ENTRIES = [
  { id: 0, label: "JUPITER_SWAP", programId: PROGRAM_ID, discriminator: null, category: "Swap", requiredAccounts: [] },
] as const;

export const { createCpiData, fromInstruction } = createIntegration(CPI_ENTRIES);
