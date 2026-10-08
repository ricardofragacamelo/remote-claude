/**
 * Whether something read off an input the domain does not control — the SDK's, a client's — is an
 * object with fields to read.
 *
 * Arrays and `null` are excluded: `typeof` calls both objects, and a reader that walked either as a
 * record would find no fields where it expected some instead of noticing it had the wrong thing.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return !Array.isArray(value);
}
