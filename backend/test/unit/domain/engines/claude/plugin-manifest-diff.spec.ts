import { describe, expect, it } from 'vitest';

import { diffPluginManifests } from '@domain/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';

const BASE: PluginManifest = {
  name: 'my-plugin',
  description: null,
  version: '1.0.0',
  commands: ['deploy'],
  agents: ['reviewer'],
  hookCount: 0,
  skills: ['explain'],
  mcpServers: [
    { name: 'docs', transport: 'stdio', command: 'npx', args: [], url: null, env: [], headers: [] },
  ],
};

describe('diffPluginManifests — plan 13, B-47, S-205', () => {
  it('finds nothing added or removed between two identical manifests', () => {
    const diff = diffPluginManifests(BASE, BASE);

    expect(diff).toEqual({
      commandsAdded: [],
      commandsRemoved: [],
      agentsAdded: [],
      agentsRemoved: [],
      skillsAdded: [],
      skillsRemoved: [],
      mcpServersAdded: [],
      mcpServersRemoved: [],
      hookCountBefore: 0,
      hookCountAfter: 0,
    });
  });

  it('finds a command, an agent, a skill and an MCP server added', () => {
    const after: PluginManifest = {
      ...BASE,
      commands: ['deploy', 'rollback'],
      agents: ['reviewer', 'planner'],
      skills: ['explain', 'summarize'],
      mcpServers: [...BASE.mcpServers, { ...BASE.mcpServers[0]!, name: 'search' }],
    };

    const diff = diffPluginManifests(BASE, after);

    expect(diff.commandsAdded).toEqual(['rollback']);
    expect(diff.agentsAdded).toEqual(['planner']);
    expect(diff.skillsAdded).toEqual(['summarize']);
    expect(diff.mcpServersAdded).toEqual(['search']);
    expect(diff.commandsRemoved).toEqual([]);
  });

  it('finds a command and an MCP server removed', () => {
    const after: PluginManifest = { ...BASE, commands: [], mcpServers: [] };

    const diff = diffPluginManifests(BASE, after);

    expect(diff.commandsRemoved).toEqual(['deploy']);
    expect(diff.mcpServersRemoved).toEqual(['docs']);
  });

  it('reports the hook count on each side, even when both are zero', () => {
    const after: PluginManifest = { ...BASE, hookCount: 2 };

    expect(diffPluginManifests(BASE, after)).toMatchObject({
      hookCountBefore: 0,
      hookCountAfter: 2,
    });
  });

  it('sorts names, so the diff does not depend on manifest order', () => {
    const after: PluginManifest = { ...BASE, commands: ['zeta', 'alpha', 'deploy'] };

    expect(diffPluginManifests(BASE, after).commandsAdded).toEqual(['alpha', 'zeta']);
  });
});
