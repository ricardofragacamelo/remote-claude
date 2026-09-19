/**
 * How dangerous an invocation looks, for the UI to decide what to emphasise.
 *
 * Derived in the backend and never in a client: two ends that classify independently are two ends
 * that eventually disagree, and the one that matters is whichever the person happened to be
 * holding. See docs/architecture/backend/03-modules.md#permission.
 */
export const RISK_HINTS = ['read', 'write', 'destructive'] as const;

export type RiskHint = (typeof RISK_HINTS)[number];
