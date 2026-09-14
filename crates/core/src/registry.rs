//! Compose program registries without a dependency from core to any integration.
use crate::AccountBinding;
use sha2::{Digest, Sha256};
use solana_pubkey::Pubkey;

#[path = "retired.rs"]
mod retired;
pub use retired::RETIRED_IDS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CpiCategory {
    Swap,
    Deposit,
    Withdraw,
    Borrow,
    Repay,
    ClaimIncentives,
    UpdateMintMetadata,
}

#[derive(Clone, Copy, Debug)]
pub struct CpiEntry {
    pub id: u8,
    pub label: &'static str,
    pub program_id: Pubkey,
    /// Empty for raw instruction data; otherwise an Anchor instruction name.
    pub instruction_name: &'static str,
    pub category: Option<CpiCategory>,
    /// Every binding is mandatory whenever this entry is invoked.
    pub required_accounts: &'static [AccountBinding],
}

pub fn anchor_discriminator(instruction_name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("global:{instruction_name}").as_bytes());
    let mut discriminator = [0; 8];
    discriminator.copy_from_slice(&hash[..8]);
    discriminator
}

impl CpiEntry {
    pub fn discriminator(&self) -> Option<[u8; 8]> {
        if self.is_raw() {
            None
        } else {
            Some(anchor_discriminator(self.instruction_name))
        }
    }

    pub fn is_raw(&self) -> bool {
        self.instruction_name.is_empty()
    }
}

/// A program chooses its allowed integrations explicitly. Construction rejects
/// ID collisions across all selected crates, including duplicate registrations.
#[derive(Clone, Copy)]
pub struct CpiRegistry {
    programs: &'static [&'static [CpiEntry]],
}

impl CpiRegistry {
    /// Use in a `static` to make ID collisions a compile error. The registry check
    /// script also checks crates not selected by the consuming program.
    ///
    /// ```compile_fail
    /// use solana_cpi_standard_core::{CpiRegistry, CpiEntry};
    /// use solana_pubkey::Pubkey;
    /// static ENTRY: &[CpiEntry] = &[CpiEntry { id: 100, label: "TEST", program_id: Pubkey::new_from_array([1; 32]), instruction_name: "test", category: None, required_accounts: &[] }];
    /// static INVALID: CpiRegistry = CpiRegistry::new(&[ENTRY, ENTRY]);
    /// ```
    pub const fn new(programs: &'static [&'static [CpiEntry]]) -> Self {
        let mut used = [false; 256];
        let mut retired = 0;
        while retired < RETIRED_IDS.len() {
            used[RETIRED_IDS[retired] as usize] = true;
            retired += 1;
        }
        let mut program = 0;
        while program < programs.len() {
            let mut entry = 0;
            while entry < programs[program].len() {
                let bindings = programs[program][entry].required_accounts;
                let mut binding = 0;
                while binding < bindings.len() {
                    assert!(bindings[binding].role.is_valid(), "invalid account role");
                    assert!(bindings[binding].index <= 253, "invalid account index");
                    let mut previous = 0;
                    while previous < binding {
                        assert!(
                            !bindings[previous].role.same_as(bindings[binding].role),
                            "duplicate account role"
                        );
                        previous += 1;
                    }
                    binding += 1;
                }
                let id = programs[program][entry].id as usize;
                assert!(!used[id], "duplicate or retired CPI ID");
                used[id] = true;
                entry += 1;
            }
            program += 1;
        }
        Self { programs }
    }

    pub fn get(&self, id: u8) -> Option<&'static CpiEntry> {
        self.programs
            .iter()
            .flat_map(|entries| entries.iter())
            .find(|entry| entry.id == id)
    }
}
