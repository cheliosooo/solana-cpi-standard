//! Authoritative Rust CPI registry. Run pnpm codegen after editing entries.
use solana_cpi_standard_core::{CpiCategory, CpiEntry};
use solana_pubkey::{pubkey, Pubkey};

pub const PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

pub struct CpiType;
impl CpiType {
    pub const JUPITER_SWAP: u8 = 0;
}

// Static storage avoids promoted-const entry pointer issues on SBF.
pub static CPI_ENTRIES: &[CpiEntry] = &[CpiEntry {
    id: CpiType::JUPITER_SWAP,
    label: "JUPITER_SWAP",
    program_id: PROGRAM_ID,
    instruction_name: "",
    category: Some(CpiCategory::Swap),
    expected_target_account_index: None,
}];

#[cfg(test)]
solana_cpi_standard_core::export_cpi_registry! {
    "jupiter" => PROGRAM_ID,
}
