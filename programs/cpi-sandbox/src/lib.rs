// Anchor 0.31 generates the deprecated AccountInfo::realloc call.
#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;
pub mod instructions;
use instructions::*;

declare_id!("4dcuyHs4K97LckqNVQEazKAwygJtAATLiuNWFsvFh11m");

#[program]
pub mod cpi_sandbox {
    use super::*;

    /// Execute a Borsh-encoded core InstructionRefs. Keeping the payload opaque
    /// here prevents Anchor IDL traits from leaking into the portable core crate.
    pub fn execute_cpis<'info>(
        ctx: Context<'_, '_, 'info, 'info, ExecuteCpis<'info>>,
        refs_data: Vec<u8>,
        amount: Option<u64>,
    ) -> Result<()> {
        instructions::execute_cpis::handler(ctx, refs_data, amount)
    }
}
