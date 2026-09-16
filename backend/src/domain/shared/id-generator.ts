/**
 * Where identity comes from.
 *
 * Same reason as `Clock`: `crypto.randomUUID()` inside a rule makes the rule non-deterministic,
 * and the test has to assert on whatever it produced instead of on a value it chose.
 */
export interface IdGenerator {
  next(): string;
}
