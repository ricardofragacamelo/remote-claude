/**
 * `value` as a non-blank string, or `null` — the one way this backend reads an optional text field
 * out of a parsed JSON document it does not fully trust (a plugin's own manifest, a marketplace's).
 */
export function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
