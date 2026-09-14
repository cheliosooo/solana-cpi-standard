// Generated from the Rust CPI registries. Run pnpm codegen; do not edit.
import { address } from "@solana/kit";
import { createIntegration } from "@solana-cpi-standard/core";

export const PROGRAM_ID = address("save8RQVPMWNTzU18t3GBvBkN9hT7jsGjiCQ28FpD9H");
export const CpiTypes = {
  PERENA_MINT: 1,
  PERENA_MINT_FEE_EXEMPT: 22,
  PERENA_BURN_FROM_EXTERNAL: 25,
  PERENA_BURN_FROM_EXTERNAL_FEE_EXEMPT: 26,
} as const;
export type CpiType = typeof CpiTypes[keyof typeof CpiTypes];

export const CPI_ENTRIES = [
  { id: 1, label: "PERENA_MINT", programId: PROGRAM_ID, discriminator: [247, 103, 46, 184, 88, 188, 56, 46], category: "Swap", requiredAccounts: [] },
  { id: 22, label: "PERENA_MINT_FEE_EXEMPT", programId: PROGRAM_ID, discriminator: [99, 227, 32, 27, 95, 184, 49, 2], category: "Swap", requiredAccounts: [] },
  { id: 25, label: "PERENA_BURN_FROM_EXTERNAL", programId: PROGRAM_ID, discriminator: [91, 38, 26, 250, 138, 227, 18, 88], category: "Swap", requiredAccounts: [] },
  { id: 26, label: "PERENA_BURN_FROM_EXTERNAL_FEE_EXEMPT", programId: PROGRAM_ID, discriminator: [8, 18, 138, 251, 162, 172, 171, 185], category: "Swap", requiredAccounts: [] },
] as const;

export const { createCpiData, fromInstruction } = createIntegration(CPI_ENTRIES);
