//! Existing Borsh wire layout, with checked account access and explicit registry selection.
use crate::accounts::{validate_cpi_accounts, validate_expected_accounts};
use crate::ExpectedAccount;
use crate::{
    args::{CpiArgsEntry, CpiArgsReader},
    invoke::{build_account_metas_into, execute_cpi_with_reusable_buffers, PdaSigner},
    registry::{CpiCategory, CpiRegistry},
    traits::AmountArgs,
    validate::validate_cpi_types,
};
use borsh::{BorshDeserialize, BorshSerialize};
use solana_account_info::AccountInfo;
use solana_instruction::AccountMeta;
use solana_program_error::{ProgramError, ProgramResult};
use solana_pubkey::Pubkey;

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct CpiMapping {
    pub indices: Vec<u8>,
    pub lengths: Vec<u8>,
}
impl CpiMapping {
    pub fn new(indices: Vec<u8>, lengths: Vec<u8>) -> Self {
        Self { indices, lengths }
    }
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct CpiRefs {
    pub accounts: CpiMapping,
    pub types: Vec<u8>,
    /// Per slot: u16 LE length then bytes; 0xffff means program-supplied arguments.
    pub args: Vec<u8>,
}
impl CpiRefs {
    pub fn new(accounts: CpiMapping, types: Vec<u8>, args: Vec<u8>) -> Self {
        Self {
            accounts,
            types,
            args,
        }
    }
}

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize)]
pub struct InstructionRefs {
    pub cpi: CpiRefs,
    pub tracked: Vec<u8>,
}
impl InstructionRefs {
    pub fn get_tracked_account<'a, 'info>(
        &self,
        index: usize,
        accounts: &'a [AccountInfo<'info>],
    ) -> Result<&'a AccountInfo<'info>, ProgramError> {
        let index = *self
            .tracked
            .get(index)
            .ok_or(ProgramError::InvalidArgument)?;
        accounts
            .get(usize::from(index))
            .ok_or(ProgramError::NotEnoughAccountKeys)
    }
}

/// Applications may implement this for their own persisted plan-account layout.
pub trait CpiRefsView {
    fn account_lengths(&self) -> &[u8];
    fn account_indices(&self) -> &[u8];
    fn cpi_types(&self) -> &[u8];
    fn args(&self) -> &[u8];
    fn num_cpis(&self) -> usize {
        self.cpi_types().len()
    }
    fn args_reader(&self) -> CpiArgsReader<'_> {
        CpiArgsReader::new(self.args())
    }

    fn get_indices_for_cpi(&self, cpi_num: u8) -> Result<&[u8], ProgramError> {
        let cpi_num = usize::from(cpi_num);
        let length = usize::from(
            *self
                .account_lengths()
                .get(cpi_num)
                .ok_or(ProgramError::InvalidArgument)?,
        );
        let start: usize = self.account_lengths()[..cpi_num]
            .iter()
            .map(|&n| usize::from(n))
            .sum();
        let end = start
            .checked_add(length)
            .ok_or(ProgramError::InvalidArgument)?;
        self.account_indices()
            .get(start..end)
            .ok_or(ProgramError::InvalidArgument)
    }

    /// Validate the entire plan before any CPI executes, including slots after a
    /// skip. Unknown IDs are errors, never treated as uncategorized operations.
    fn validate(&self, registry: &CpiRegistry, account_count: usize) -> ProgramResult {
        if self.num_cpis() > 256
            || self.account_lengths().len() != self.num_cpis()
            || account_count > 256
        {
            return Err(ProgramError::InvalidArgument);
        }
        let total: usize = self.account_lengths().iter().map(|&n| usize::from(n)).sum();
        if total != self.account_indices().len() || self.account_lengths().contains(&0) {
            return Err(ProgramError::InvalidArgument);
        }
        if self
            .account_indices()
            .iter()
            .any(|&index| usize::from(index) >= account_count)
        {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        let mut args = self.args_reader();
        for &id in self.cpi_types() {
            registry.get(id).ok_or(ProgramError::InvalidArgument)?;
            args.next()?;
        }
        if !args.is_empty() {
            return Err(ProgramError::InvalidArgument);
        }
        Ok(())
    }
}
impl CpiRefsView for CpiRefs {
    fn account_lengths(&self) -> &[u8] {
        &self.accounts.lengths
    }
    fn account_indices(&self) -> &[u8] {
        &self.accounts.indices
    }
    fn cpi_types(&self) -> &[u8] {
        &self.types
    }
    fn args(&self) -> &[u8] {
        &self.args
    }
}

