# @solana-cpi-standard/metaplex-token-metadata

Program-specific IDs and CPI adapters. Use `createCpiData` with instruction accounts and raw arguments (omit data for a program-supplied slot), or `fromInstruction` to adapt a Solana Kit instruction. The latter validates the program and Anchor discriminator before removing the discriminator. Raw-data entries retain the complete instruction data.

Use `createCpiRefs` from `@solana-cpi-standard/core` to pack the result. Account discovery and RPC calls remain with your protocol SDK.
