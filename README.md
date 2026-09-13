# Solana CPI Standard

Reusable CPI argument packing, account references, registry definitions, and Rust dispatch, extracted from `tokenized-positions` at commit `a2b1bb85b6cc698ae5a9404079fbc7306ad0be55`.

The existing Borsh wire format and all 19 active CPI IDs are preserved. Each integration has an independent TypeScript package and Rust crate. The Rust core has no Anchor or protocol SDK dependency; it uses Borsh 0.10, compatible with the original Anchor serialization.

## Packages

| Integration              | TypeScript                                     | Rust                                          |
| ------------------------ | ---------------------------------------------- | --------------------------------------------- |
| Core                     | `@solana-cpi-standard/core`                    | `solana-cpi-standard-core`                    |
| Jupiter                  | `@solana-cpi-standard/jupiter`                 | `solana-cpi-standard-jupiter`                 |
| Perena                   | `@solana-cpi-standard/perena`                  | `solana-cpi-standard-perena`                  |
| Kamino (lending + farms) | `@solana-cpi-standard/kamino`                  | `solana-cpi-standard-kamino`                  |
| Metaplex token metadata  | `@solana-cpi-standard/metaplex-token-metadata` | `solana-cpi-standard-metaplex-token-metadata` |

`solana-cpi-standard-registry` is an optional Rust convenience crate with one feature per integration and **no default integrations**. Consumers can also compose integration crates directly.

These are local workspace packages; this extraction does not publish packages or migrate the original monorepo.

## TypeScript

Protocol SDKs remain responsible for discovering accounts and building instructions. Each integration exports `CpiTypes`, `CPI_ENTRIES`, `createCpiData`, and `fromInstruction`. Single-program integrations export `PROGRAM_ID`. Kamino includes both lending and farms, with `KAMINO_LENDING_PROGRAM_ID` and `KAMINO_FARMS_PROGRAM_ID`; its adapters select the target program from the CPI ID.

```typescript
import { createCpiRefs } from "@solana-cpi-standard/core";
import { CpiTypes, fromInstruction } from "@solana-cpi-standard/kamino";

// depositInstruction is a Solana Kit instruction from your existing SDK.
const deposit = fromInstruction(CpiTypes.K_DEPOSIT, depositInstruction, {
  programProvidedArgs: true,
});
const { accounts, refs, lookupTables } = createCpiRefs([deposit]);
// Pass accounts as remainingAccounts and refs as the host instruction argument.
```

`fromInstruction` validates the program and, for Anchor entries, the discriminator before stripping it. Raw entries retain the whole data payload. `createCpiData(id, accounts, data?, lookupTables?)` accepts accounts **without** the program account and arguments **without** the Anchor discriminator. Omitted data means the host supplies the arguments; empty data means a no-argument instruction.

`createMultiCpiRefs` packs several groups against one shared account pool. Initial account positions, including duplicates, are preserved; other accounts are deduplicated with writable privileges merged. Tracked addresses resolve against the complete shared pool. Lookup tables are deduplicated.

## Rust

```rust
use solana_cpi_standard_core::{CpiRegistry, CpiDispatcher, CpiCategory, U64AmountArgs};
use solana_cpi_standard_kamino::CPI_ENTRIES;

static REGISTRY: CpiRegistry = CpiRegistry::new(&[CPI_ENTRIES]);

// Inside the host instruction, after validating authority and account ownership:
CpiDispatcher::new(&REGISTRY, signer, &refs.cpi, remaining_accounts)
    .pda_signer(&pda_signer)
    .required_order(&[CpiCategory::Deposit])
    .expected_count(1)
    .expected_target_account(obligation)
    .invoke_amount_cpi::<U64AmountArgs>(amount)?;
```

Registry composition rejects duplicate and retired IDs. A `static` initializer makes collisions a compile error. Enable the matching features on `solana-cpi-standard-registry` if you prefer its `CPI_REGISTRY` to direct composition.

