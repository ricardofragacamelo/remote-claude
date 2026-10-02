import { describe, expect, it } from 'vitest';

import { isSensitive, SENSITIVE_FILES, touchesSensitive } from '@domain/files';

describe('the files that change what Claude may do — D-15', () => {
  it('are the project settings and the MCP servers, by their path in the open folder', () => {
    expect(SENSITIVE_FILES).toEqual([
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.mcp.json',
    ]);
    expect(isSensitive('.claude/settings.json')).toBe(true);
    expect(isSensitive('sub/.claude/settings.json')).toBe(false);
    expect(isSensitive('.claude/agents/x.md')).toBe(false);
  });

  it('are reached by an operation on them, or on a folder that holds one', () => {
    expect(touchesSensitive('.mcp.json')).toBe(true);
    expect(touchesSensitive('.claude')).toBe(true);
    expect(touchesSensitive('.claude/agents')).toBe(false);
    expect(touchesSensitive('src')).toBe(false);
  });
});
