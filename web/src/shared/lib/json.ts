/**
 * Whether a value is a plain object, as a JSON payload carries one.
 *
 * Arrays are excluded deliberately: `typeof [] === 'object'` and a field the contract declares as
 * an object is not satisfied by a list. `null` too, for the same reason and the older one.
 *
 * It is shared because three different readers of the wire need it, and a second copy is the one
 * that eventually forgets the array.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A string field of a payload, or `null` when it is absent, empty or of another type.
 *
 * Empty reads as absent on purpose: a required field the server sent as `''` says as little as one
 * it did not send, and a screen that renders it shows a blank where an answer should be.
 */
export function readText(payload: Readonly<Record<string, unknown>>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
