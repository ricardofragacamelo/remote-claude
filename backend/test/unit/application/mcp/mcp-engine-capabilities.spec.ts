import { describe, expect, it } from 'vitest';

import { McpEngineCapabilities } from '@application/mcp';
import { McpEngineNotSupportedError } from '@domain/mcp';

describe('McpEngineCapabilities — plan 13, B-19', () => {
  it('lets through an engine that was registered', () => {
    const capabilities = new McpEngineCapabilities(['claude']);
    expect(() => capabilities.assertSupports('claude')).not.toThrow();
  });

  it('refuses an engine that was never registered', () => {
    const capabilities = new McpEngineCapabilities(['claude']);
    expect(() => capabilities.assertSupports('codex')).toThrow(McpEngineNotSupportedError);
  });

  it('lists every engine registered, in order', () => {
    const capabilities = new McpEngineCapabilities(['claude', 'codex']);
    expect(capabilities.supported).toEqual(['claude', 'codex']);
  });

  it('refuses every engine when none was registered', () => {
    const capabilities = new McpEngineCapabilities([]);
    expect(() => capabilities.assertSupports('claude')).toThrow(McpEngineNotSupportedError);
  });
});
