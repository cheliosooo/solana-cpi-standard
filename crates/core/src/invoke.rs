//! Core CPI invoke helpers and PDA signer configuration.
//!
//! This module provides the low-level building blocks for executing CPIs:
//! - `PdaSigner`: Configuration for PDA signing
//! - `build_account_meta`: Build a single AccountMeta
//! - `build_account_metas`: Build AccountMetas from a slice
//! - `execute_cpi`: Execute the actual CPI

use solana_account_info::AccountInfo;
use solana_cpi::{invoke, invoke_signed};
use solana_instruction::{AccountMeta, Instruction};
use solana_program_error::{ProgramError, ProgramResult};
use solana_pubkey::Pubkey;

/// PDA signer configuration for CPI calls.
///
/// When invoking a CPI where a PDA needs to "sign", provide this struct
/// to specify which account is the PDA and what seeds to use for `invoke_signed`.
///
/// # How PDA Signing Works
///
/// PDAs cannot sign the outer transaction (they have no private key). Instead:
/// 1. The PDA account is passed with `is_signer: false` in the outer transaction
/// 2. When building the CPI instruction, we set `is_signer: true` for that account
/// 3. `invoke_signed` is called with the seeds, and the Solana runtime verifies
///    the seeds derive to the PDA, then authorizes the "signature"
///
/// # Example
///
/// ```ignore
/// use solana_cpi_standard_core::invoke::PdaSigner;
///
/// let pda_signer = PdaSigner {
///     pubkey: *ctx.accounts.my_pda.key,
///     seeds: vec![b"my_pda".to_vec(), user.key.to_bytes().to_vec(), vec![bump]],
/// };
/// ```
pub struct PdaSigner {
    /// The public key of the PDA that will sign.
    pub pubkey: Pubkey,

    /// The seeds used to derive this PDA.
    pub seeds: Vec<Vec<u8>>,
}

/// Build an `AccountMeta` from an `AccountInfo`, with optional PDA signer override.
///
/// If `pda_signer` matches the account's key, `is_signer` is set to true.
/// The explicit outer signer is also marked as a signer. Other outer signatures
/// are not forwarded; the Solana runtime validates actual signer privileges.
#[inline]
pub fn build_account_meta(
    signer: &Pubkey,
    acc: &AccountInfo,
    pda_signer: Option<&Pubkey>,
) -> AccountMeta {
    let is_signer = acc.key == signer || pda_signer == Some(acc.key);

    if acc.is_writable {
        AccountMeta::new(*acc.key, is_signer)
    } else {
        AccountMeta::new_readonly(*acc.key, is_signer)
    }
}

/// Build a list of `AccountMeta` from a slice of `AccountInfo`.
pub fn build_account_metas(
    signer: &Pubkey,
    accounts: &[AccountInfo],
    pda_signer: Option<&Pubkey>,
) -> Vec<AccountMeta> {
    accounts
        .iter()
        .map(|acc| build_account_meta(signer, acc, pda_signer))
        .collect()
}

/// Build account metas into a reusable buffer.
pub fn build_account_metas_into(
    signer: &Pubkey,
    accounts: &[AccountInfo],
    pda_signer: Option<&Pubkey>,
    out: &mut Vec<AccountMeta>,
) {
    out.clear();
    out.reserve(accounts.len());
    out.extend(
        accounts
            .iter()
            .map(|acc| build_account_meta(signer, acc, pda_signer)),
    );
}

/// Execute a CPI with the given instruction and accounts.
///
/// This is the core invoke logic shared across all CPI methods.
///
/// `account_infos` must already include the target program AccountInfo at
/// index 0 followed by the instruction's accounts in `account_metas` order.
/// The slice is forwarded to `invoke` / `invoke_signed` as-is — no temporary
/// `Vec` is allocated, which matters because Solana's bump allocator never
/// frees and these helpers run several times per multi-CPI handler.
///
/// # Arguments
/// * `program_id` - The target program ID
/// * `account_metas` - AccountMetas for the instruction
/// * `account_infos` - Program + CPI account infos (program at index 0)
/// * `data` - Instruction data
/// * `pda_signer` - Optional PDA signer (for invoke_signed)
pub fn execute_cpi<'info>(
    program_id: Pubkey,
    account_metas: Vec<AccountMeta>,
    account_infos: &[AccountInfo<'info>],
    data: Vec<u8>,
    pda_signer: Option<&PdaSigner>,
) -> ProgramResult {
    let ix = Instruction {
        program_id,
        accounts: account_metas,
        data,
    };

    match pda_signer {
        Some(signer) => {
            let seed_refs: Vec<&[u8]> = signer.seeds.iter().map(|s| s.as_slice()).collect();
            invoke_signed(&ix, account_infos, &[seed_refs.as_slice()])
        }
        None => invoke(&ix, account_infos),
    }
}

/// Execute a CPI while preserving the backing allocations for repeated calls.
///
/// Solana's BPF allocator does not make dropped `Vec` allocations useful again
/// within the same instruction. Long CPI chains should reuse buffers so each
/// invocation does not leak another account-meta/data allocation.
pub fn execute_cpi_with_reusable_buffers<'info>(
    program_id: Pubkey,
    account_metas: &mut Vec<AccountMeta>,
    account_infos: &[AccountInfo<'info>],
    data: &mut Vec<u8>,
    pda_signer: Option<&PdaSigner>,
) -> ProgramResult {
    let ix = Instruction {
        program_id,
        accounts: std::mem::take(account_metas),
        data: std::mem::take(data),
    };

    let result = match pda_signer {
        Some(signer) => {
            if signer.seeds.len() > 8 {
                Err(ProgramError::InvalidSeeds)
            } else {
                let mut seed_refs: [&[u8]; 8] = [&[]; 8];
                for (i, seed) in signer.seeds.iter().enumerate() {
                    seed_refs[i] = seed.as_slice();
                }
                invoke_signed(&ix, account_infos, &[&seed_refs[..signer.seeds.len()]])
            }
        }
        None => invoke(&ix, account_infos),
    };

    let Instruction {
        accounts,
        data: ix_data,
        ..
    } = ix;
    *account_metas = accounts;
    *data = ix_data;

    result
}
