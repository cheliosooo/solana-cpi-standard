# @solana-cpi-standard/core

CPI argument packing and account-reference construction for Solana Kit instructions. Use `createCpiRefs` for one group or `createMultiCpiRefs` for several groups sharing an account pool. The result matches the Rust core's Borsh layout.

`CpiArgsBuilder` and `serializeArgs` distinguish omitted arguments (host-provided), empty arguments, and client-provided bytes. All one-byte fields and the argument skip sentinel are range-checked.

Signer flags are stripped from the output account pool. The host instruction must declare required transaction signatures and select authorized CPI signers on chain. Integrations provide IDs and adapters through separate packages.

Generated `CpiEntry.requiredAccounts` exposes `{ role, index }` metadata. Indices exclude the program account. Common semantic strings are exported as `USER_ACCOUNT`, `SOURCE_TOKEN_ACCOUNT`, and `DESTINATION_TOKEN_ACCOUNT`; these differ from Solana Kit's numeric signer/writable `AccountRole` flags. `createIntegration` validates role names, uniqueness and index bounds. These client checks do not authorize a plan: the Rust host must supply trusted expected addresses.