#[derive(Default)]
struct CpiInvokeBuffers<'info> {
    accounts: Vec<AccountInfo<'info>>,
    metas: Vec<AccountMeta>,
    data: Vec<u8>,
}

#[allow(clippy::too_many_arguments)]
fn invoke_with_buffers<'info, R: CpiRefsView + ?Sized>(
    registry: &CpiRegistry,
    signer: &Pubkey,
    cpi_index: u8,
    refs: &R,
    remaining: &[AccountInfo<'info>],
    args: &[u8],
    pda_signer: Option<&PdaSigner>,
    buffers: &mut CpiInvokeBuffers<'info>,
) -> ProgramResult {
    let id = *refs
        .cpi_types()
        .get(usize::from(cpi_index))
        .ok_or(ProgramError::InvalidArgument)?;
    let entry = registry.get(id).ok_or(ProgramError::InvalidArgument)?;
    buffers.accounts.clear();
    let indices = refs.get_indices_for_cpi(cpi_index)?;
    buffers.accounts.reserve(indices.len());
    for &index in indices {
        buffers.accounts.push(
            remaining
                .get(usize::from(index))
                .ok_or(ProgramError::NotEnoughAccountKeys)?
                .clone(),
        );
    }
    buffers.data.clear();
    if let Some(discriminator) = entry.discriminator() {
        buffers.data.extend_from_slice(&discriminator);
    }
    buffers.data.extend_from_slice(args);
    build_account_metas_into(
        signer,
        &buffers.accounts[1..],
        pda_signer.map(|s| &s.pubkey),
        &mut buffers.metas,
    );
    execute_cpi_with_reusable_buffers(
        entry.program_id,
        &mut buffers.metas,
        &buffers.accounts,
        &mut buffers.data,
        pda_signer,
    )
}

