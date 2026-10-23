import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAddServerFlow } from '@/features/mcp/hooks/useAddServerFlow';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import type { McpServerMutations } from '@/features/mcp/hooks/useMcpServerMutations';
import type { McpServerView } from '@/features/mcp/types/mcp';

afterEach(() => {
  vi.restoreAllMocks();
});

const SERVER: McpServerView = {
  id: 's1',
  name: 'github',
  scope: 'user',
  folderPath: null,
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  envNames: ['TOKEN'],
  url: null,
  headerNames: [],
  enabled: true,
  status: 'pending',
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
};

function mutationsOf(overrides: Partial<McpServerMutations> = {}): McpServerMutations {
  return {
    create: vi.fn().mockResolvedValue(SERVER),
    update: vi.fn().mockResolvedValue(SERVER),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    removeMany: vi.fn(),
    test: vi.fn(),
    testResults: new Map(),
    clearTestResults: vi.fn(),
    saving: false,
    saveError: null,
    ...overrides,
  };
}

describe('useAddServerFlow — plan 13, B-28, S-132', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));
    expect(result.current.state).toBeNull();
  });

  it('opens on the form step, empty, for a create', () => {
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
    });

    expect(result.current.state).toMatchObject({ step: 'form', editing: null });
    expect(result.current.state?.fields.name).toBe('');
  });

  it('opens on the form step, pre-filled, for an edit — the secret fields have no value yet', () => {
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(SERVER);
    });

    expect(result.current.state?.editing).toBe(SERVER);
    expect(result.current.state?.fields).toMatchObject({
      name: 'github',
      command: 'npx',
      args: ['-y', 'server'],
      env: [{ name: 'TOKEN' }],
    });
  });

  it('opens a remote server pre-filled with its URL and header names, not a command', () => {
    const remote: McpServerView = {
      ...SERVER,
      id: 's2',
      transport: 'http',
      command: null,
      args: [],
      envNames: [],
      url: 'https://mcp.example.com',
      headerNames: ['X-Token'],
    };
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(remote);
    });

    expect(result.current.state?.fields).toMatchObject({
      transport: 'http',
      url: 'https://mcp.example.com',
      headers: [{ name: 'X-Token' }],
    });
  });

  it('opens an edit with no command, or no URL, as an empty field — never null', () => {
    const noCommand: McpServerView = { ...SERVER, command: null };
    const noUrl: McpServerView = { ...SERVER, id: 's2', transport: 'http', url: null };
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(noCommand);
    });
    expect(result.current.state?.fields).toMatchObject({ command: '' });

    act(() => {
      result.current.start(noUrl);
    });
    expect(result.current.state?.fields).toMatchObject({ url: '' });
  });

  it('does not ask the server when a local rule already fails — nothing left unsaved', async () => {
    const post = vi.spyOn(api, 'post');
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.issues.length).toBeGreaterThan(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('moves to the preview step once the server describes the config — S-132', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: [],
    });
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
      result.current.setFields({
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'npx',
      });
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('preview');
    expect(result.current.state?.preview?.messageKey).toBe('mcp.description.stdioAnyFolder');
  });

  it('carries the editing id to the preview, for the revoked-rules answer — D-62, D-79', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: ['mcp(github:*)'],
    });
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(SERVER);
      result.current.setFields({
        name: SERVER.name,
        scope: SERVER.scope,
        transport: 'stdio',
        command: 'node',
        args: [],
      });
    });
    await act(() => result.current.toPreview());

    expect(post).toHaveBeenCalledWith(
      '/engines/claude/mcp-servers/preview',
      expect.objectContaining({ id: 's1' }),
    );
    expect(result.current.state?.preview?.revokedRules).toEqual(['mcp(github:*)']);
  });

  it('keeps the previewError on the form step when the server refuses it', async () => {
    const failure = new AppError(
      'MCP_SERVER_CONFIG_INVALID',
      'mcp.error.serverConfigInvalid',
      't1',
    );
    vi.spyOn(api, 'post').mockRejectedValue(failure);
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
      result.current.setFields({
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'npx',
      });
    });
    await act(() => result.current.toPreview());

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.previewError).toBe(failure);
  });

  it('goes back to the form, keeping the draft', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: [],
    });
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
      result.current.setFields({
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'npx',
      });
    });
    await act(() => result.current.toPreview());

    act(() => {
      result.current.back();
    });

    expect(result.current.state?.step).toBe('form');
    expect(result.current.state?.fields.name).toBe('github');
  });

  it('confirm creates for a new server, and closes on success', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    act(() => {
      result.current.start(null);
      result.current.setFields({
        name: 'github',
        scope: 'user',
        transport: 'stdio',
        command: 'npx',
      });
    });
    await act(() => result.current.confirm());

    expect(mutations.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github', command: 'npx' }),
    );
    expect(result.current.state).toBeNull();
  });

  it('confirm updates the id being edited, never creating a new one', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    act(() => {
      result.current.start(SERVER);
    });
    await act(() => result.current.confirm());

    expect(mutations.update).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ name: 'github' }),
    );
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the save error when the write fails', async () => {
    const failure = new AppError('MCP_SERVER_NAME_TAKEN', 'mcp.error.serverNameTaken', 't1');
    const mutations = mutationsOf({ create: vi.fn().mockRejectedValue(failure) });
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    act(() => {
      result.current.start(null);
    });
    await act(() => result.current.confirm());

    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.saveError).toBe(failure);
  });

  it('cancel closes the dialog without saving', () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    act(() => {
      result.current.start(null);
      result.current.cancel();
    });

    expect(result.current.state).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it('does nothing when asked to act with no dialog open', async () => {
    const mutations = mutationsOf();
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    await act(() => result.current.toPreview());
    act(() => {
      result.current.back();
    });
    await act(() => result.current.confirm());

    expect(result.current.state).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it('cancelling while the preview is in flight leaves it closed once the answer arrives', async () => {
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
      result.current.setFields({ name: 'x', scope: 'user', transport: 'stdio', command: 'npx' });
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toPreview();
    });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBeNull();

    await act(async () => {
      settle({ messageKey: 'mcp.description.stdioAnyFolder', params: {}, revokedRules: [] });
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the preview fails in flight leaves it closed too', async () => {
    let fail: (error: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { result } = renderHook(() => useAddServerFlow('claude', mutationsOf()));

    act(() => {
      result.current.start(null);
      result.current.setFields({ name: 'x', scope: 'user', transport: 'stdio', command: 'npx' });
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toPreview();
    });
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      fail(new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1'));
      await pending;
    });
    expect(result.current.state).toBeNull();
  });

  it('cancelling while the confirmed write is in flight leaves it closed once it settles', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const mutations = mutationsOf({
      create: vi.fn(
        () =>
          new Promise<McpServerView>((_resolve, reject) => {
            fail = reject;
          }),
      ),
    });
    const { result } = renderHook(() => useAddServerFlow('claude', mutations));

    act(() => {
      result.current.start(null);
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.confirm();
    });
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      fail(new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1'));
      await pending;
    });
    expect(result.current.state).toBeNull();
  });
});
