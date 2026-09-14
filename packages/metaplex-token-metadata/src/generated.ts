// Generated from the Rust CPI registries. Run pnpm codegen; do not edit.
import { address } from "@solana/kit";
import { createIntegration } from "@solana-cpi-standard/core";

export const PROGRAM_ID = address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const CpiTypes = {
  MPL_UPDATE_METADATA: 20,
  MPL_CREATE_METADATA: 21,
} as const;
export type CpiType = typeof CpiTypes[keyof typeof CpiTypes];

export const CPI_ENTRIES = [
  { id: 20, label: "MPL_UPDATE_METADATA", programId: PROGRAM_ID, discriminator: null, category: "UpdateMintMetadata", requiredAccounts: [] },
  { id: 21, label: "MPL_CREATE_METADATA", programId: PROGRAM_ID, discriminator: null, category: "UpdateMintMetadata", requiredAccounts: [] },
] as const;

export const { createCpiData, fromInstruction } = createIntegration(CPI_ENTRIES);
