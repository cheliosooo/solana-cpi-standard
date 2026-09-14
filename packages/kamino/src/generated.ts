// Generated from the Rust CPI registries. Run pnpm codegen; do not edit.
import { address } from "@solana/kit";
import { createIntegration } from "@solana-cpi-standard/core";

export const KAMINO_LENDING_PROGRAM_ID = address("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
export const KAMINO_FARMS_PROGRAM_ID = address("FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr");
export const CpiTypes = {
  K_INIT_USER_METADATA: 8,
  K_INIT_OBLIGATION: 9,
  K_INIT_USER_FARM: 10,
  K_REFRESH_RESERVE: 11,
  K_REFRESH_OBLIGATION: 12,
  K_REFRESH_USER_FARM: 13,
  K_HARVEST_REWARD: 14,
  K_REQUEST_ELEVATION_GROUP: 15,
  K_DEPOSIT: 16,
  K_WITHDRAW: 17,
  K_BORROW: 18,
  K_REPAY: 19,
} as const;
export type CpiType = typeof CpiTypes[keyof typeof CpiTypes];

export const CPI_ENTRIES = [
  { id: 8, label: "K_INIT_USER_METADATA", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [117, 169, 176, 69, 197, 23, 15, 162], category: null, requiredAccounts: [] },
  { id: 9, label: "K_INIT_OBLIGATION", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [251, 10, 231, 76, 27, 11, 159, 96], category: null, requiredAccounts: [] },
  { id: 10, label: "K_INIT_USER_FARM", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [136, 63, 15, 186, 211, 152, 168, 164], category: null, requiredAccounts: [] },
  { id: 11, label: "K_REFRESH_RESERVE", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [2, 218, 138, 235, 79, 201, 25, 102], category: null, requiredAccounts: [] },
  { id: 12, label: "K_REFRESH_OBLIGATION", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [33, 132, 147, 228, 151, 192, 72, 89], category: null, requiredAccounts: [] },
  { id: 13, label: "K_REFRESH_USER_FARM", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [140, 144, 253, 21, 10, 74, 248, 3], category: null, requiredAccounts: [] },
  { id: 14, label: "K_HARVEST_REWARD", programId: KAMINO_FARMS_PROGRAM_ID, discriminator: [68, 200, 228, 233, 184, 32, 226, 188], category: "ClaimIncentives", requiredAccounts: [] },
  { id: 15, label: "K_REQUEST_ELEVATION_GROUP", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [36, 119, 251, 129, 34, 240, 7, 147], category: null, requiredAccounts: [] },
  { id: 16, label: "K_DEPOSIT", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [216, 224, 191, 27, 204, 151, 102, 175], category: "Deposit", requiredAccounts: [{"index":1,"role":"user_account"},{"index":9,"role":"source_token_account"}] },
  { id: 17, label: "K_WITHDRAW", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [235, 52, 119, 152, 149, 197, 20, 7], category: "Withdraw", requiredAccounts: [{"index":1,"role":"user_account"},{"index":9,"role":"destination_token_account"}] },
  { id: 18, label: "K_BORROW", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [161, 128, 143, 245, 171, 199, 194, 6], category: "Borrow", requiredAccounts: [{"index":1,"role":"user_account"},{"index":8,"role":"destination_token_account"}] },
  { id: 19, label: "K_REPAY", programId: KAMINO_LENDING_PROGRAM_ID, discriminator: [116, 174, 213, 76, 180, 53, 210, 144], category: "Repay", requiredAccounts: [{"index":1,"role":"user_account"},{"index":6,"role":"source_token_account"}] },
] as const;

export const { createCpiData, fromInstruction } = createIntegration(CPI_ENTRIES);
