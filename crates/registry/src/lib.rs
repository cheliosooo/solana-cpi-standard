//! Enable only the integrations your program intends to support.
use solana_cpi_standard_core::CpiRegistry;

pub static CPI_REGISTRY: CpiRegistry = CpiRegistry::new(&[
    #[cfg(feature = "jupiter")]
    solana_cpi_standard_jupiter::CPI_ENTRIES,
    #[cfg(feature = "perena")]
    solana_cpi_standard_perena::CPI_ENTRIES,
    #[cfg(feature = "kamino")]
    solana_cpi_standard_kamino::CPI_ENTRIES,
    #[cfg(feature = "metaplex-token-metadata")]
    solana_cpi_standard_metaplex_token_metadata::CPI_ENTRIES,
]);
