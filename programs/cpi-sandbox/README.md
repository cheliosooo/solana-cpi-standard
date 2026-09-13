# CPI sandbox

An Anchor program for local integration testing of CPI Standard packages. It adapts the generic `test_cpi` instruction from `tokenized-positions`, using a caller-specific PDA and the extracted registry.

`execute_cpis(refs_data: Vec<u8>, amount: Option<u64>)` decodes a Borsh `InstructionRefs` and dispatches its CPIs. Pass encoded references as a **Buffer** to Anchor's TypeScript client. The account list is `payer` (signer), `pda`, then the packed remaining-account pool. The signer PDA uses `[b"cpi-sandbox", payer.pubkey]` and Anchor's canonical bump.

- `amount = None`: every slot must contain client-provided arguments, including explicit empty arguments when needed.
- `amount = Some(value)`: exactly one slot must be marked `Skip`; it receives a single little-endian u64. This can represent an amount or another u64 instruction argument, such as a farm reward index.

The sandbox validates the complete reference structure, tracked indices, registered CPI IDs, and caller/PDA relationship. The core dispatcher checks each target program and invokes with the authenticated payer and PDA. It has no persisted plan accounts or protocol state.

Build with `pnpm build:sandbox` from the repository root. This produces `target/deploy/cpi_sandbox.so`, `target/idl/cpi_sandbox.json`, and `target/types/cpi_sandbox.ts`. IDLs are generated, never edited by hand. Run `pnpm test:integrations` to deploy and test locally; see the root README for suite selection and RPC settings.

See [AUDIT.md](AUDIT.md) for the instruction's security audit scope and results.
