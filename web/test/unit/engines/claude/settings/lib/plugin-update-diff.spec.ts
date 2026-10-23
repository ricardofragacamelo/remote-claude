import { describe, expect, it } from 'vitest';

import { pluginUpdateDiffHunks } from '@/engines/claude/settings/lib/plugin-update-diff';
import type { PluginManifestDiffView } from '@/engines/claude/settings/types/plugin';

const EMPTY: PluginManifestDiffView = {
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
};

function linesOf(diff: PluginManifestDiffView): readonly string[] {
  return pluginUpdateDiffHunks(diff)[0]?.lines.map((line) => line.text) ?? [];
}

describe('pluginUpdateDiffHunks — plan 13, B-47, B-29, S-205', () => {
  it('always has exactly one hunk', () => {
    expect(pluginUpdateDiffHunks(EMPTY)).toHaveLength(1);
  });

  it('shows nothing for a category with no change', () => {
    expect(linesOf(EMPTY)).not.toContain('commands:');
    expect(linesOf(EMPTY)).not.toContain('agents:');
    expect(linesOf(EMPTY)).not.toContain('skills:');
    expect(linesOf(EMPTY)).not.toContain('MCP servers:');
  });

  it('lists an added command as an added line, under its own category', () => {
    const diff: PluginManifestDiffView = { ...EMPTY, commandsAdded: ['new-command'] };
    const hunk = pluginUpdateDiffHunks(diff)[0];

    expect(hunk?.lines).toContainEqual({ kind: 'context', text: 'commands:' });
    expect(hunk?.lines).toContainEqual({ kind: 'added', text: '  new-command' });
  });

  it('lists a removed agent as a removed line', () => {
    const diff: PluginManifestDiffView = { ...EMPTY, agentsRemoved: ['old-agent'] };
    const hunk = pluginUpdateDiffHunks(diff)[0];

    expect(hunk?.lines).toContainEqual({ kind: 'removed', text: '  old-agent' });
  });

  it('lists skills and MCP servers added or removed, each under its own category', () => {
    const diff: PluginManifestDiffView = {
      ...EMPTY,
      skillsAdded: ['new-skill'],
      mcpServersRemoved: ['old-server'],
    };
    const hunk = pluginUpdateDiffHunks(diff)[0];

    expect(hunk?.lines).toContainEqual({ kind: 'added', text: '  new-skill' });
    expect(hunk?.lines).toContainEqual({ kind: 'removed', text: '  old-server' });
  });

  it('always shows the hook count before and after, as context', () => {
    const diff: PluginManifestDiffView = { ...EMPTY, hookCountBefore: 1, hookCountAfter: 3 };
    expect(linesOf(diff)).toContain('hooks: 1 → 3');
  });
});
