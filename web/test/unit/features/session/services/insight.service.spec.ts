import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchContext,
  fetchMcpServers,
  fetchModels,
} from '@/features/session/services/insight.service';
import { api } from '@/shared/api/api';
import { SESSION } from '../../../../support/session-tools';

afterEach(() => {
  vi.restoreAllMocks();
});

const answering = (body: unknown) => vi.spyOn(api, 'get').mockResolvedValue(body);

describe('the models of the installation — plan 08, B-36, S-166', () => {
  it('reads them as the installation gives them, effort only where it has levels', async () => {
    const get = answering({
      current: 'opus',
      models: [
        {
          value: 'opus',
          resolvedModel: 'claude-opus-5',
          displayName: 'Opus',
          description: 'Most capable',
          supportsEffort: true,
          supportedEffortLevels: ['low', 'high', 'ludicrous', 3],
        },
        { value: 'haiku', supportsEffort: true, supportedEffortLevels: [] },
        { value: 'sonnet', supportsEffort: false, supportedEffortLevels: ['low'] },
        { displayName: 'no value' },
        'not a model',
      ],
    });

    const read = await fetchModels(SESSION);

    expect(get).toHaveBeenCalledWith(`/sessions/${SESSION}/models`);
    expect(read).toEqual({
      current: 'opus',
      models: [
        {
          value: 'opus',
          resolvedModel: 'claude-opus-5',
          displayName: 'Opus',
          description: 'Most capable',
          supportsEffort: true,
          supportedEffortLevels: ['low', 'high'],
        },
        {
          value: 'haiku',
          resolvedModel: null,
          displayName: 'haiku',
          description: '',
          supportsEffort: false,
          supportedEffortLevels: [],
        },
        {
          value: 'sonnet',
          resolvedModel: null,
          displayName: 'sonnet',
          description: '',
          supportsEffort: false,
          supportedEffortLevels: ['low'],
        },
      ],
    });
  });

  it('reads a body that is not one as no model and no current', async () => {
    answering('nonsense');

    expect(await fetchModels(SESSION)).toEqual({ current: null, models: [] });
  });
});

describe('the use of the context window — B-37, S-173', () => {
  it('reads the categories it knows the kind of', async () => {
    const get = answering({
      model: 'claude-opus-5',
      totalTokens: 1200,
      maxTokens: 200000,
      percentage: 0.6,
      categories: [
        { id: 'messages', name: 'Messages', tokens: 800, kind: 'used' },
        { id: 'freeSpace', tokens: 'many', kind: 'free' },
        { id: 'odd', name: 'Odd', tokens: 1, kind: 'unknown' },
        { name: 'no id', kind: 'used' },
      ],
    });

    expect(await fetchContext(SESSION)).toEqual({
      model: 'claude-opus-5',
      totalTokens: 1200,
      maxTokens: 200000,
      percentage: 0.6,
      categories: [
        { id: 'messages', name: 'Messages', tokens: 800, kind: 'used' },
        { id: 'freeSpace', name: 'freeSpace', tokens: 0, kind: 'free' },
      ],
    });
    expect(get).toHaveBeenCalledWith(`/sessions/${SESSION}/context`);
  });

  it('reads a body that is not one as nothing used', async () => {
    answering(null);

    expect(await fetchContext(SESSION)).toEqual({
      model: '',
      totalTokens: 0,
      maxTokens: 0,
      percentage: 0,
      categories: [],
    });
  });
});

describe('the MCP servers — B-38, S-176, S-177', () => {
  it('keeps the name, the status and the count of tools — nothing else', async () => {
    answering({
      servers: [
        { name: 'docs', status: 'connected', toolCount: 4, config: { token: 'x' }, error: 'raw' },
        { name: 'jira', status: 'needs-auth' },
        { name: 'weird', status: 'exploded', toolCount: 1 },
        { status: 'failed' },
      ],
    });

    expect(await fetchMcpServers(SESSION)).toEqual([
      { name: 'docs', status: 'connected', toolCount: 4 },
      { name: 'jira', status: 'needs-auth', toolCount: 0 },
    ]);
  });

  it('reads a body that is not one as no server', async () => {
    answering([]);

    expect(await fetchMcpServers(SESSION)).toEqual([]);
  });
});
