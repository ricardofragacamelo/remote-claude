import { describe, expect, it } from 'vitest';

import { ruleHistoryLabelKey } from '@/features/permission/lib/rule-history-label';

describe('the label key a história event reads by', () => {
  it('names each of the five kinds a rule’s own history is made of', () => {
    expect(ruleHistoryLabelKey('permission.ruleGranted')).toBe('permission.ruleHistory.granted');
    expect(ruleHistoryLabelKey('permission.ruleRevoked')).toBe('permission.ruleHistory.revoked');
    expect(ruleHistoryLabelKey('permission.ruleExpiryChanged')).toBe(
      'permission.ruleHistory.expiryChanged',
    );
    expect(ruleHistoryLabelKey('permission.rulesExported')).toBe('permission.ruleHistory.exported');
    expect(ruleHistoryLabelKey('permission.rulesImported')).toBe('permission.ruleHistory.imported');
  });

  it('falls back to the generic label for a kind this build does not know', () => {
    expect(ruleHistoryLabelKey('permission.somethingNew')).toBe('permission.ruleHistory.other');
  });
});
