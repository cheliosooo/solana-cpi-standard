# @solana-cpi-standard/core

CPI argument packing and account-reference construction for Solana Kit instructions. Use `createCpiRefs` for one group or `createMultiCpiRefs` for several groups sharing an account pool. The result matches the Rust core's Borsh layout.

`CpiArgsBuilder` and `serializeArgs` distinguish omitted arguments (host-provided), empty arguments, and client-provided bytes. All one-byte fields and the argument skip sentinel are range-checked.

Signer flags are stripped from the output account pool. The host instruction must declare required transaction signatures and select authorized CPI signers on chain. Integrations provide IDs and adapters through separate packages.
