import { describe, expect, it } from 'vitest';

import {
  localPluginPathSchema,
  setPluginEnabledSchema,
  toPluginDto,
  toPluginListDto,
  toPluginPreviewDto,
} from '@adapter/inbound/http/engines/claude/plugins.dto';
import type { LocalPluginPreview, PluginView } from '@application/engines/claude';
import type { PluginManifest } from '@domain/engines/claude';
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
});
