import { describe, expect, it } from 'vitest';

import {
  installMarketplacePluginSchema,
  localPluginPathSchema,
  setPluginEnabledSchema,
  toMarketplaceCatalogDto,
  toMarketplaceListDto,
  toPluginDto,
  toPluginListDto,
  toPluginPreviewDto,
  toUpdatePreviewDto,
} from '@adapter/inbound/http/engines/claude/plugins.dto';
import type {
  LocalPluginPreview,
  MarketplacePluginUpdateCheck,
  PluginView,
} from '@application/engines/claude';
import type {
  MarketplaceManifest,
  PluginManifest,
  PluginManifestDiff,
} from '@domain/engines/claude';
import { UserId } from '@domain/auth';

const MANIFEST: PluginManifest = {
  name: 'my-plugin',
  description: 'desc',
  version: '1.0.0',
  commands: ['deploy'],
  agents: [],
  hookCount: 1,
  skills: ['explain'],
  mcpServers: [
    { name: 'docs', transport: 'stdio', command: 'npx', args: [], url: null, env: [], headers: [] },
  ],
};

const VIEW: PluginView = {
  id: 'p1',
  userId: UserId.create('auth|dto'),
  origin: 'local',
  path: '/srv/projects/my-plugin',
  marketplace: null,
  commit: null,
  name: 'my-plugin',
  approvedDigest: 'abc',
  enabled: true,
  state: 'current',
  manifest: MANIFEST,
  createdAt: new Date('2026-10-20T12:00:00Z'),
  updatedAt: new Date('2026-10-20T12:00:00Z'),
};

describe('plugins.dto — plan 13, B-27', () => {
  it('maps a plugin view to the wire shape, with the manifest’s MCP servers reduced to names', () => {
    const dto = toPluginDto(VIEW);

    expect(dto).toEqual({
      id: 'p1',
      origin: 'local',
      path: '/srv/projects/my-plugin',
      marketplace: null,
      commit: null,
      name: 'my-plugin',
      state: 'current',
      enabled: true,
      manifest: {
        name: 'my-plugin',
        description: 'desc',
        version: '1.0.0',
        commands: ['deploy'],
        agents: [],
        hookCount: 1,
        skills: ['explain'],
        mcpServerNames: ['docs'],
      },
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    });
  });

  it('maps a null manifest through as null — unreadable state', () => {
    const dto = toPluginDto({ ...VIEW, state: 'unreadable', manifest: null });
    expect(dto.manifest).toBeNull();
  });

  it('maps a list of plugins', () => {
    expect(toPluginListDto([VIEW])).toEqual({ plugins: [toPluginDto(VIEW)] });
  });

  it('maps a preview, stringifying every param — including a boolean', () => {
    const preview: LocalPluginPreview = {
      manifest: MANIFEST,
      description: {
        messageKey: 'engines.claude.plugin.descriptionLocal',
        params: { hasHooks: true, commandCount: 1 },
      },
    };

    const dto = toPluginPreviewDto(preview);

    expect(dto.messageKey).toBe('engines.claude.plugin.descriptionLocal');
    expect(dto.params).toEqual({ hasHooks: 'true', commandCount: '1' });
    expect(dto.manifest.mcpServerNames).toEqual(['docs']);
  });

  it('validates a local plugin path body', () => {
    expect(localPluginPathSchema.safeParse({ path: '/srv/projects/my-plugin' }).success).toBe(true);
    expect(localPluginPathSchema.safeParse({}).success).toBe(false);
    expect(localPluginPathSchema.safeParse({ path: '' }).success).toBe(false);
  });

  it('validates a set-enabled body', () => {
    expect(setPluginEnabledSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(setPluginEnabledSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });

  it('maps a marketplace plugin view with its commit, not a path the screen needs', () => {
    const view: PluginView = {
      ...VIEW,
      origin: 'marketplace',
      path: '/srv/plugin-downloads/u1/acme/my-plugin',
      marketplace: 'acme',
      commit: 'abcdef0123456789',
    };

    expect(toPluginDto(view)).toMatchObject({
      origin: 'marketplace',
      marketplace: 'acme',
      commit: 'abcdef0123456789',
    });
  });

  it('validates an install-from-marketplace body', () => {
    expect(
      installMarketplacePluginSchema.safeParse({ marketplace: 'acme', plugin: 'my-plugin' })
        .success,
    ).toBe(true);
    expect(installMarketplacePluginSchema.safeParse({ marketplace: 'acme' }).success).toBe(false);
    expect(installMarketplacePluginSchema.safeParse({ marketplace: '', plugin: 'x' }).success).toBe(
      false,
    );
  });

  it('maps the declared marketplaces, by name only', () => {
    expect(toMarketplaceListDto([{ name: 'acme' }, { name: 'other' }])).toEqual({
      marketplaces: [{ name: 'acme' }, { name: 'other' }],
    });
  });

  it('maps a marketplace catalogue, with supported carried through per plugin', () => {
    const manifest: MarketplaceManifest = {
      name: 'acme',
      plugins: [
        { name: 'one', description: 'first', supported: true },
        { name: 'two', description: null, supported: false },
      ],
    };

    expect(toMarketplaceCatalogDto(manifest)).toEqual({
      name: 'acme',
      plugins: [
        { name: 'one', description: 'first', supported: true },
        { name: 'two', description: null, supported: false },
      ],
    });
  });

  it('maps an update preview with no update available', () => {
    const check: MarketplacePluginUpdateCheck = { available: false, newCommit: null, diff: null };
    expect(toUpdatePreviewDto(check)).toEqual({ available: false, newCommit: null, diff: null });
  });

  it('maps an update preview with a diff, as plain arrays', () => {
    const diff: PluginManifestDiff = {
      commandsAdded: ['rollback'],
      commandsRemoved: [],
      agentsAdded: [],
      agentsRemoved: ['reviewer'],
      skillsAdded: [],
      skillsRemoved: [],
      mcpServersAdded: [],
      mcpServersRemoved: [],
      hookCountBefore: 0,
      hookCountAfter: 1,
    };
    const check: MarketplacePluginUpdateCheck = { available: true, newCommit: 'deadbeef', diff };

    expect(toUpdatePreviewDto(check)).toEqual({
      available: true,
      newCommit: 'deadbeef',
      diff: {
        commandsAdded: ['rollback'],
        commandsRemoved: [],
        agentsAdded: [],
        agentsRemoved: ['reviewer'],
        skillsAdded: [],
        skillsRemoved: [],
        mcpServersAdded: [],
        mcpServersRemoved: [],
        hookCountBefore: 0,
        hookCountAfter: 1,
      },
    });
  });
});
