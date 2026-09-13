//! CPI type sequence validation against registry categories.

use solana_program_error::ProgramError;

use crate::registry::{CpiCategory, CpiRegistry};

/// Validate categorized CPI types against an ordered allowlist.
///
/// Each `cpi_type` index is looked up in the CPI registry to obtain its
/// [`CpiCategory`]. Types with no category (`None`) are skipped. Every categorized
/// type must appear in `required_order`, every category in `required_order` must
/// appear at least once, and categorized entries must follow that order. Repeated
/// entries are allowed only while the validator remains on the same category.
///
/// If `expected_count` is `Some(n)`, every category in `required_order` must occur
/// exactly `n` times. If `maximum_count` is `Some(n)`, every required category
/// must occur between one and `n` times. The two count constraints are mutually
/// exclusive. Uncategorized types are not counted.
///
/// # Errors
///
/// Returns [`ProgramError::InvalidArgument`] if any required category is missing,
/// they appear out of order, or the count constraint is violated.
pub fn validate_cpi_types(
    registry: &CpiRegistry,
    cpi_types: &[u8],
    required_order: &[CpiCategory],
    expected_count: Option<usize>,
    maximum_count: Option<usize>,
) -> Result<(), ProgramError> {
    if expected_count.is_some() && maximum_count.is_some()
        || required_order.is_empty() && (expected_count.is_some() || maximum_count.is_some())
    {
        return Err(ProgramError::InvalidArgument);
    }
    if required_order
        .iter()
        .enumerate()
        .any(|(idx, category)| required_order[..idx].contains(category))
    {
        return Err(ProgramError::InvalidArgument);
    }

    let mut counts = vec![0usize; required_order.len()];
    let mut current_order_idx = 0usize;

    for &cpi_type in cpi_types {
        let entry = registry
            .get(cpi_type)
            .ok_or(ProgramError::InvalidArgument)?;
        if let Some(cat) = entry.category {
            let order_idx = required_order
                .iter()
                .position(|required| *required == cat)
                .ok_or(ProgramError::InvalidArgument)?;
            if order_idx < current_order_idx {
                return Err(ProgramError::InvalidArgument);
            }
            current_order_idx = order_idx;
            counts[order_idx] = counts[order_idx]
                .checked_add(1)
                .ok_or(ProgramError::InvalidArgument)?;
        }
    }

    if counts.contains(&0) {
        return Err(ProgramError::InvalidArgument);
    }

    if let Some(count) = expected_count {
        if counts.iter().any(|actual| *actual != count) {
            return Err(ProgramError::InvalidArgument);
        }
    }

    if let Some(maximum) = maximum_count {
        if counts.iter().any(|actual| *actual > maximum) {
            return Err(ProgramError::InvalidArgument);
        }
    }

    Ok(())
}
