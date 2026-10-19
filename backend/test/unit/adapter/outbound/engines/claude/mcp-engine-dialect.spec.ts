import { describe, expect, it } from 'vitest';

import { claudeMcpEngineDialect } from '@adapter/outbound/engines/claude/mcp-engine-dialect';

describe('claudeMcpEngineDialect — plan 13, B-18', () => {
  it('refuses a name with __, which is ambiguous for mcp__<server>__<tool>', () => {
    expect(claudeMcpEngineDialect.rejectsServerName('github__helper')).toBe(
      'nameAmbiguousForEngine',
    );
  });

  it('accepts a plain name', () => {
    expect(claudeMcpEngineDialect.rejectsServerName('github')).toBeNull();
  });

  it('reserves CLAUDE_CONFIG_DIR', () => {
    expect(claudeMcpEngineDialect.reservedEnvNames).toEqual(['CLAUDE_CONFIG_DIR']);
  });
});
