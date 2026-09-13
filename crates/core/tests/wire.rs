use borsh::{BorshDeserialize, BorshSerialize};
use solana_cpi_standard_core::validate::validate_cpi_types;
use solana_cpi_standard_core::{
    args::{CpiArgsEntry, CpiArgsReader},
    CpiCategory, CpiDispatcher, CpiEntry, CpiMapping, CpiRefs, CpiRefsView, CpiRegistry,
    InstructionRefs, U64AmountArgs,
};
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;

static ENTRIES: &[CpiEntry] = &[
    CpiEntry {
        id: 0,
        label: "SWAP",
        program_id: Pubkey::new_from_array([1; 32]),
        instruction_name: "",
        category: Some(CpiCategory::Swap),
        expected_target_account_index: None,
    },
    CpiEntry {
        id: 8,
        label: "REFRESH",
        program_id: Pubkey::new_from_array([2; 32]),
        instruction_name: "refresh",
        category: None,
        expected_target_account_index: None,
    },
    CpiEntry {
        id: 16,
        label: "DEPOSIT",
        program_id: Pubkey::new_from_array([2; 32]),
        instruction_name: "deposit",
        category: Some(CpiCategory::Deposit),
        expected_target_account_index: Some(1),
    },
];
static REGISTRY: CpiRegistry = CpiRegistry::new(&[ENTRIES]);

fn refs() -> CpiRefs {
    CpiRefs::new(
        CpiMapping::new(vec![0, 1, 2, 3, 2, 1], vec![3, 3]),
        vec![0, 16],
        vec![2, 0, 0xaa, 0xbb, 0xff, 0xff],
    )
}

#[test]
fn original_borsh_wire_layout_round_trips() {
    let expected = include_bytes!("../../../tests/fixtures/instructionRefs.bin");
    let value = InstructionRefs {
        cpi: refs(),
        tracked: vec![1],
    };
    assert_eq!(value.try_to_vec().unwrap(), expected);
    let decoded = InstructionRefs::try_from_slice(expected).unwrap();
    assert_eq!(decoded.cpi.accounts.indices, vec![0, 1, 2, 3, 2, 1]);
    assert_eq!(decoded.cpi.types, vec![0, 16]);
    assert_eq!(decoded.cpi.args, vec![2, 0, 0xaa, 0xbb, 0xff, 0xff]);
    assert_eq!(decoded.tracked, vec![1]);
    assert_eq!(decoded.cpi.validate(&REGISTRY, 4), Ok(()));
}

#[test]
fn args_distinguish_empty_skip_and_data() {
    let mut reader = CpiArgsReader::new(&[0, 0, 255, 255, 2, 0, 7, 8]);
    assert_eq!(reader.next(), Ok(CpiArgsEntry::Data(&[])));
    assert_eq!(reader.next(), Ok(CpiArgsEntry::Skip));
    assert_eq!(reader.next(), Ok(CpiArgsEntry::Data(&[7, 8])));
    assert_eq!(reader.remaining(), 0);
    assert!(reader.is_empty());
    assert_eq!(reader.next(), Err(ProgramError::InvalidArgument));
}

#[test]
fn args_reject_truncated_prefix_and_payload() {
    for bytes in [&[][..], &[1][..], &[2, 0, 1][..]] {
        assert_eq!(
            CpiArgsReader::new(bytes).next(),
            Err(ProgramError::InvalidArgument)
        );
    }
    let mut data = vec![254, 255];
    data.extend(vec![42; 65534]);
    assert_eq!(
        CpiArgsReader::new(&data).next(),
        Ok(CpiArgsEntry::Data(&data[2..]))
    );
}