The dispatcher preserves reusable invocation buffers, category order/count validation, explicit outer/PDA signer selection, and optional target-account checks. `invoke()` returns the first skip slot or the number of completed slots. `invoke_amount_cpi` requires exactly one skip. `invoke_amount_cpi_with::<Args, _, Error>(provider)` computes the amount after prerequisite CPIs and propagates application errors.

Applications may implement `CpiRefsView` for their own persisted plan accounts. This keeps storage capacity, ownership, rent, and account lifecycle decisions with the host program.

## Rust registry validation and TypeScript codegen

The Rust registries in `crates/<integration>/src/registry.rs` are the source of truth for CPI IDs, program addresses, instruction names, categories, and target-account indices. Retired IDs are maintained in `crates/core/src/retired.rs`. `registry/catalog.json` and `packages/*/src/generated.ts` are generated outputs; do not edit them manually.

```sh
# Compile and inspect every Rust integration crate, checking IDs globally.
pnpm check:registry

# Generate the JSON catalog and every TypeScript registry from Rust.
pnpm codegen
# Existing alias:
pnpm generate

# Validate every Rust registry and fail if generated files are missing or stale.
pnpm check:generated

# Includes registry/codegen validation, unit tests, type checks, and Rust checks.
pnpm check
```

The workflow follows `tokenized-positions`' ignored `export_cpi_registry` Rust test. Each integration declares its programs with `export_cpi_registry!`; the shared export helper reads the compiled `CPI_ENTRIES` and calls Rust's `discriminator()` method. The scripts discover all integration crates under `crates/` through Cargo workspace metadata, excluding only `core` and the aggregate `registry`. They build each integration's export test with all features, independently of the aggregate registry's selected features. A new crate without an exporter fails validation rather than being skipped.

`check:registry` rejects overlapping IDs within or across crates, reuse of retired IDs, duplicate labels/programs, undeclared program targets, and incompatible changes to released entries. Errors identify the ID and conflicting integration/program labels. Neither check command rewrites tracked files; temporary export files and Cargo build artifacts are the only outputs. `codegen` validates everything before writing generated files and can regenerate them even when the JSON catalog and TypeScript outputs are missing. `pnpm check` runs this validation in CI through `check:generated`.

The JSON export records each on-chain program separately, with an `integration` field when related programs share a crate/package. Kamino lending and farms share `kamino`; enabling that feature in the aggregate registry includes both programs. The TypeScript constants, program addresses, discriminators, categories, and target indices all come from the Rust export.

### Adding or changing CPI registrations

1. Add a named ID constant and `CpiEntry` to the relevant Rust registry. Use an unused `u8` ID across all crates; never renumber existing entries or recycle retired IDs. IDs 2–7, 23, and 24 remain retired.
2. If adding a program to a crate, declare its Rust program constant and include it in that crate's `#[cfg(test)] export_cpi_registry!` invocation.
3. Run `pnpm check:registry`, then `pnpm codegen` and `pnpm check`. Commit the Rust changes and regenerated JSON/TypeScript together.

For a new integration, create its crate under `crates/` and TypeScript package under `packages/`, and add a dev-dependency on `solana-cpi-standard-core` with `features = ["registry-export"]`. Declare its export test as in `crates/jupiter/src/registry.rs`. Add its optional aggregate-registry dependency/feature and sandbox coverage. After changing Cargo dependencies, update `Cargo.lock` with `cargo check --workspace` before running the locked registry commands. The checker discovers new crates automatically, including ones not yet added to the aggregate registry.

Removing an entry requires adding its ID to Rust's `RETIRED_IDS`. Changing a program, instruction, category, or target-account meaning requires a new ID. Preserve `tests/fixtures/legacyRegistry.json` as the compatibility baseline. When releasing new allocations, extend that baseline with the newly released entries so later releases protect them too.

