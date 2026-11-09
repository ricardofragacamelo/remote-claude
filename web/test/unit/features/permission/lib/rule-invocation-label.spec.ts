import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { AuditTrailEntry } from '@remote-claude/contracts';

import { createI18n } from '@/shared/i18n';
import { ruleInvocationLabel } from '@/features/permission/lib/rule-invocation-label';

const en = createI18n('en').t as TFunction;

function anInvocation(overrides: Partial<AuditTrailEntry> = {}): AuditTrailEntry {
  return {
    id: 'entry-1',
    sessionId: 'session-1',
    toolUseId: 'tool-1',
    toolName: 'Bash',
    kind: 'shell',
    input: {},
    decision: 'allowed',
    at: '2026-09-24T10:00:00.000Z',
    traceId: null,
    verdict: null,
    ...overrides,
  };
}

describe('what one invocation row says', () => {
  it('names the kind and when it happened', () => {
    const text = ruleInvocationLabel(anInvocation(), 'en', en);

    expect(text).toContain('Shell');
    expect(text).toContain('Sep 24, 2026');
  });

  it('falls back to the generic kind line for a kind this build has no short name for', () => {
    const text = ruleInvocationLabel(anInvocation({ kind: 'something.unknown' }), 'en', en);

    expect(text).not.toContain('Shell');
  });
});
