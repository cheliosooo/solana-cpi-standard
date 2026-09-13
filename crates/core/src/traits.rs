//! CPI argument traits.

use borsh::{BorshDeserialize, BorshSerialize};

/// Trait for lending-platform CPI args that can be constructed from a single
/// amount (e.g., liquidity or collateral base units).
///
/// Implementations serialize to the borsh layout expected by the target
/// program. [`CpiDispatcher::invoke_amount_cpi`](super::refs::CpiDispatcher::invoke_amount_cpi)
/// calls `A::new(amount)`, serializes, and invokes the CPI for any slot whose
/// args were marked `Skip` (0xFFFF) by the TypeScript builder.
pub trait AmountArgs: BorshSerialize {
    fn new(amount: u64) -> Self;
}

/// Generic single-`u64` args payload, suitable for any lending-platform
/// instruction whose inline arguments are just an amount after the
/// discriminator (e.g. Kamino's `deposit_reserve_liquidity_and_obligation_collateral_v2`,
/// `withdraw_obligation_collateral_and_redeem_reserve_collateral_v2`,
/// `borrow_obligation_liquidity_v2`, `repay_obligation_liquidity_v2`).
///
/// Borsh-serializes to the same 8 LE bytes regardless of the consuming
/// program's field name.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct U64AmountArgs {
    pub amount: u64,
}

impl AmountArgs for U64AmountArgs {
    fn new(amount: u64) -> Self {
        Self { amount }
    }
}