IDs remain globally allocated even when consumers enable only a subset of integrations. The existing wire format has 256 IDs; widening it would require a versioned wire-format change.

## Wire format and validation

`InstructionRefs` Borsh-serializes five vectors in order: flattened account indices, per-CPI account lengths, CPI types, packed arguments, and tracked indices. Each vector has a `u32` little-endian length. Each CPI's first account index points to its program.

Arguments use a `u16` little-endian prefix per slot: `0xffff` = host-supplied arguments, `0` = no arguments, otherwise the number of following bytes. Limits are 256 pool positions, 256 CPI slots per group, 255 accounts per CPI including the program, and 65,534 argument bytes per slot. These are encoding limits; transaction and runtime limits may be lower.

Compared with the source implementation, this extraction rejects oversized byte fields, unknown IDs, mismatched vector lengths, missing/trailing arguments, and zero/multiple skips in amount dispatch. Tracked-account access returns an error for invalid indices. Valid plans retain the original wire layout.

## Host responsibilities

Registry membership identifies a program and instruction format; it does not authorize arbitrary user-supplied plans. The host must validate its signer/PDA, account ownership, token/ATA relationships, allowed operations, and business invariants. Category validation ignores only **registered** uncategorized operations. Target checks apply only to entries with a configured target index.

Jupiter and Metaplex retain their original raw-data registrations. Their category labels do not validate the opcode inside the raw bytes. Hosts accepting untrusted raw payloads must validate their instruction semantics separately.

The TypeScript account pool strips signer flags, matching the original PDA-oriented convention. Declare necessary transaction signatures on the host instruction; Rust forwards only the explicitly selected signer and optional PDA. The current reusable invocation path supports up to eight PDA seeds, matching the source implementation.

The source's deployment-tier restriction on non-exempt Perena withdrawal (ID 25) is application policy and is omitted here. Hosts that require fee-exempt withdrawals must explicitly allow ID 26 and reject ID 25.

## Included and omitted

Included: the wire types, argument reader/builder, account pooling, generic dispatch and category validation, per-program registries and instruction adapters, Perena argument serialization, code generation, fixtures, and tests.

Omitted: the application-specific `cpi_actions_registry` wrapper, `LendingPlatform`, fixed-capacity `CpiPlan` accounts and their create/close instructions, protocol RPC/quote clients, wallet/keypair services, transaction submission, caches, backend/frontend code, deployment settings, and application Anchor IDLs. The standalone test sandbox described below generates its own IDL.

## Development

Requires Node.js 22+, pnpm 10.24.0, and Rust with rustfmt/clippy. Codegen compiles the Rust export tests, so it requires Cargo; no validator or protocol RPC is needed. Export serialization is enabled only through the integration crates’ dev-dependencies and is absent from normal on-chain builds.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` builds all TypeScript packages, runs Node and Rust tests, checks generated files and formatting, and runs Clippy. Rust tests exercise host-side dispatch validation and exact instruction construction. `pnpm check` also type-checks the integration suites, but does not start a validator; run the commands below for real program execution.

## Sandbox integration tests

`pnpm test:integrations` builds the packages and sandbox, starts Surfpool, deploys the sandbox, runs the selected suites, and stops the validator it started. A separate validator startup is only needed when passing `--use-existing`.

The [sandbox program](programs/cpi-sandbox/README.md) accepts arbitrary registered CPI bundles and signs with a PDA scoped to the test payer. The suites follow the Surfpool approach from `tokenized-positions` and run the **real forked program bytecode**, not mock integration programs.

Prerequisites: Node.js 22+, pnpm 10.24.0, Anchor 0.31.1, Solana/Agave CLI, and Surfpool. Validated with Solana CLI 2.3.8, SBF platform-tools v1.52, and Surfpool 1.1.2. `build:sandbox` selects platform-tools v1.52; the first build may download them. The runtime dependency lock includes a CommonJS-compatible UUID override for Solana web3.js on earlier Node 22 releases.

```sh
pnpm install --frozen-lockfile

