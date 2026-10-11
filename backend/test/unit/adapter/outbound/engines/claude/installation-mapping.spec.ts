import { describe, expect, it } from 'vitest';
import type {
  McpServerStatus,
  ModelInfo,
  SDKControlGetContextUsageResponse,
} from '@anthropic-ai/claude-agent-sdk';

import {
  toContextUse,
  toInstallationModel,
  toMcpServer,
} from '@adapter/outbound/engines/claude/installation-mapping';

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

  it('keeps name, status and the count of tools of a server — never its config nor its error — S-177', () => {
    const server = toMcpServer({
      name: 'docs',
      status: 'exploded',
      error: 'token=secret',
      config: { url: 'https://x?token=secret' },
    } as unknown as McpServerStatus);

    expect(server).toEqual({ name: 'docs', status: 'failed', toolCount: 0 });
    expect(
      toMcpServer({
        name: 'jira',
        status: 'needs-auth',
        tools: [{ name: 'search' }, { name: 'create' }],
      } as unknown as McpServerStatus),
    ).toEqual({ name: 'jira', status: 'needs-auth', toolCount: 2 });
  });
});
