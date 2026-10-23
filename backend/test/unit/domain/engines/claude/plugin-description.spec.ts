import { describe, expect, it } from 'vitest';

import { describePlugin, describePluginUpdate, diffPluginManifests } from '@domain/engines/claude';
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

  it('describes a marketplace plugin by its marketplace and commit, not its path — B-47', () => {
    const identity: PluginIdentity = {
      origin: 'marketplace',
      path: '/srv/plugins/u1/acme/my-plugin',
      marketplace: 'acme',
      commit: 'abcdef0123456789',
    };

    const description = describePlugin(identity, MANIFEST);

    expect(description.messageKey).toBe('engines.claude.plugin.descriptionMarketplace');
    expect(description.params['marketplace']).toBe('acme');
    expect(description.params['commit']).toBe('abcdef012345');
    expect(description.params['path']).toBeUndefined();
    expect(description.params['name']).toBe('my-plugin');
  });

  it('falls back to an empty marketplace name when the identity carries none — defensive branch', () => {
    const identity: PluginIdentity = {
      origin: 'marketplace',
      path: '/srv/plugins/u1/acme/my-plugin',
      marketplace: null,
      commit: 'abcdef0123456789',
    };

    expect(describePlugin(identity, MANIFEST).params['marketplace']).toBe('');
  });

  it('falls back to an empty commit when the identity carries none — defensive branch', () => {
    const identity: PluginIdentity = {
      origin: 'marketplace',
      path: '/srv/plugins/u1/acme/my-plugin',
      marketplace: 'acme',
      commit: null,
    };

    expect(describePlugin(identity, MANIFEST).params['commit']).toBe('');
  });

  it('names the MCP servers a manifest declares — B-47', () => {
    const manifest: PluginManifest = {
      ...MANIFEST,
      mcpServers: [
        {
          name: 'docs',
          transport: 'stdio',
          command: 'npx',
          args: [],
          url: null,
          env: [],
          headers: [],
        },
        {
          name: 'search',
          transport: 'stdio',
          command: 'npx',
          args: [],
          url: null,
          env: [],
          headers: [],
        },
      ],
    };

    const description = describePlugin(IDENTITY, manifest);

    expect(description.params['mcpServerCount']).toBe(2);
    expect(description.params['mcpServerNames']).toBe('docs, search');
  });
});

describe('describePluginUpdate — plan 13, B-47, S-205', () => {
  const before: PluginManifest = {
    ...MANIFEST,
    commands: ['deploy'],
    mcpServers: [],
  };
  const after: PluginManifest = {
    ...MANIFEST,
    commands: ['deploy', 'rollback'],
    skills: ['explain'],
    hookCount: 1,
  };

  it('names what the update adds and removes, from the two manifests', () => {
    const diff = diffPluginManifests(before, after);
    const description = describePluginUpdate(
      { marketplace: 'acme' },
      'my-plugin',
      'aaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbb',
      diff,
    );

    expect(description.messageKey).toBe('engines.claude.plugin.descriptionUpdate');
    expect(description.params).toMatchObject({
      name: 'my-plugin',
      marketplace: 'acme',
      fromCommit: 'aaaaaaaaaaaa',
      toCommit: 'bbbbbbbbbbbb',
      commandsAddedCount: 1,
      commandsAddedNames: 'rollback',
      skillsRemovedCount: 1,
      skillsRemovedNames: 'summarize',
      hookCountBefore: 0,
      hookCountAfter: 1,
    });
  });

  it('is the same description given the same inputs again', () => {
    const diff = diffPluginManifests(before, after);
    expect(describePluginUpdate({ marketplace: 'acme' }, 'my-plugin', 'a', 'b', diff)).toEqual(
      describePluginUpdate({ marketplace: 'acme' }, 'my-plugin', 'a', 'b', diff),
    );
  });

  it('falls back to an empty marketplace name when the identity carries none — defensive branch', () => {
    const diff = diffPluginManifests(before, after);
    expect(
      describePluginUpdate({ marketplace: null }, 'my-plugin', 'a', 'b', diff).params[
        'marketplace'
      ],
    ).toBe('');
  });
});