# Build packages and sandbox, generate the IDL, start Surfpool, run all suites,
# then stop the Surfpool process started by this command.
pnpm test:integrations

# Run one integration, or several named integrations.
pnpm test:integrations perena
pnpm test:integrations kamino
# Or select either Kamino program suite.
pnpm test:integrations kamino-lending
pnpm test:integrations kamino-farms
pnpm test:integrations jupiter
pnpm test:integrations metaplex-token-metadata

# Run the sandbox's authority and malformed-input checks.
pnpm test:integrations sandbox

# After building once, reuse the compiled packages, SBF binary, and IDL.
pnpm test:integrations perena --skip-build

# Reuse an already-running local Surfpool. The sandbox is redeployed, and the
# runner leaves this existing validator and its state running afterward.
pnpm test:integrations perena --use-existing --skip-build

pnpm test:integrations --help
```

`RPC_URL` selects the local test validator (default `http://127.0.0.1:8899`; the runner uses the next port for websocket RPC). An occupied port causes an error rather than terminating an existing validator. `SURFPOOL_DATASOURCE_RPC_URL` selects the upstream mainnet RPC used by Surfpool; a reliable provider avoids public-RPC throttling:

```sh
export SURFPOOL_DATASOURCE_RPC_URL="https://your-mainnet-rpc-endpoint"
RPC_URL=http://127.0.0.1:18999 pnpm test:integrations
```

Jupiter also uses its swap API. `JUPITER_API_URL` defaults to `https://lite-api.jup.ag/swap/v1`, matching the reference, and `JUPITER_API_KEY` supplies an optional `x-api-key` header. Override them for your Jupiter API endpoint/access. The swap fixture requests direct Raydium routes to avoid venues whose external oracle quotes expire during fork setup. API or upstream RPC failures fail the selected suite explicitly; tests are not silently skipped. Live quotes and program upgrades can affect fork tests. Logs from the managed validator are in `.surfpool/integrations.log`.

### Current suite coverage

| Suite                     | Exercises                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox`                 | Empty plans, payer signatures, payer-scoped PDA constraints, invalid/unknown IDs, wrong programs, missing arguments, malformed Borsh, and tracked-index bounds.                                                               |
| `jupiter`                 | A real USDC → WSOL swap signed by the sandbox PDA, exact input debit, the quote's minimum-output guarantee, and insufficient-balance rejection.                                                                               |
| `perena`                  | USDC deposit, external redemption of the minted shares, exact input/share debits, and the real vault/SDK instruction payloads.                                                                                                |
| `kamino-lending`          | PDA user metadata and obligation initialization, obligation refresh, exact decoded owner/market fields, and rejection of an elevation request without collateral. Deposit/withdraw/borrow/repay coverage is not yet included. |
| `kamino-farms`            | Local farm/reward/user setup using the real farms program, harvesting an explicitly seeded accrued reward, exact user/treasury/vault balances, and the sandbox's program-supplied u64 slot.                                   |
| `metaplex-token-metadata` | Creation and update of real token metadata with PDA mint/update authority, with exact decoded metadata assertions.                                                                                                            |

Fixtures are described in [tests/fixtures/README.md](tests/fixtures/README.md). The tests generate ephemeral payers, fund them through Surfpool, and patch only local token/reward fixture state. They do not read personal wallets or submit transactions to mainnet. Test-state mutation and sandbox deployment require HTTP loopback RPC URLs.

Each program has a `setup.ts` context and an `integration.test.ts` suite under `tests/integration/<program>/`. The `kamino` selection runs both `kamino-lending` and `kamino-farms`, using the same combined package and Rust registry feature. Shared payer/RPC resources, transaction sending, reference serialization, and local token funding live in `tests/utils/`. Add new protocol scenarios there without importing code from `tokenized-positions`.
