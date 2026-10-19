import { describe, expect, it } from 'vitest';
import type {
  McpServerStatus,
  ModelInfo,
  SDKControlGetContextUsageResponse,
} from '@anthropic-ai/claude-agent-sdk';

import {
  redactMcpServerError,
  toContextUse,
  toInstallationModel,
  toMcpServer,
} from '@adapter/outbound/engines/claude/installation-mapping';
import { SESSION_MCP_STATUS_CHANGED_PAYLOAD_SERVERS_ITEM_LIMITS as MCP_ERROR_LIMITS } from '@remote-claude/contracts';

/** What the SDK says of the installation → what the panel is told — plan 08, B-36…B-38. */
describe('the installation, as the panel reads it', () => {
  it('keeps the levels of effort this build knows, and none for a model that takes no effort — S-171', () => {
    const opus = toInstallationModel({
      value: 'opus',
      resolvedModel: 'claude-opus-5',
      displayName: 'Opus',
      description: 'Most capable',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'ludicrous', 'high'],
    } as unknown as ModelInfo);
    const haiku = toInstallationModel({
      value: 'haiku',
      displayName: 'Haiku',
      description: 'Fastest',
      supportedEffortLevels: ['low'],
    } as unknown as ModelInfo);

    expect(opus).toEqual({
      value: 'opus',
      resolvedModel: 'claude-opus-5',
      displayName: 'Opus',
      description: 'Most capable',
      supportedEffortLevels: ['low', 'high'],
    });
    expect(haiku).toMatchObject({
      resolvedModel: null,
      supportedEffortLevels: [],
    });
    expect(
      toInstallationModel({
        value: 'sonnet',
        displayName: 'Sonnet',
        description: '',
        supportsEffort: true,
      } as unknown as ModelInfo),
    ).toMatchObject({ supportedEffortLevels: [] });
  });

  it('reads a category of a kind it does not know as used — S-173', () => {
    const use = toContextUse({
      model: 'claude-opus-5',
      totalTokens: 10,
      maxTokens: 100,
      percentage: 10,
      categories: [
        { name: 'Messages', tokens: 8, color: 'blue', kind: 'used' },
        { name: 'Something new', tokens: 2, color: 'red', kind: 'novel' },
      ],
    } as unknown as SDKControlGetContextUsageResponse);

    expect(use.categories.map((category) => category.kind)).toEqual(['used', 'used']);
  });

  it('maps the categories Claude Code names to the canonical ones, and keeps the rest in its words — S-71', () => {
    const names = [
      'System prompt',
      'System tools',
      'Messages',
      'Memory files',
      'Free space',
      'Autocompact buffer',
      'MCP tools',
      'System tools (deferred)',
    ];
    const use = toContextUse({
      model: 'claude-opus-5',
      totalTokens: 10,
      maxTokens: 100,
      percentage: 12.6,
      categories: names.map((name) => ({ name, tokens: 1, color: 'blue', kind: 'used' })),
    } as unknown as SDKControlGetContextUsageResponse);

    expect(
      use.categories.map((category) => [category.id, category.messageKey, category.name]),
    ).toEqual([
      ['system', 'sessions.context.system', 'System prompt'],
      ['tools', 'sessions.context.tools', 'System tools'],
      ['messages', 'sessions.context.messages', 'Messages'],
      ['memory', 'sessions.context.memory', 'Memory files'],
      ['free', 'sessions.context.free', 'Free space'],
      ['reserved', 'sessions.context.reserved', 'Autocompact buffer'],
      ['mcpTools', null, 'MCP tools'],
      ['systemToolsDeferred', null, 'System tools (deferred)'],
    ]);
    // The percentage as the engine says it: rounding is the edge's (the HTTP route).
    expect(use.percentage).toBe(12.6);
  });

  it('keeps name, status and the count of tools of a server — never its config — S-177', () => {
    const server = toMcpServer({
      name: 'docs',
      status: 'exploded',
      source: 'dynamic',
      config: { url: 'https://x?token=secret' },
    } as unknown as McpServerStatus);

    expect(server).toEqual({ name: 'docs', status: 'failed', source: 'ours', toolCount: 0 });
    expect(
      toMcpServer({
        name: 'jira',
        status: 'needs-auth',
        source: 'plugin',
        tools: [{ name: 'search' }, { name: 'create' }],
      } as unknown as McpServerStatus),
    ).toEqual({ name: 'jira', status: 'needs-auth', source: 'plugin', toolCount: 2 });
  });

  it('an unrecognised source is never promoted to ours — B-22, S-93', () => {
    expect(
      toMcpServer({
        name: 'docs',
        status: 'connected',
        source: 'sdk',
      } as unknown as McpServerStatus).source,
    ).toBe('other');
    expect(
      toMcpServer({
        name: 'docs',
        status: 'connected',
        source: 'user',
      } as unknown as McpServerStatus).source,
    ).toBe('other');
    expect(
      toMcpServer({ name: 'docs', status: 'connected' } as unknown as McpServerStatus).source,
    ).toBe('other');
  });

  it('carries a failed server’s error, redacted — never when it is not failed — B-22, S-96', () => {
    const failed = toMcpServer({
      name: 'docs',
      status: 'failed',
      source: 'dynamic',
      error: 'fetch https://x.example/hook?token=abc123 failed',
    } as unknown as McpServerStatus);
    expect(failed.error).toBe('fetch https://x.example/hook failed');

    const connected = toMcpServer({
      name: 'docs',
      status: 'connected',
      source: 'dynamic',
      error: 'this should never be reachable, but if it is, never surfaced',
    } as unknown as McpServerStatus);
    expect(connected).not.toHaveProperty('error');
  });
});

describe('redactMcpServerError — plan 13, B-22, S-96', () => {
  it('strips the query string and fragment of a URL, keeping the base', () => {
    expect(redactMcpServerError('GET https://mcp.example.com/webhook?token=abc123 → 401')).toBe(
      'GET https://mcp.example.com/webhook → 401',
    );
    expect(redactMcpServerError('see https://mcp.example.com/docs#section-token')).toBe(
      'see https://mcp.example.com/docs',
    );
  });

  it('redacts a bearer or authorization token, keeping the scheme word', () => {
    expect(redactMcpServerError('rejected: Bearer sk-abc123')).toBe('rejected: Bearer [REDACTED]');
    expect(redactMcpServerError('Authorization: sk-abc123 was invalid')).toBe(
      'Authorization: [REDACTED] was invalid',
    );
  });

  it('leaves a plain message exactly as it is — nothing to redact', () => {
    expect(redactMcpServerError('spawn ENOENT')).toBe('spawn ENOENT');
  });

  it('truncates to the contract’s own bound, after redaction', () => {
    const long = `https://mcp.example.com/${'a'.repeat(600)}?token=abc123`;
    const redacted = redactMcpServerError(long);

    expect(redacted.length).toBe(MCP_ERROR_LIMITS.error.maxLength);
    expect(redacted.endsWith('…')).toBe(true);
  });
});
