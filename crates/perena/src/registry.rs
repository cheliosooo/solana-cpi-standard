//! Authoritative Rust CPI registry. Run pnpm codegen after editing entries.
use solana_cpi_standard_core::{CpiCategory, CpiEntry};
use solana_pubkey::{pubkey, Pubkey};

pub const PROGRAM_ID: Pubkey = pubkey!("save8RQVPMWNTzU18t3GBvBkN9hT7jsGjiCQ28FpD9H");

pub struct CpiType;
impl CpiType {
    pub const PERENA_MINT: u8 = 1;
    pub const PERENA_MINT_FEE_EXEMPT: u8 = 22;
    pub const PERENA_BURN_FROM_EXTERNAL: u8 = 25;
    pub const PERENA_BURN_FROM_EXTERNAL_FEE_EXEMPT: u8 = 26;
}

// Static storage avoids promoted-const entry pointer issues on SBF.
pub static CPI_ENTRIES: &[CpiEntry] = &[
    CpiEntry {
        id: CpiType::PERENA_MINT,
        label: "PERENA_MINT",
        program_id: PROGRAM_ID,
        instruction_name: "execute_deposit",
        category: Some(CpiCategory::Swap),
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::PERENA_MINT_FEE_EXEMPT,
        label: "PERENA_MINT_FEE_EXEMPT",
        program_id: PROGRAM_ID,
        instruction_name: "execute_deposit_fee_exempt",
        category: Some(CpiCategory::Swap),
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::PERENA_BURN_FROM_EXTERNAL,
        label: "PERENA_BURN_FROM_EXTERNAL",
        program_id: PROGRAM_ID,
        instruction_name: "execute_withdraw_from_external",
        category: Some(CpiCategory::Swap),
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::PERENA_BURN_FROM_EXTERNAL_FEE_EXEMPT,
        label: "PERENA_BURN_FROM_EXTERNAL_FEE_EXEMPT",
        program_id: PROGRAM_ID,
        instruction_name: "execute_withdraw_from_external_fee_exempt",
        category: Some(CpiCategory::Swap),
        required_accounts: &[],
    },
];

#[cfg(test)]
solana_cpi_standard_core::export_cpi_registry! {
    "perena" => PROGRAM_ID,
}
