# Fixtures

- `legacyRegistry.json`: immutable allocation and instruction-identity baseline copied from `tokenized-positions` commit `a2b1bb85b6cc698ae5a9404079fbc7306ad0be55`. Extend when publishing newly allocated IDs; do not rewrite old allocations to make a compatibility failure pass.
- `instructionRefs.bin`: original Borsh layout for two CPI slots. Indices `[0,1,2,3,2,1]`, lengths `[3,3]`, types `[0,16]`, packed args `[2,0,170,187,255,255]`, tracked `[1]`. Every vector is prefixed by its u32 LE length. Both Rust and TypeScript tests compare against these exact bytes.

- `keypairs/sandbox-local.json`: public local sandbox fixture copied from `tokenized-positions/tests/fixtures/keypairs/test_sandbox-keypair.json`, address `4dcuyHs4K97LckqNVQEazKAwygJtAATLiuNWFsvFh11m`. Used by the local Anchor configuration. Never use it for real funds or production authority.

The runtime suites use ephemeral payers and fork real mainnet program accounts through Surfpool. Token fixtures patch only locally created token-account balances. The farms fixture initializes a local farm, mints rewards into its vault, and seeds matching accrued rewards in its local user/farm state before calling the real harvest instruction. No credentials or live-account snapshots are checked in.
