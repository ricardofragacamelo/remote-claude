import { describe, expect, it } from 'vitest';

import { patternsToConfirm, preselectedReach } from '@/features/permission/lib/reach';
import type { RuleReach } from '@/features/permission/types/permission';

const exact: RuleReach = { reach: 'exact', patterns: ['Edit(/a/b.ts)'] };
const prefix: RuleReach = { reach: 'prefix', patterns: ['Bash(git push:*)', 'Bash(tail:*)'] };
const tool: RuleReach = { reach: 'tool', patterns: ['WebSearch'] };

describe('the reach a card starts on — plan 23, D-09', () => {
  it('starts on the prefix whenever there is one', () => {
    expect(preselectedReach([exact, prefix])).toBe(prefix);
  });

  it('starts on the exact input when there is no prefix — a file, a URL', () => {
    expect(preselectedReach([exact, { reach: 'tool', patterns: ['Edit'] }])).toBe(exact);
  });

  it('starts on the whole tool when it is the only reach', () => {
    expect(preselectedReach([tool])).toBe(tool);
  });

  it('starts on nothing when there is nothing to reach', () => {
    expect(preselectedReach([])).toBeNull();
  });
});

describe('what the second step says it will leave', () => {
  it('lists every pattern of the reach chosen', () => {
    expect(patternsToConfirm(prefix)).toEqual(['Bash(git push:*)', 'Bash(tail:*)']);
  });

  it('lists nothing when no reach was chosen', () => {
    expect(patternsToConfirm(null)).toEqual([]);
  });
});
