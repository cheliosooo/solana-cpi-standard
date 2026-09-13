use borsh::{BorshDeserialize, BorshSerialize};

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct PerenaMintArgs {
    pub amount_yielding_deposit: u64,
    pub min_bank_mint_minted: u64,
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct PerenaBurnArgs {
    pub amount_to_burn: u64,
    pub minimum_yielding_withdrawn: u64,
}
