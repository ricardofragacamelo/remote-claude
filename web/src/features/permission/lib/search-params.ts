/** A non-blank string from the URL's own search — `undefined` for anything else, trimmed.
 * Shared by every one of this feature's own search validators (`rules-search.ts`,
 * `new-rule-search.ts`): the search is untrusted data, read field by field, never thrown on. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** One of `allowed`, read from the URL's own search — `undefined` for anything else. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
