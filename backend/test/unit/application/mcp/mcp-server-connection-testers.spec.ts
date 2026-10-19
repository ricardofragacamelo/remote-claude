import { describe, expect, it } from 'vitest';

import { McpServerConnectionTesters } from '@application/mcp';
import type { McpServerConnectionTester } from '@application/mcp';

const STUB: McpServerConnectionTester = {
  test: () => Promise.resolve({ status: 'connected', tools: [], error: null }),
};

describe('McpServerConnectionTesters — plan 13, B-25', () => {
  it('answers the tester of an engine it holds one for', () => {
    const testers = new McpServerConnectionTesters([{ engine: 'claude', tester: STUB }]);

    expect(testers.for('claude')).toBe(STUB);
  });

  it('answers null for an engine it holds no tester for', () => {
    const testers = new McpServerConnectionTesters([]);

    expect(testers.for('codex')).toBeNull();
  });
});
