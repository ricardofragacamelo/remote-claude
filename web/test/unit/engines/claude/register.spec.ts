import { describe, expect, it } from 'vitest';

import { commandHosts } from '@/app/command-hosts';
import { globalNavigation } from '@/app/global-navigation';
import {
  agentSettingsSections,
  agentSettingsShortcuts,
  defaultsExtraFields,
} from '@/features/agent-settings';
import { sensitiveFiles } from '@/shared/lib/sensitive-files';
import '@/engines/claude/register';
import { registerClaudeEngine, unregisterClaudeEngine } from '@/engines/claude/register';

describe('the Claude engine in the places of the core — plan 28, B-36, B-38', () => {
  it('fills every section of the engine settings screen, each its own', () => {
    const ids = agentSettingsSections
      .entries()
      .filter((entry) => entry.engine === 'claude')
      .map((entry) => entry.id);

    expect(ids).toEqual(['account', 'installation', 'plugins', 'skills', 'project']);
  });

  it('adds the output style to the core’s defaults form', () => {
    expect(defaultsExtraFields.entries().map((entry) => entry.id)).toContain('claude.outputStyle');
  });

  it('takes its place in the global navigation, under a prefix the app’s own Settings does not own', () => {
    const entry = globalNavigation.entries().find((each) => each.id === 'claude');

    expect(entry?.sections).toEqual(['settings/agents']);
    expect(entry?.href({ workbenchFolder: null })).toBe('/settings/agents/claude');
  });

  it('mounts a host for its own shortcuts', () => {
    expect(commandHosts.entries().map((entry) => entry.id)).toContain('claude');
  });

  it('declares the three files of its own that change what the agent may do', () => {
    expect(sensitiveFiles.entries().map((entry) => entry.path)).toEqual([
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.mcp.json',
    ]);
  });

  it('points the screen’s shortcuts at the renamed commands', () => {
    const shortcuts = agentSettingsShortcuts
      .entries()
      .filter((entry) => entry.engine === 'claude')
      .map((entry) => entry.commandId);

    expect(shortcuts).toEqual([
      'agent.defaultModel',
      'agent.testConnection',
      'agent.openMemory',
      'agent.newCommand',
      'agent.newSubagent',
    ]);
  });

  it('refuses a second registration, and is taken back out whole', () => {
    expect(() => registerClaudeEngine()).toThrow(/already registered/);

    unregisterClaudeEngine();
    expect(agentSettingsSections.entries().filter((entry) => entry.engine === 'claude')).toEqual(
      [],
    );
    expect(globalNavigation.entries().map((entry) => entry.id)).not.toContain('claude');
    expect(commandHosts.entries()).toEqual([]);
    expect(sensitiveFiles.entries()).toEqual([]);

    registerClaudeEngine();
    expect(commandHosts.entries().map((entry) => entry.id)).toContain('claude');
  });
});
