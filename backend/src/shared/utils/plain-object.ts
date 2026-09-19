/**
 * Whether a value is a plain object we can read fields off.
 *
 * `Date` is excluded on purpose, and it is not pedantry: the Agent SDK's messages carry instants,
 * `typeof new Date()` is `'object'`, and a mapper that walked one as a record would produce a
 * content block with no fields instead of noticing it had the wrong thing.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}
