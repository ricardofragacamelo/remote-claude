import { describe, expect, it } from 'vitest';

import { describePlugin } from '@domain/engines/claude';
import type { PluginIdentity, PluginManifest } from '@domain/engines/claude';

const IDENTITY: PluginIdentity = {
  origin: 'local',
  path: '/srv/projects/my-plugin',
  marketplace: null,
  commit: null,
};

const MANIFEST: PluginManifest = {
  name: 'my-plugin',
  description: 'desc',
  version: '1.0.0',
  commands: ['deploy'],
  agents: [],
  hookCount: 0,
  skills: ['explain', 'summarize'],
  mcpServers: [],
};

describe('describePlugin — plan 13, B-27, S-125', () => {
  it('describes a local plugin with no hooks or MCP servers', () => {
    const description = describePlugin(IDENTITY, MANIFEST);

    expect(description.messageKey).toBe('engines.claude.plugin.descriptionLocal');
    expect(description.params).toEqual({
      name: 'my-plugin',
      path: IDENTITY.path,
      commandCount: 1,
      commandNames: 'deploy',
      agentCount: 0,
      agentNames: '',
      hasHooks: false,
      hookCount: 0,
      skillCount: 2,
      skillNames: 'explain, summarize',
      mcpServerCount: 0,
      mcpServerNames: '',
    });
  });

  it('is the same description given the same inputs again — the preview and the write never diverge', () => {
    expect(describePlugin(IDENTITY, MANIFEST)).toEqual(describePlugin(IDENTITY, MANIFEST));
  });

  it('says hasHooks when the manifest declares at least one', () => {
    const description = describePlugin(IDENTITY, { ...MANIFEST, hookCount: 3 });
    expect(description.params['hasHooks']).toBe(true);
    expect(description.params['hookCount']).toBe(3);
  });
});
