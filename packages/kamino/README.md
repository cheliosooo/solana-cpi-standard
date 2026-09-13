# @solana-cpi-standard/kamino

One package for Kamino lending and farms. `CpiTypes` and `CPI_ENTRIES` include all Kamino IDs (8–19), preserving their existing meanings. `KAMINO_LENDING_PROGRAM_ID` and `KAMINO_FARMS_PROGRAM_ID` identify the two on-chain programs.

Use `createCpiData` with instruction accounts and raw arguments (omit data for a program-supplied slot), or `fromInstruction` to adapt a Solana Kit instruction. Both select the correct target program from the CPI ID. `fromInstruction` checks the program and Anchor discriminator before removing the discriminator.

```typescript
import { CpiTypes, fromInstruction } from "@solana-cpi-standard/kamino";

const deposit = fromInstruction(CpiTypes.K_DEPOSIT, depositInstruction);
const harvest = fromInstruction(CpiTypes.K_HARVEST_REWARD, harvestInstruction);
```

Use `createCpiRefs` from `@solana-cpi-standard/core` to pack the result. Account discovery and RPC calls remain with your protocol SDK.

The matching Rust crate is `solana-cpi-standard-kamino`. Its `CpiType`, `CPI_ENTRIES`, and program constants cover both programs. Enable `kamino` on the optional aggregate registry to include all Kamino entries.

Run `pnpm test:integrations kamino` from the repository root for both real-program sandbox suites. Select `kamino-lending` or `kamino-farms` to run either individually; see the root README for prerequisites and coverage.
