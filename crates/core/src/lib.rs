//! Portable CPI dispatch primitives. Integrations depend on this crate; the core
//! does not depend on any integration or application framework.
pub mod args;
#[cfg(feature = "registry-export")]
pub mod export;
pub mod invoke;
pub mod refs;
pub mod registry;
pub mod traits;
pub mod validate;
pub use refs::{invoke_cpi, CpiDispatcher, CpiMapping, CpiRefs, CpiRefsView, InstructionRefs};
pub use registry::{CpiCategory, CpiEntry, CpiRegistry};
pub use traits::{AmountArgs, U64AmountArgs};
