import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import {
  approveProjectMcpServer,
  createMcpServer,
  fetchMcpServers,
  fetchProjectMcpServers,
  previewMcpServer,
  rejectProjectMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  testMcpServer,
  updateMcpServer,
} from '@/features/mcp/services/mcp.service';
import type { McpServerFields } from '@/features/mcp/types/mcp';

const FIELDS: McpServerFields = {
  name: 'github',
  scope: 'user',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server-github'],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchMcpServers', () => {
  it('asks the store of this engine, and unwraps the envelope', async () => {
    const server = { id: 's1', name: 'github' };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ servers: [server] });

    expect(await fetchMcpServers('claude')).toEqual([server]);
    expect(get).toHaveBeenCalledWith('/engines/claude/mcp-servers');
  });
});

describe('previewMcpServer', () => {
  it('previews a create, never naming an id', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: [],
    });

    await previewMcpServer('claude', FIELDS);

    expect(post).toHaveBeenCalledWith('/engines/claude/mcp-servers/preview', FIELDS);
  });

  it('carries the id of the server being edited — plan 13, D-62, D-79', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: ['mcp(github:*)'],
    });

    await previewMcpServer('claude', FIELDS, 's1');

    expect(post).toHaveBeenCalledWith('/engines/claude/mcp-servers/preview', {
      ...FIELDS,
      id: 's1',
    });
  });
});

describe('createMcpServer', () => {
  it('posts the fields to the store', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 's1' });

    await createMcpServer('claude', FIELDS);

    expect(post).toHaveBeenCalledWith('/engines/claude/mcp-servers', FIELDS);
  });
});

describe('updateMcpServer', () => {
  it('puts the fields of one server, whole', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ id: 's1' });

    await updateMcpServer('claude', 's1', FIELDS);

    expect(put).toHaveBeenCalledWith('/engines/claude/mcp-servers/s1', FIELDS);
  });
});

describe('setMcpServerEnabled', () => {
  it('patches only the one field this write changes', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ id: 's1', enabled: false });

    await setMcpServerEnabled('claude', 's1', false);

    expect(patch).toHaveBeenCalledWith('/engines/claude/mcp-servers/s1', { enabled: false });
  });
});

describe('removeMcpServer', () => {
  it('deletes by id', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await removeMcpServer('claude', 's1');

    expect(del).toHaveBeenCalledWith('/engines/claude/mcp-servers/s1');
  });
});

describe('testMcpServer', () => {
  it('posts to the test route of one server, with no body', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ status: 'connected', tools: [], error: null });

    await testMcpServer('claude', 's1');

    expect(post).toHaveBeenCalledWith('/engines/claude/mcp-servers/s1/test', {});
  });
});

describe('fetchProjectMcpServers', () => {
  it('asks the approvals of one folder, with the folder in the query', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ servers: [], errors: [] });

    await fetchProjectMcpServers('claude', '/srv/app');

    expect(get).toHaveBeenCalledWith('/engines/claude/project-mcp-approvals?folder=%2Fsrv%2Fapp');
  });
});

describe('approveProjectMcpServer', () => {
  it('puts the folder, name and digest shown', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ name: 'docs', state: 'approved' });

    await approveProjectMcpServer('claude', '/srv/app', 'docs', 'd1');

    expect(put).toHaveBeenCalledWith('/engines/claude/project-mcp-approvals', {
      folder: '/srv/app',
      name: 'docs',
      digest: 'd1',
    });
  });
});

describe('rejectProjectMcpServer', () => {
  it('deletes with the folder and name in the query', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await rejectProjectMcpServer('claude', '/srv/app', 'docs');

    expect(del).toHaveBeenCalledWith(
      '/engines/claude/project-mcp-approvals?folder=%2Fsrv%2Fapp&name=docs',
    );
  });
});
