//! Sequential CPI args reader.
//!
//! `CpiArgsReader` is a cursor over a flat byte buffer that contains packed
//! args for every CPI in the instruction, in order.
//!
//! # Wire Format (per CPI slot)
//!
//! ```text
//! [len: u16 LE]
//!   • 0xFFFF → Skip (program must compute and provide args)
//!   • 0      → no instruction args (invoke with empty data)
//!   • N > 0  → N bytes of client-provided data follow
//! ```
//!
use solana_program_error::ProgramError;

/// Sentinel value indicating "program must provide args."
pub const SKIP_SENTINEL: u16 = 0xFFFF;

/// Result of reading one CPI args entry.
#[derive(Debug, PartialEq)]
pub enum CpiArgsEntry<'a> {
    /// Client provided args (may be empty for no-args instructions).
    Data(&'a [u8]),
    /// Program must compute and provide args (sentinel 0xFFFF).
    Skip,
}

/// Cursor-based reader for sequentially packed CPI args.
///
/// Created from the `args` field of `CpiRefs`.
/// Call [`next`](CpiArgsReader::next) once per CPI slot (in order).
pub struct CpiArgsReader<'a> {
    data: &'a [u8],
    cursor: usize,
}

impl<'a> CpiArgsReader<'a> {
    /// Create a new reader over the raw args buffer.
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, cursor: 0 }
    }

    /// Read the next CPI args entry.
    ///
    /// Reads a **u16 LE** length prefix:
    /// - `0xFFFF` → `Skip` — program must provide args.
    /// - `0`      → `Data(&[])` — no instruction args, invoke with empty data.
    /// - `N`      → `Data(&[u8; N])` — N bytes of client-provided data.
    ///
    /// Returns `Err(InvalidArgument)` if the buffer is malformed / too short.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> Result<CpiArgsEntry<'a>, ProgramError> {
        // Read u16 LE length
        if self.cursor + 2 > self.data.len() {
            return Err(ProgramError::InvalidArgument);
        }
        let len_bytes: [u8; 2] = self.data[self.cursor..self.cursor + 2]
            .try_into()
            .map_err(|_| ProgramError::InvalidArgument)?;
        self.cursor += 2;
        let raw_len = u16::from_le_bytes(len_bytes);

        if raw_len == SKIP_SENTINEL {
            return Ok(CpiArgsEntry::Skip);
        }

        let len = raw_len as usize;

        if self.cursor + len > self.data.len() {
            return Err(ProgramError::InvalidArgument);
        }

        let args = &self.data[self.cursor..self.cursor + len];
        self.cursor += len;
        Ok(CpiArgsEntry::Data(args))
    }

    /// Returns `true` if all bytes have been consumed.
    pub fn is_empty(&self) -> bool {
        self.cursor >= self.data.len()
    }

    /// Returns the number of remaining unread bytes.
    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.cursor)
    }
}
