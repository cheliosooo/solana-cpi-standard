use anchor_lang::prelude::*;
use solana_cpi_standard_core::{
    args::CpiArgsEntry, invoke::PdaSigner, CpiDispatcher, CpiRefsView, ExpectedAccount,
    InstructionRefs, U64AmountArgs,
};
use solana_cpi_standard_registry::CPI_REGISTRY;

/// Test caller expectations are explicit instruction arguments, independent of
/// the CPI's account mapping. The payer authorizes only its own sandbox PDA.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExpectedCpiAccount {
    pub cpi_index: u8,
    pub role: String,
    pub address: Pubkey,
}

pub const PDA_SEED: &[u8] = b"cpi-sandbox";

#[derive(Accounts)]
pub struct ExecuteCpis<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This stateless signer is bound to the authenticated payer by seeds.
    /// SAFETY: Anchor checks the canonical PDA below; the handler uses that bump.
    #[account(seeds = [PDA_SEED, payer.key().as_ref()], bump)]
    pub pda: UncheckedAccount<'info>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, ExecuteCpis<'info>>,
    refs_data: Vec<u8>,
    amount: Option<u64>,
    expected_accounts: Vec<ExpectedCpiAccount>,
) -> Result<()> {
    let refs = <InstructionRefs as borsh::BorshDeserialize>::try_from_slice(&refs_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    refs.cpi
        .validate(&CPI_REGISTRY, ctx.remaining_accounts.len())?;
    // Reject malformed tracked indices even though this generic sandbox does
    // not use tracked accounts itself.
    for index in 0..refs.tracked.len() {
        refs.get_tracked_account(index, ctx.remaining_accounts)?;
    }
    if amount.is_none() {
        let mut reader = refs.cpi.args_reader();
        for _ in 0..refs.cpi.num_cpis() {
            if reader.next()? == CpiArgsEntry::Skip {
                return Err(ProgramError::InvalidArgument.into());
            }
        }
    }
    // The payer is the authorization boundary: one caller cannot sign for
    // another caller's sandbox PDA. This sandbox holds no shared protocol state.
    let pda_signer = PdaSigner {
        pubkey: ctx.accounts.pda.key(),
        seeds: vec![
            PDA_SEED.to_vec(),
            ctx.accounts.payer.key().to_bytes().to_vec(),
            vec![ctx.bumps.pda],
        ],
    };
    let mut by_slot: Vec<Vec<ExpectedAccount>> = vec![Vec::new(); refs.cpi.num_cpis()];
    for expected in expected_accounts {
        let slot = usize::from(expected.cpi_index);
        let id = *refs
            .cpi
            .types
            .get(slot)
            .ok_or(ProgramError::InvalidArgument)?;
        let entry = CPI_REGISTRY.get(id).ok_or(ProgramError::InvalidArgument)?;
        let role = entry
            .required_accounts
            .iter()
            .find(|binding| binding.role.0 == expected.role)
            .ok_or(ProgramError::InvalidArgument)?
            .role;
        by_slot[slot].push((role, expected.address));
    }
    let mut dispatcher = CpiDispatcher::new(
        &CPI_REGISTRY,
        ctx.accounts.payer.key,
        &refs.cpi,
        ctx.remaining_accounts,
    )
    .pda_signer(&pda_signer);
    for (slot, accounts) in by_slot.iter().enumerate() {
        if !accounts.is_empty() {
            dispatcher = dispatcher.expected_accounts_for_slot(slot as u8, accounts);
        }
    }
    match amount {
        Some(amount) => dispatcher.invoke_amount_cpi::<U64AmountArgs>(amount)?,
        None => {
            dispatcher.invoke()?;
        }
    }
    Ok(())
}
