import { describe, expect, it } from 'vitest';

import { widthGate } from '@/features/permission/lib/new-rule-width';
import type { RulePreview } from '@/features/permission/types/rule';

describe('widthGate — what a draft’s own width means for submitting it (D-09, S-189)', () => {
  it('blocks an unbounded allow, never acknowledged away', () => {
    expect(widthGate('allow', 'unbounded', false)).toEqual({
      blocked: true,
      needsAcknowledge: false,
    });
    expect(widthGate('allow', 'unbounded', true)).toEqual({
      blocked: true,
      needsAcknowledge: false,
    });
  });

  it('accepts an unbounded deny — the width the server itself refuses only for allow', () => {
    expect(widthGate('deny', 'unbounded', false)).toEqual({
      blocked: false,
      needsAcknowledge: false,
    });
  });

  it('needs the checkbox for a broad width, either decision, until it is checked', () => {
    expect(widthGate('allow', 'broad', false)).toEqual({
      blocked: false,
      needsAcknowledge: true,
    });
    expect(widthGate('deny', 'broad', false)).toEqual({
      blocked: false,
      needsAcknowledge: true,
    });
  });

  it('clears a broad width once acknowledged, either decision', () => {
    expect(widthGate('allow', 'broad', true)).toEqual({
      blocked: false,
      needsAcknowledge: false,
    });
    expect(widthGate('deny', 'broad', true)).toEqual({
      blocked: false,
      needsAcknowledge: false,
    });
  });

  it('never blocks or asks anything of a narrow width, whatever the decision or the checkbox', () => {
    const breadths: readonly RulePreview['breadth'][] = ['narrow'];
    for (const breadth of breadths) {
      for (const decision of ['allow', 'deny'] as const) {
        for (const acknowledgeBroad of [true, false]) {
          expect(widthGate(decision, breadth, acknowledgeBroad)).toEqual({
            blocked: false,
            needsAcknowledge: false,
          });
        }
      }
    }
  });
});
