/**
 * Where time comes from.
 *
 * The domain never calls `new Date()`: a rule that reads the wall clock is a rule that cannot be
 * tested at a chosen instant. See docs/architecture/backend/07-testing.md.
 */
export interface Clock {
  now(): Date;
}