/// Invoke one slot with explicit arguments (without the Anchor discriminator).
#[allow(clippy::too_many_arguments)]
pub fn invoke_cpi<'info, R: CpiRefsView + ?Sized>(
    registry: &CpiRegistry,
    signer: &Pubkey,
    cpi_index: u8,
    refs: &R,
    remaining: &[AccountInfo<'info>],
    args: &[u8],
    pda_signer: Option<&PdaSigner>,
    expected_accounts: &[ExpectedAccount],
) -> ProgramResult {
    refs.validate(registry, remaining.len())?;
    validate_expected_accounts(expected_accounts)?;
    let id = *refs
        .cpi_types()
        .get(usize::from(cpi_index))
        .ok_or(ProgramError::InvalidArgument)?;
    let entry = registry.get(id).ok_or(ProgramError::InvalidArgument)?;
    validate_cpi_accounts(
        entry,
        refs.get_indices_for_cpi(cpi_index)?,
        remaining,
        expected_accounts.iter(),
    )?;
    invoke_with_buffers(
        registry,
        signer,
        cpi_index,
        refs,
        remaining,
        args,
        pda_signer,
        &mut CpiInvokeBuffers::default(),
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AccountScope {
    Category(CpiCategory),
    Slot(u8),
}
impl AccountScope {
    fn matches(self, slot: usize, category: Option<CpiCategory>) -> bool {
        match self {
            Self::Category(expected) => category == Some(expected),
            Self::Slot(expected) => slot == usize::from(expected),
        }
    }
}
struct AccountExpectations<'a> {
    scope: AccountScope,
    accounts: &'a [ExpectedAccount],
}

/// Reuses invocation buffers across a chain. The host program remains responsible
/// for authorizing its signer, validating accounts, and selecting allowed CPIs.
pub struct CpiDispatcher<'a, 'info, R: CpiRefsView + ?Sized> {
    registry: &'a CpiRegistry,
    signer: &'a Pubkey,
    refs: &'a R,
    remaining: &'a [AccountInfo<'info>],
    pda_signer: Option<&'a PdaSigner>,
    required_order: Option<&'a [CpiCategory]>,
    expected_count: Option<usize>,
    maximum_count: Option<usize>,
    account_expectations: Vec<AccountExpectations<'a>>,
}
impl<'a, 'info, R: CpiRefsView + ?Sized> CpiDispatcher<'a, 'info, R> {
    pub fn new(
        registry: &'a CpiRegistry,
        signer: &'a Pubkey,
        refs: &'a R,
        remaining: &'a [AccountInfo<'info>],
    ) -> Self {
        Self {
            registry,
            signer,
            refs,
            remaining,
            pda_signer: None,
            required_order: None,
            expected_count: None,
            maximum_count: None,
            account_expectations: Vec::new(),
        }
    }
    pub fn pda_signer(mut self, signer: &'a PdaSigner) -> Self {
        self.pda_signer = Some(signer);
        self
    }
    pub fn required_order(mut self, order: &'a [CpiCategory]) -> Self {
        self.required_order = Some(order);
        self
    }
    pub fn expected_count(mut self, count: usize) -> Self {
        self.expected_count = Some(count);
        self
    }
    pub fn maximum_count(mut self, count: usize) -> Self {
        self.maximum_count = Some(count);
        self
    }
    /// Require these roles on every CPI in the selected category. Expectations
    /// from overlapping category/slot scopes are additive; a slot cannot override policy.
    pub fn expected_accounts_for(
        mut self,
        category: CpiCategory,
        accounts: &'a [ExpectedAccount],
    ) -> Self {
        self.account_expectations.push(AccountExpectations {
            scope: AccountScope::Category(category),
            accounts,
        });
        self
    }

    /// Bind one concrete CPI slot, including an uncategorized prerequisite call.
    /// Use this for repeated actions whose expected addresses differ.
    pub fn expected_accounts_for_slot(mut self, slot: u8, accounts: &'a [ExpectedAccount]) -> Self {
        self.account_expectations.push(AccountExpectations {
            scope: AccountScope::Slot(slot),
            accounts,
        });
        self
    }

    fn validate(&self) -> ProgramResult {
        self.refs.validate(self.registry, self.remaining.len())?;
        match self.required_order {
            Some(order) => validate_cpi_types(
                self.registry,
                self.refs.cpi_types(),
                order,
                self.expected_count,
                self.maximum_count,
            )?,
            None if self.expected_count.is_some() || self.maximum_count.is_some() => {
                return Err(ProgramError::InvalidArgument)
            }
            None => (),
        }
        for (i, expectations) in self.account_expectations.iter().enumerate() {
            validate_expected_accounts(expectations.accounts)?;
            if expectations.accounts.is_empty()
                || self.account_expectations[..i]
                    .iter()
                    .any(|previous| previous.scope == expectations.scope)
            {
                return Err(ProgramError::InvalidArgument);
            }
            // Reject unused policies (e.g. a mistyped category or out-of-range slot).
            if !self.refs.cpi_types().iter().enumerate().any(|(slot, id)| {
                self.registry
                    .get(*id)
                    .is_some_and(|entry| expectations.scope.matches(slot, entry.category))
            }) {
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Account keys are immutable. Validate the entire plan, including deferred
        // amount slots and uncategorized setup calls, before executing its first CPI.
        for (slot, id) in self.refs.cpi_types().iter().enumerate() {
            let entry = self
                .registry
                .get(*id)
                .ok_or(ProgramError::InvalidArgument)?;
            let expected = self
                .account_expectations
                .iter()
                .filter(|set| set.scope.matches(slot, entry.category))
                .flat_map(|set| set.accounts.iter());
            validate_cpi_accounts(
                entry,
                self.refs.get_indices_for_cpi(slot as u8)?,
                self.remaining,
                expected,
            )?;
        }
        Ok(())
    }

    fn invoke_until_skip(
        &self,
        start: usize,
        reader: &mut CpiArgsReader<'_>,
        buffers: &mut CpiInvokeBuffers<'info>,
    ) -> Result<usize, ProgramError> {
        for slot in start..self.refs.num_cpis() {
            match reader.next()? {
                CpiArgsEntry::Data(args) => invoke_with_buffers(
                    self.registry,
                    self.signer,
                    slot as u8,
                    self.refs,
                    self.remaining,
                    args,
                    self.pda_signer,
                    buffers,
                )?,
                CpiArgsEntry::Skip => return Ok(slot),
            }
        }
        Ok(self.refs.num_cpis())
    }

    /// Returns the first skip slot, or the number of slots if all executed.
    pub fn invoke(&self) -> Result<usize, ProgramError> {
        self.validate()?;
        self.invoke_until_skip(
            0,
            &mut self.refs.args_reader(),
            &mut CpiInvokeBuffers::default(),
        )
    }

    /// Supply an amount to exactly one skip slot. Reject zero/multiple skip slots
    /// before executing anything so a requested amount cannot be silently ignored.
    pub fn invoke_amount_cpi<A: AmountArgs>(self, amount: u64) -> ProgramResult {
        self.invoke_amount_cpi_with::<A, _, ProgramError>(|| Ok(amount))
    }

    /// Compute the amount after prerequisite CPIs have executed. Generic errors
    /// allow callers to retain their application/Anchor errors without coupling core.
    pub fn invoke_amount_cpi_with<A, F, E>(self, amount_provider: F) -> Result<(), E>
    where
        A: AmountArgs,
        F: FnOnce() -> Result<u64, E>,
        E: From<ProgramError>,
    {
        self.validate()?;
        let mut reader = self.refs.args_reader();
        let mut skips = 0;
        for _ in 0..self.refs.num_cpis() {
            if reader.next()? == CpiArgsEntry::Skip {
                skips += 1;
            }
        }
        if skips != 1 {
            return Err(ProgramError::InvalidArgument.into());
        }
        let mut reader = self.refs.args_reader();
        let mut buffers = CpiInvokeBuffers::default();
        let slot = self.invoke_until_skip(0, &mut reader, &mut buffers)?;
        let args = A::new(amount_provider()?)
            .try_to_vec()
            .map_err(|_| ProgramError::InvalidArgument)?;
        invoke_with_buffers(
            self.registry,
            self.signer,
            slot as u8,
            self.refs,
            self.remaining,
            &args,
            self.pda_signer,
            &mut buffers,
        )?;
        self.invoke_until_skip(slot + 1, &mut reader, &mut buffers)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CpiEntry, U64AmountArgs};
    static ENTRIES: &[CpiEntry] = &[
        CpiEntry {
            id: 100,
            label: "ANCHOR",
            program_id: Pubkey::new_from_array([1; 32]),
            instruction_name: "deposit",
            category: Some(CpiCategory::Deposit),
            required_accounts: &[crate::AccountBinding {
                role: crate::USER_ACCOUNT,
                index: 1,
            }],
        },
        CpiEntry {
            id: 101,
            label: "RAW",
            program_id: Pubkey::new_from_array([1; 32]),
            instruction_name: "",
            category: Some(CpiCategory::Swap),
            required_accounts: &[],
        },
    ];
    static REGISTRY: CpiRegistry = CpiRegistry::new(&[ENTRIES]);
    fn account(
        key: Pubkey,
        signer: bool,
        writable: bool,
        executable: bool,
    ) -> AccountInfo<'static> {
        AccountInfo::new(
            Box::leak(Box::new(key)),
            signer,
            writable,
            Box::leak(Box::new(0)),
            Box::leak(Vec::new().into_boxed_slice()),
            Box::leak(Box::new(Pubkey::default())),
            executable,
            0,
        )
    }
    fn refs(id: u8, args: Vec<u8>) -> CpiRefs {
        CpiRefs::new(CpiMapping::new(vec![0, 1, 2], vec![3]), vec![id], args)
    }
    fn accounts() -> Vec<AccountInfo<'static>> {
        vec![
            account(ENTRIES[0].program_id, false, false, true),
            account(Pubkey::new_unique(), true, false, false),
            account(Pubkey::new_unique(), false, true, false),
        ]
    }

    #[test]
    fn invocation_builds_exact_data_metas_and_preserves_buffers() {
        let accounts = accounts();
        let mut buffers = CpiInvokeBuffers::default();
        let value = refs(100, vec![255, 255]);
        assert_eq!(
            invoke_with_buffers(
                &REGISTRY,
                accounts[1].key,
                0,
                &value,
                &accounts,
                &[7, 0],
                None,
                &mut buffers
            ),
            Ok(())
        );
        let mut expected = ENTRIES[0].discriminator().unwrap().to_vec();
        expected.extend([7, 0]);
        assert_eq!(buffers.data, expected);
        assert_eq!(
            buffers.metas,
            vec![
                AccountMeta::new_readonly(*accounts[1].key, true),
                AccountMeta::new(*accounts[2].key, false)
            ]
        );
        let data_ptr = buffers.data.as_ptr();
        let metas_ptr = buffers.metas.as_ptr();
        let raw = refs(101, vec![255, 255]);
        assert_eq!(
            invoke_with_buffers(
                &REGISTRY,
                accounts[1].key,
                0,
                &raw,
                &accounts,
                &[3, 4],
                None,
                &mut buffers
            ),
            Ok(())
        );
        assert_eq!(buffers.data, vec![3, 4]);
        assert_eq!(buffers.data.as_ptr(), data_ptr);
        assert_eq!(buffers.metas.as_ptr(), metas_ptr);
    }

    #[test]
    fn invocation_rejects_wrong_program_nonexecutable_and_wrong_target() {
        let accounts = accounts();
        let value = refs(100, vec![255, 255]);
        let signer = accounts[1].key;
        let mut wrong = accounts.clone();
        wrong[0] = account(Pubkey::new_unique(), false, false, true);
        assert_eq!(
            invoke_cpi(
                &REGISTRY,
                signer,
                0,
                &value,
                &wrong,
                &[],
                None,
                &[(crate::USER_ACCOUNT, *accounts[2].key)]
            ),
            Err(ProgramError::IncorrectProgramId)
        );
        wrong[0] = account(ENTRIES[0].program_id, false, false, false);
        assert_eq!(
            invoke_cpi(
                &REGISTRY,
                signer,
                0,
                &value,
                &wrong,
                &[],
                None,
                &[(crate::USER_ACCOUNT, *accounts[2].key)]
            ),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            invoke_cpi(
                &REGISTRY,
                signer,
                0,
                &value,
                &accounts,
                &[],
                None,
                &[(crate::USER_ACCOUNT, *signer)]
            ),
            Err(ProgramError::InvalidAccountData)
        );
        let short = CpiRefs::new(
            CpiMapping::new(vec![0, 1], vec![2]),
            vec![100],
            vec![255, 255],
        );
        assert_eq!(
            invoke_cpi(
                &REGISTRY,
                signer,
                0,
                &short,
                &accounts,
                &[],
                None,
                &[(crate::USER_ACCOUNT, *signer)]
            ),
            Err(ProgramError::NotEnoughAccountKeys)
        );
    }

    #[test]
    fn amount_dispatch_rejects_multiple_skips_and_propagates_provider_failure() {
        let accounts = accounts();
        let value = CpiRefs::new(
            CpiMapping::new(vec![0, 1, 2, 0, 1, 2], vec![3, 3]),
            vec![100, 100],
            vec![255; 4],
        );
        let expected = [(crate::USER_ACCOUNT, *accounts[2].key)];
        let result = CpiDispatcher::new(&REGISTRY, accounts[1].key, &value, &accounts)
            .expected_accounts_for(CpiCategory::Deposit, &expected)
            .invoke_amount_cpi_with::<U64AmountArgs, _, ProgramError>(|| {
                panic!("must reject before callback")
            });
        assert_eq!(result, Err(ProgramError::InvalidArgument));
        let value = refs(100, vec![255, 255]);
        assert_eq!(
            CpiDispatcher::new(&REGISTRY, accounts[1].key, &value, &accounts)
                .expected_accounts_for(CpiCategory::Deposit, &expected)
                .invoke(),
            Ok(0)
        );
        assert_eq!(
            CpiDispatcher::new(&REGISTRY, accounts[1].key, &value, &accounts)
                .expected_accounts_for(CpiCategory::Deposit, &expected)
                .invoke_amount_cpi::<U64AmountArgs>(123),
            Ok(())
        );
        assert_eq!(
            CpiDispatcher::new(&REGISTRY, accounts[1].key, &value, &accounts)
                .expected_accounts_for(CpiCategory::Deposit, &expected)
                .invoke_amount_cpi_with::<U64AmountArgs, _, ProgramError>(|| Err(
                    ProgramError::Custom(91)
                )),
            Err(ProgramError::Custom(91))
        );
    }

    #[test]
    fn pda_signer_is_explicit_and_seed_error_keeps_buffers() {
        let accounts = accounts();
        let pda = PdaSigner {
            pubkey: *accounts[2].key,
            seeds: vec![vec![]; 9],
        };
        let mut buffers = CpiInvokeBuffers::default();
        assert_eq!(
            invoke_with_buffers(
                &REGISTRY,
                accounts[1].key,
                0,
                &refs(100, vec![255, 255]),
                &accounts,
                &[42],
                Some(&pda),
                &mut buffers
            ),
            Err(ProgramError::InvalidSeeds)
        );
        assert_eq!(buffers.metas[1], AccountMeta::new(*accounts[2].key, true));
        assert_eq!(buffers.data.last(), Some(&42));
        // An unrelated outer signer is not forwarded implicitly.
        assert!(
            !crate::invoke::build_account_meta(&Pubkey::new_unique(), &accounts[1], None).is_signer
        );
    }
}
