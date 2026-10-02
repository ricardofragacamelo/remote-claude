import { describe, expect, it } from 'vitest';

import { sensitiveSubject, touchesSensitive } from '@/shared/lib/sensitive-files';

describe('the files that change what Claude may do — plan 07, D-15', () => {
  it('are the domain’s three, each with what it controls', () => {
    expect(sensitiveSubject('.claude/settings.json')).toBe('claudeSettings');
    expect(sensitiveSubject('.claude/settings.local.json')).toBe('claudeLocalSettings');
    expect(sensitiveSubject('.mcp.json')).toBe('mcpServers');
    expect(sensitiveSubject('src/.mcp.json')).toBeNull();
    expect(sensitiveSubject('toString')).toBeNull();
  });

  it('are reached by an operation on them or on a folder that holds one', () => {
    expect(touchesSensitive('.claude')).toBe(true);
    expect(touchesSensitive('.mcp.json')).toBe(true);
    expect(touchesSensitive('.claude-old')).toBe(false);
  });
});
