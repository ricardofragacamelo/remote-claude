import { describe, expect, it } from 'vitest';

import { digestOfPluginManifest } from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';

const BASE: PluginManifest = {
  name: 'my-plugin',
  description: 'desc',
  version: '1.0.0',
  commands: ['deploy', 'rollback'],
  agents: ['reviewer'],
  hookCount: 2,
  skills: ['explain'],
  mcpServers: [
    {
      name: 'docs',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server'],
      url: null,
      env: [],
      headers: [],
    },
  ],
};

describe('digestOfPluginManifest — plan 13, B-27, S-128', () => {
  it('is the same manifest reordered, since nothing it declares actually changed', () => {
    const reordered: PluginManifest = {
      ...BASE,
      commands: [...BASE.commands].reverse(),
      agents: [...BASE.agents],
      skills: [...BASE.skills],
      mcpServers: [...BASE.mcpServers],
    };

    expect(digestOfPluginManifest(BASE)).toBe(digestOfPluginManifest(reordered));
  });

  it('differs when the name changes — a rename is a change', () => {
    expect(digestOfPluginManifest(BASE)).not.toBe(
      digestOfPluginManifest({ ...BASE, name: 'renamed' }),
    );
  });

  it('differs when a command is added', () => {
    expect(digestOfPluginManifest(BASE)).not.toBe(
      digestOfPluginManifest({ ...BASE, commands: [...BASE.commands, 'new-command'] }),
    );
  });

  it('differs when the hook count changes', () => {
    expect(digestOfPluginManifest(BASE)).not.toBe(
      digestOfPluginManifest({ ...BASE, hookCount: 0 }),
    );
  });

  it('differs when the MCP servers declared change', () => {
    expect(digestOfPluginManifest(BASE)).not.toBe(
      digestOfPluginManifest({ ...BASE, mcpServers: [] }),
    );
  });

  it('is the same with two MCP servers reordered — sorted by name before hashing', () => {
    const second = {
      name: 'cache',
      transport: 'stdio' as const,
      command: 'npx',
      args: [],
      url: null,
      env: [],
      headers: [],
    };
    const forward = { ...BASE, mcpServers: [...BASE.mcpServers, second] };
    const reversed = { ...BASE, mcpServers: [second, ...BASE.mcpServers] };

    expect(digestOfPluginManifest(forward)).toBe(digestOfPluginManifest(reversed));
  });
});
