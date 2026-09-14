//! Authoritative Rust CPI registry. Run pnpm codegen after editing entries.
use solana_cpi_standard_core::{CpiCategory, CpiEntry};
use solana_pubkey::{pubkey, Pubkey};

pub const PROGRAM_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

pub struct CpiType;
impl CpiType {
    pub const MPL_UPDATE_METADATA: u8 = 20;
    pub const MPL_CREATE_METADATA: u8 = 21;
}

// Static storage avoids promoted-const entry pointer issues on SBF.
pub static CPI_ENTRIES: &[CpiEntry] = &[
    CpiEntry {
        id: CpiType::MPL_UPDATE_METADATA,
        label: "MPL_UPDATE_METADATA",
        program_id: PROGRAM_ID,
        instruction_name: "",
        category: Some(CpiCategory::UpdateMintMetadata),
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::MPL_CREATE_METADATA,
        label: "MPL_CREATE_METADATA",
        program_id: PROGRAM_ID,
        instruction_name: "",
        category: Some(CpiCategory::UpdateMintMetadata),
        required_accounts: &[],
    },
];

#[cfg(test)]
solana_cpi_standard_core::export_cpi_registry! {
    "metaplex-token-metadata" => PROGRAM_ID,
}
