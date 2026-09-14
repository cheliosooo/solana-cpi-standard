//! Named account bindings supplied by registries and authorized by the host.
use crate::CpiEntry;
use solana_account_info::AccountInfo;
use solana_program_error::{ProgramError, ProgramResult};
use solana_pubkey::Pubkey;

/// Static semantic name; integrations may define additional names without changing core.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccountRole(pub &'static str);

impl AccountRole {
    pub const fn is_valid(self) -> bool {
        let bytes = self.0.as_bytes();
        if bytes.is_empty() || bytes[0] < b'a' || bytes[0] > b'z' {
            return false;
        }
        let mut i = 1;
        while i < bytes.len() {
            let b = bytes[i];
            if !((b >= b'a' && b <= b'z') || (b >= b'0' && b <= b'9') || b == b'_' || b == b':') {
                return false;
            }
            i += 1;
        }
        true
    }

    // Const string comparison keeps registry validation available in static initializers.
    pub(crate) const fn same_as(self, other: Self) -> bool {
        let a = self.0.as_bytes();
        let b = other.0.as_bytes();
        if a.len() != b.len() {
            return false;
        }
        let mut i = 0;
        while i < a.len() {
            if a[i] != b[i] {
                return false;
            }
            i += 1;
        }
        true
    }
}

/// Protocol position/state account, not the wallet that owns that position.
pub const USER_ACCOUNT: AccountRole = AccountRole("user_account");
pub const SOURCE_TOKEN_ACCOUNT: AccountRole = AccountRole("source_token_account");
pub const DESTINATION_TOKEN_ACCOUNT: AccountRole = AccountRole("destination_token_account");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccountBinding {
    pub role: AccountRole,
    /// Zero-based CPI account index, excluding the prepended executable program.
    pub index: u8,
}

/// Addresses must come from the host's validated accounts or trusted state.
pub type ExpectedAccount = (AccountRole, Pubkey);

pub(crate) fn validate_expected_accounts(accounts: &[ExpectedAccount]) -> ProgramResult {
    for (i, (role, _)) in accounts.iter().enumerate() {
        if !role.is_valid() || accounts[..i].iter().any(|(previous, _)| previous == role) {
            return Err(ProgramError::InvalidArgument);
        }
    }
    Ok(())
}

/// Check both directions: registry requirements need host bindings, and host
/// requirements cannot disappear when the client selects a different CPI entry.
pub(crate) fn validate_cpi_accounts<'a>(
    entry: &CpiEntry,
    indices: &[u8],
    remaining: &[AccountInfo<'_>],
    expected: impl Iterator<Item = &'a ExpectedAccount> + Clone,
) -> ProgramResult {
    let account = |index: usize| {
        indices
            .get(index)
            .and_then(|i| remaining.get(usize::from(*i)))
            .ok_or(ProgramError::NotEnoughAccountKeys)
    };
    let program = account(0)?;
    if program.key != &entry.program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    if !program.executable {
        return Err(ProgramError::InvalidAccountData);
    }
    for binding in entry.required_accounts {
        let actual = account(usize::from(binding.index) + 1)?;
        let (_, key) = expected
            .clone()
            .find(|(role, _)| *role == binding.role)
            .ok_or(ProgramError::InvalidArgument)?;
        if actual.key != key {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    for (role, key) in expected {
        let binding = entry
            .required_accounts
            .iter()
            .find(|binding| binding.role == *role)
            .ok_or(ProgramError::InvalidArgument)?;
        if account(usize::from(binding.index) + 1)?.key != key {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    Ok(())
}
