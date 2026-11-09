/** The five `audit_events` kinds a rule's own history is made of (plan 15, B-07, B-12, B-18) —
 * `restore` is a fresh `ruleGranted` with `restoredFrom` in its own details, never a kind of its
 * own. A kind this build does not recognise falls back to its own generic label. */
const HISTORY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'permission.ruleGranted': 'permission.ruleHistory.granted',
  'permission.ruleRevoked': 'permission.ruleHistory.revoked',
  'permission.ruleExpiryChanged': 'permission.ruleHistory.expiryChanged',
  'permission.rulesExported': 'permission.ruleHistory.exported',
  'permission.rulesImported': 'permission.ruleHistory.imported',
};

/** The key a história event's own kind reads by — a generic one for a kind this build does not know. */
export function ruleHistoryLabelKey(kind: string): string {
  return HISTORY_LABEL_KEYS[kind] ?? 'permission.ruleHistory.other';
}
