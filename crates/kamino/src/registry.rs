//! Authoritative Rust CPI registry. Run pnpm codegen after editing entries.
use solana_cpi_standard_core::{
    AccountBinding, CpiCategory, CpiEntry, DESTINATION_TOKEN_ACCOUNT, SOURCE_TOKEN_ACCOUNT,
    USER_ACCOUNT,
};
use solana_pubkey::{pubkey, Pubkey};

pub const KAMINO_LENDING_PROGRAM_ID: Pubkey =
    pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
pub const KAMINO_FARMS_PROGRAM_ID: Pubkey = pubkey!("FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr");

pub struct CpiType;
impl CpiType {
    pub const K_INIT_USER_METADATA: u8 = 8;
    pub const K_INIT_OBLIGATION: u8 = 9;
    pub const K_INIT_USER_FARM: u8 = 10;
    pub const K_REFRESH_RESERVE: u8 = 11;
    pub const K_REFRESH_OBLIGATION: u8 = 12;
    pub const K_REFRESH_USER_FARM: u8 = 13;
    pub const K_HARVEST_REWARD: u8 = 14;
    pub const K_REQUEST_ELEVATION_GROUP: u8 = 15;
    pub const K_DEPOSIT: u8 = 16;
    pub const K_WITHDRAW: u8 = 17;
    pub const K_BORROW: u8 = 18;
    pub const K_REPAY: u8 = 19;
}

// Static storage avoids promoted-const entry pointer issues on SBF.
pub static CPI_ENTRIES: &[CpiEntry] = &[
    CpiEntry {
        id: CpiType::K_INIT_USER_METADATA,
        label: "K_INIT_USER_METADATA",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "init_user_metadata",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_INIT_OBLIGATION,
        label: "K_INIT_OBLIGATION",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "init_obligation",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_INIT_USER_FARM,
        label: "K_INIT_USER_FARM",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "init_obligation_farms_for_reserve",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_REFRESH_RESERVE,
        label: "K_REFRESH_RESERVE",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "refresh_reserve",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_REFRESH_OBLIGATION,
        label: "K_REFRESH_OBLIGATION",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "refresh_obligation",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_REFRESH_USER_FARM,
        label: "K_REFRESH_USER_FARM",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "refresh_obligation_farms_for_reserve",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_HARVEST_REWARD,
        label: "K_HARVEST_REWARD",
        program_id: KAMINO_FARMS_PROGRAM_ID,
        instruction_name: "harvest_reward",
        category: Some(CpiCategory::ClaimIncentives),
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_REQUEST_ELEVATION_GROUP,
        label: "K_REQUEST_ELEVATION_GROUP",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "request_elevation_group",
        category: None,
        required_accounts: &[],
    },
    CpiEntry {
        id: CpiType::K_DEPOSIT,
        label: "K_DEPOSIT",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "deposit_reserve_liquidity_and_obligation_collateral_v2",
        category: Some(CpiCategory::Deposit),
        required_accounts: &[
            AccountBinding {
                role: USER_ACCOUNT,
                index: 1,
            },
            AccountBinding {
                role: SOURCE_TOKEN_ACCOUNT,
                index: 9,
            },
        ],
    },
    CpiEntry {
        id: CpiType::K_WITHDRAW,
        label: "K_WITHDRAW",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "withdraw_obligation_collateral_and_redeem_reserve_collateral_v2",
        category: Some(CpiCategory::Withdraw),
        required_accounts: &[
            AccountBinding {
                role: USER_ACCOUNT,
                index: 1,
            },
            AccountBinding {
                role: DESTINATION_TOKEN_ACCOUNT,
                index: 9,
            },
        ],
    },
    CpiEntry {
        id: CpiType::K_BORROW,
        label: "K_BORROW",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "borrow_obligation_liquidity_v2",
        category: Some(CpiCategory::Borrow),
        required_accounts: &[
            AccountBinding {
                role: USER_ACCOUNT,
                index: 1,
            },
            AccountBinding {
                role: DESTINATION_TOKEN_ACCOUNT,
                index: 8,
            },
        ],
    },
    CpiEntry {
        id: CpiType::K_REPAY,
        label: "K_REPAY",
        program_id: KAMINO_LENDING_PROGRAM_ID,
        instruction_name: "repay_obligation_liquidity_v2",
        category: Some(CpiCategory::Repay),
        required_accounts: &[
            AccountBinding {
                role: USER_ACCOUNT,
                index: 1,
            },
            AccountBinding {
                role: SOURCE_TOKEN_ACCOUNT,
                index: 6,
            },
        ],
    },
];

#[cfg(test)]
solana_cpi_standard_core::export_cpi_registry! {
    "kamino-lending" => KAMINO_LENDING_PROGRAM_ID,
    "kamino-farms" => KAMINO_FARMS_PROGRAM_ID,
}
