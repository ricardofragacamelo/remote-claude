/**
 * The UTF-16 column a byte offset of a line really is, once decoded — what the editor of plan 07
 * already counts in. ripgrep's `--json` gives every submatch as a **byte** offset into the line's
 * UTF-8 bytes (measured): a line with any multibyte character — accented letters, emoji — would
 * otherwise highlight the wrong column (S-65).
 *
 * @param lineUtf8Bytes the line, encoded once by the caller and reused across every submatch of
 *   it — re-encoding per submatch would cost O(matches × line length) for nothing
 * @param byteOffset how far into those bytes the column is
 */
export function utf16ColumnOf(lineUtf8Bytes: Buffer, byteOffset: number): number {
  return lineUtf8Bytes.subarray(0, byteOffset).toString('utf8').length;
}
