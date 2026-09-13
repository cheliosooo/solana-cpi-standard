use solana_cpi_standard_core::CpiRegistry;
use solana_cpi_standard_kamino::{
    CpiType, CPI_ENTRIES, KAMINO_FARMS_PROGRAM_ID, KAMINO_LENDING_PROGRAM_ID,
};

static REGISTRY: CpiRegistry = CpiRegistry::new(&[CPI_ENTRIES]);

#[test]
fn combined_registry_preserves_each_program_target() {
    assert_eq!(CPI_ENTRIES.len(), 12);
    for id in 8..=19 {
        let expected = if id == CpiType::K_HARVEST_REWARD {
            KAMINO_FARMS_PROGRAM_ID
        } else {
            KAMINO_LENDING_PROGRAM_ID
        };
        assert_eq!(REGISTRY.get(id).unwrap().program_id, expected);
    }
    assert!(REGISTRY.get(20).is_none());
}
