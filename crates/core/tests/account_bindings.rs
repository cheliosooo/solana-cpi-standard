use solana_account_info::AccountInfo;
use solana_cpi_standard_core::{
    invoke_cpi, AccountBinding, AccountRole, CpiCategory, CpiDispatcher, CpiEntry, CpiMapping,
    CpiRefs, CpiRegistry, U64AmountArgs, DESTINATION_TOKEN_ACCOUNT, SOURCE_TOKEN_ACCOUNT,
    USER_ACCOUNT,
};
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;

const PROGRAM: Pubkey = Pubkey::new_from_array([1; 32]);
const USER: AccountBinding = AccountBinding {
    role: USER_ACCOUNT,
    index: 0,
};
const SOURCE: AccountBinding = AccountBinding {
    role: SOURCE_TOKEN_ACCOUNT,
    index: 1,
};
const DESTINATION: AccountBinding = AccountBinding {
    role: DESTINATION_TOKEN_ACCOUNT,
    index: 1,
};
static ENTRIES: &[CpiEntry] = &[
    CpiEntry {
        id: 100,
        label: "DEPOSIT",
        program_id: PROGRAM,
        instruction_name: "deposit",
        category: Some(CpiCategory::Deposit),
        required_accounts: &[USER, SOURCE],
    },
    CpiEntry {
        id: 101,
        label: "WITHDRAW",
        program_id: PROGRAM,
        instruction_name: "withdraw",
        category: Some(CpiCategory::Withdraw),
        required_accounts: &[USER, DESTINATION],
    },
    CpiEntry {
        id: 102,
        label: "REFRESH",
        program_id: PROGRAM,
        instruction_name: "refresh",
        category: None,
        required_accounts: &[USER],
    },
    CpiEntry {
        id: 103,
        label: "UNBOUND_WITHDRAW",
        program_id: PROGRAM,
        instruction_name: "withdraw_other",
        category: Some(CpiCategory::Withdraw),
        required_accounts: &[USER],
    },
    CpiEntry {
        id: 104,
        label: "OTHER_LAYOUT",
        program_id: PROGRAM,
        instruction_name: "withdraw_reversed",
        category: Some(CpiCategory::Withdraw),
        required_accounts: &[
            AccountBinding {
                role: USER_ACCOUNT,
                index: 1,
            },
            AccountBinding {
                role: DESTINATION_TOKEN_ACCOUNT,
                index: 0,
            },
        ],
    },
];
static REGISTRY: CpiRegistry = CpiRegistry::new(&[ENTRIES]);
fn account(key: Pubkey, executable: bool) -> AccountInfo<'static> {
    AccountInfo::new(
        Box::leak(Box::new(key)),
        false,
        !executable,
        Box::leak(Box::new(0)),
        Box::leak(Vec::new().into_boxed_slice()),
        Box::leak(Box::new(Pubkey::default())),
        executable,
        0,
    )
}
fn accounts() -> Vec<AccountInfo<'static>> {
    vec![
        account(PROGRAM, true),
        account(Pubkey::new_unique(), false),
        account(Pubkey::new_unique(), false),
        account(Pubkey::new_unique(), false),
    ]
}
fn plan(ids: &[u8], mappings: &[&[u8]], args: Vec<u8>) -> CpiRefs {
    CpiRefs::new(
        CpiMapping::new(
            mappings.iter().flat_map(|m| m.iter().copied()).collect(),
            mappings.iter().map(|m| m.len() as u8).collect(),
        ),
        ids.to_vec(),
        args,
    )
}
#[test]
fn deposit_and_withdraw_enforce_different_roles_and_actual_account_mapping() {
    let a = accounts();
    let user = [(USER_ACCOUNT, *a[1].key)];
    let withdrawal = [
        (USER_ACCOUNT, *a[1].key),
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
    ];
    let deposit_expected = [(USER_ACCOUNT, *a[1].key), (SOURCE_TOKEN_ACCOUNT, *a[2].key)];
    let deposit = plan(&[100], &[&[0, 1, 2]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &deposit, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .invoke(),
        Ok(1)
    );
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &deposit, &a)
            .expected_accounts_for(CpiCategory::Deposit, &user)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    // A destination expectation cannot stand in for the required source role.
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &deposit, &a)
            .expected_accounts_for(CpiCategory::Deposit, &withdrawal)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    let substituted_source = plan(&[100], &[&[0, 1, 3]], vec![255, 255]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &substituted_source, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .invoke_amount_cpi_with::<U64AmountArgs, _, ProgramError>(|| panic!(
                "wrong source must fail before the amount callback"
            )),
        Err(ProgramError::InvalidAccountData)
    );
    let missing_source = plan(&[100], &[&[0, 1]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &missing_source, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .invoke(),
        Err(ProgramError::NotEnoughAccountKeys)
    );
    let withdraw = plan(&[101], &[&[0, 1, 2]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &withdraw, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &withdrawal)
            .invoke(),
        Ok(1)
    );
    // The same role names work with a protocol whose account order is reversed.
    let reversed = plan(&[104], &[&[0, 2, 1]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &reversed, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &withdrawal)
            .invoke(),
        Ok(1)
    );
    let substituted = plan(&[101], &[&[0, 1, 3]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &substituted, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &withdrawal)
            .invoke(),
        Err(ProgramError::InvalidAccountData)
    );
}
#[test]
fn missing_host_expectations_and_missing_registry_roles_fail_closed() {
    let a = accounts();
    let user = [(USER_ACCOUNT, *a[1].key)];
    let expected = [
        (USER_ACCOUNT, *a[1].key),
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
    ];
    let withdraw = plan(&[101], &[&[0, 1, 2]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &withdraw, &a).invoke(),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &withdraw, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &user)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    let weak = plan(&[103], &[&[0, 1, 2]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &weak, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &expected)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    let short = plan(&[101], &[&[0, 1]], vec![0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &short, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &expected)
            .invoke(),
        Err(ProgramError::NotEnoughAccountKeys)
    );
    let wrong_user = [
        (USER_ACCOUNT, *a[3].key),
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
    ];
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &withdraw, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &wrong_user)
            .invoke(),
        Err(ProgramError::InvalidAccountData)
    );
}
#[test]
fn two_withdrawals_use_slot_destinations_without_overriding_category_policy() {
    let a = accounts();
    let value = plan(&[101, 101], &[&[0, 1, 2], &[0, 1, 3]], vec![0; 4]);
    let common = [(USER_ACCOUNT, *a[1].key)];
    let first = [(DESTINATION_TOKEN_ACCOUNT, *a[2].key)];
    let second = [(DESTINATION_TOKEN_ACCOUNT, *a[3].key)];
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &common)
            .expected_accounts_for_slot(0, &first)
            .expected_accounts_for_slot(1, &second)
            .invoke(),
        Ok(2)
    );
    let global_destination = [
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
        (USER_ACCOUNT, *a[1].key),
    ];
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &global_destination)
            .expected_accounts_for_slot(1, &second)
            .invoke(),
        Err(ProgramError::InvalidAccountData)
    );
}
#[test]
fn all_slots_are_checked_before_amount_provider_including_uncategorized_calls() {
    let a = accounts();
    let common = [(USER_ACCOUNT, *a[1].key)];
    let expected = [
        (USER_ACCOUNT, *a[1].key),
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
    ];
    let deposit_expected = [(USER_ACCOUNT, *a[1].key), (SOURCE_TOKEN_ACCOUNT, *a[2].key)];
    let value = plan(&[100, 101], &[&[0, 1, 2], &[0, 1, 3]], vec![255, 255, 0, 0]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .expected_accounts_for(CpiCategory::Withdraw, &expected)
            .invoke_amount_cpi_with::<U64AmountArgs, _, ProgramError>(|| panic!(
                "bad later destination must fail before amount callback"
            )),
        Err(ProgramError::InvalidAccountData)
    );
    let setup = plan(&[102, 100], &[&[0, 1], &[0, 1, 2]], vec![0, 0, 255, 255]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &setup, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &setup, &a)
            .expected_accounts_for(CpiCategory::Deposit, &deposit_expected)
            .expected_accounts_for_slot(0, &common)
            .invoke_amount_cpi::<U64AmountArgs>(42),
        Ok(())
    );
}
#[test]
fn duplicate_invalid_empty_and_unused_expectations_are_rejected() {
    let a = accounts();
    let value = plan(&[100], &[&[0, 1, 2]], vec![0, 0]);
    let user = [(USER_ACCOUNT, *a[1].key)];
    let duplicate = [user[0], user[0]];
    let invalid = [(AccountRole(""), *a[1].key)];
    for expected in [&duplicate[..], &invalid[..], &[][..]] {
        assert_eq!(
            CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
                .expected_accounts_for(CpiCategory::Deposit, expected)
                .invoke(),
            Err(ProgramError::InvalidArgument)
        );
    }
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for(CpiCategory::Deposit, &user)
            .expected_accounts_for(CpiCategory::Deposit, &user)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for(CpiCategory::Withdraw, &user)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, a[1].key, &value, &a)
            .expected_accounts_for_slot(1, &user)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
}
#[test]
fn direct_invocation_cannot_bypass_named_checks() {
    let a = accounts();
    let value = plan(&[101], &[&[0, 1, 2]], vec![255, 255]);
    let expected = [
        (USER_ACCOUNT, *a[1].key),
        (DESTINATION_TOKEN_ACCOUNT, *a[2].key),
    ];
    assert_eq!(
        invoke_cpi(&REGISTRY, a[1].key, 0, &value, &a, &[], None, &[]),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        invoke_cpi(&REGISTRY, a[1].key, 0, &value, &a, &[], None, &expected),
        Ok(())
    );
}
#[test]
fn registry_rejects_invalid_bindings_and_allows_custom_roles_and_aliases() {
    static DUPLICATE: &[CpiEntry] = &[CpiEntry {
        required_accounts: &[USER, USER],
        ..ENTRIES[0]
    }];
    static OUT_OF_RANGE: &[CpiEntry] = &[CpiEntry {
        required_accounts: &[AccountBinding {
            role: USER_ACCOUNT,
            index: 254,
        }],
        ..ENTRIES[0]
    }];
    static INVALID_NAME: &[CpiEntry] = &[CpiEntry {
        required_accounts: &[AccountBinding {
            role: AccountRole("User Account"),
            index: 0,
        }],
        ..ENTRIES[0]
    }];
    static CASES: &[&[&[CpiEntry]]] = &[&[DUPLICATE], &[OUT_OF_RANGE], &[INVALID_NAME]];
    for entries in CASES {
        assert!(std::panic::catch_unwind(|| CpiRegistry::new(entries)).is_err());
    }
    static ALIASES: &[CpiEntry] = &[CpiEntry {
        required_accounts: &[
            USER,
            AccountBinding {
                role: AccountRole("custom:position"),
                index: 0,
            },
        ],
        ..ENTRIES[0]
    }];
    static CUSTOM: CpiRegistry = CpiRegistry::new(&[ALIASES]);
    let a = accounts();
    let value = plan(&[100], &[&[0, 1]], vec![0, 0]);
    let expected = [
        (USER_ACCOUNT, *a[1].key),
        (AccountRole("custom:position"), *a[1].key),
    ];
    assert_eq!(
        CpiDispatcher::new(&CUSTOM, a[1].key, &value, &a)
            .expected_accounts_for_slot(0, &expected)
            .invoke(),
        Ok(1)
    );
}
