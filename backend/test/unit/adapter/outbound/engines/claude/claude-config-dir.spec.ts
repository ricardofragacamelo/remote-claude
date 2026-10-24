import { describe, expect, it } from 'vitest';

import { effectiveClaudeConfigDir } from '@adapter/outbound/engines/claude/claude-config-dir';

describe('effectiveClaudeConfigDir — plan 13, B-11, B-35', () => {
  it('falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset', () => {
    const result = effectiveClaudeConfigDir({}, () => '/home/me');
    expect(result).toEqual({ path: '/home/me/.claude', fromEnvironment: false });
  });

  it('falls back to ~/.claude when CLAUDE_CONFIG_DIR is only whitespace', () => {
    const result = effectiveClaudeConfigDir({ CLAUDE_CONFIG_DIR: '   ' }, () => '/home/me');
    expect(result).toEqual({ path: '/home/me/.claude', fromEnvironment: false });
  });

  it('uses CLAUDE_CONFIG_DIR when it names one', () => {
    const result = effectiveClaudeConfigDir(
      { CLAUDE_CONFIG_DIR: '/custom/claude' },
      () => '/home/me',
    );
    expect(result).toEqual({ path: '/custom/claude', fromEnvironment: true });
  });
});