#[test]
fn malformed_plans_fail_before_dispatch() {
    let mut cases = Vec::new();
    let mut value = refs();
    value.types.push(0);
    cases.push(value);
    let mut value = refs();
    value.accounts.lengths[0] = 0;
    cases.push(value);
    let mut value = refs();
    value.accounts.indices.pop();
    cases.push(value);
    let mut value = refs();
    value.args.pop();
    cases.push(value);
    let mut value = refs();
    value.args.push(0);
    cases.push(value);
    let mut value = refs();
    value.types[1] = 2;
    cases.push(value);
    let mut value = refs();
    value.types[1] = 255;
    cases.push(value);
    for value in cases {
        assert_eq!(
            value.validate(&REGISTRY, 4),
            Err(ProgramError::InvalidArgument)
        );
    }
    let mut value = refs();
    value.accounts.indices[0] = 4;
    assert_eq!(
        value.validate(&REGISTRY, 4),
        Err(ProgramError::NotEnoughAccountKeys)
    );
    assert_eq!(
        refs().validate(&REGISTRY, 257),
        Err(ProgramError::InvalidArgument)
    );
}

#[test]
fn slot_255_is_valid_but_257_slots_are_rejected() {
    let mut value = CpiRefs::new(
        CpiMapping::new(vec![0; 256], vec![1; 256]),
        vec![0; 256],
        vec![0; 512],
    );
    assert_eq!(value.validate(&REGISTRY, 1), Ok(()));
    assert_eq!(value.get_indices_for_cpi(255), Ok(&[0][..]));
    value.types.push(0);
    value.accounts.lengths.push(1);
    value.accounts.indices.push(0);
    value.args.extend([0, 0]);
    assert_eq!(
        value.validate(&REGISTRY, 1),
        Err(ProgramError::InvalidArgument)
    );
}

#[test]
fn category_order_and_counts_are_an_allowlist() {
    let order = [CpiCategory::Swap, CpiCategory::Deposit];
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[8, 0, 0, 8, 16, 16], &order, Some(2), None),
        Ok(())
    );
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[0, 16], &order, None, Some(2)),
        Ok(())
    );
    for ids in [&[16, 0][..], &[0][..], &[0, 16, 0][..], &[0, 255, 16][..]] {
        assert_eq!(
            validate_cpi_types(&REGISTRY, ids, &order, None, None),
            Err(ProgramError::InvalidArgument)
        );
    }
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[0, 16], &order, Some(2), None),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[0, 0, 16], &order, None, Some(1)),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[0, 16], &order, Some(1), Some(1)),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        validate_cpi_types(
            &REGISTRY,
            &[0],
            &[CpiCategory::Swap, CpiCategory::Swap],
            None,
            None
        ),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[0, 16], &[CpiCategory::Swap], None, None),
        Err(ProgramError::InvalidArgument)
    );
    assert_eq!(validate_cpi_types(&REGISTRY, &[8], &[], None, None), Ok(()));
    assert_eq!(
        validate_cpi_types(&REGISTRY, &[255], &[], None, None),
        Err(ProgramError::InvalidArgument)
    );
}

#[test]
fn duplicate_and_retired_ids_are_rejected() {
    static DUPLICATE: &[&[CpiEntry]] = &[ENTRIES, ENTRIES];
    assert!(std::panic::catch_unwind(|| CpiRegistry::new(DUPLICATE)).is_err());
    static RETIRED: &[CpiEntry] = &[CpiEntry {
        id: 2,
        ..ENTRIES[0]
    }];
    static RETIRED_PROGRAMS: &[&[CpiEntry]] = &[RETIRED];
    assert!(std::panic::catch_unwind(|| CpiRegistry::new(RETIRED_PROGRAMS)).is_err());
    assert_eq!(REGISTRY.get(16).unwrap().label, "DEPOSIT");
    assert!(REGISTRY.get(255).is_none());
}

#[test]
fn amount_requires_exactly_one_skip_before_provider_is_called() {
    let signer = Pubkey::new_unique();
    let value = CpiRefs::new(CpiMapping::new(vec![], vec![]), vec![], vec![]);
    let result = CpiDispatcher::new(&REGISTRY, &signer, &value, &[])
        .invoke_amount_cpi_with::<U64AmountArgs, _, ProgramError>(|| {
            panic!("must not call provider")
        });
    assert_eq!(result, Err(ProgramError::InvalidArgument));
    let value = CpiRefs::new(CpiMapping::new(vec![], vec![]), vec![], vec![]);
    assert_eq!(
        CpiDispatcher::new(&REGISTRY, &signer, &value, &[])
            .expected_count(1)
            .invoke(),
        Err(ProgramError::InvalidArgument)
    );
}
