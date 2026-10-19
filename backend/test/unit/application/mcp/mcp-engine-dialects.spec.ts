import { describe, expect, it } from 'vitest';

import { McpEngineDialects } from '@application/mcp';
import type { McpEngineDialect } from '@domain/mcp';

const CLAUDE_DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: (name) => (name.includes('__') ? 'nameAmbiguousForEngine' : null),
  reservedEnvNames: ['CLAUDE_CONFIG_DIR'],
};

describe('McpEngineDialects — plan 13, B-18', () => {
  it('returns the dialect registered for an engine', () => {
    const dialects = new McpEngineDialects([CLAUDE_DIALECT]);
    expect(dialects.for('claude')).toBe(CLAUDE_DIALECT);
  });

  it('returns a dialect with no extra rule for an engine that registered none', () => {
    const dialects = new McpEngineDialects([]);
    const dialect = dialects.for('some-other-engine');
    expect(dialect.rejectsServerName('anything__weird')).toBeNull();
    expect(dialect.reservedEnvNames).toEqual([]);
  });
});
