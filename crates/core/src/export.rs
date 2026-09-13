//! Host-only export support, enabled by integration crates' dev-dependencies.
//! The compiled entries and discriminator method are the code generation source.
use crate::{registry::RETIRED_IDS, CpiEntry};
use serde_json::json;
use solana_pubkey::Pubkey;

#[doc(hidden)]
pub fn write_registry(crate_name: &str, programs: &[(&str, &str, Pubkey)], entries: &[CpiEntry]) {
    let directory = std::env::var_os("CPI_REGISTRY_EXPORT_DIR")
        .expect("Run pnpm codegen or pnpm check:registry to export Rust registries");
    let programs: Vec<_> = programs
        .iter()
        .map(|(name, constant, id)| {
            json!({ "name": name, "programIdConstant": constant, "programId": id.to_string() })
        })
        .collect();
    let entries: Vec<_> = entries
        .iter()
        .map(|entry| {
            json!({
                "id": entry.id,
                "label": entry.label,
                "programId": entry.program_id.to_string(),
                "instructionName": entry.instruction_name,
                "discriminator": entry.discriminator(),
                "category": entry.category.map(|category| format!("{category:?}")),
                "expectedTargetAccountIndex": entry.expected_target_account_index,
            })
        })
        .collect();
    let output = json!({
        "crate": crate_name,
        "programs": programs,
        "entries": entries,
        "retiredIds": RETIRED_IDS,
    });
    std::fs::write(
        std::path::Path::new(&directory).join(format!("{crate_name}.json")),
        serde_json::to_vec_pretty(&output).expect("serialize CPI registry"),
    )
    .expect("write CPI registry export");
}

/// Add the same ignored-test export workflow used by tokenized-positions.
/// Invoke under `#[cfg(test)]`; entries are always read from `CPI_ENTRIES`.
#[macro_export]
macro_rules! export_cpi_registry {
    ($($name:literal => $program:ident),+ $(,)?) => {
        #[test]
        #[ignore = "run through pnpm codegen or pnpm check:registry"]
        fn export_cpi_registry() {
            $crate::export::write_registry(
                env!("CARGO_PKG_NAME"),
                &[$(($name, stringify!($program), $program)),+],
                CPI_ENTRIES,
            );
        }
    };
}
