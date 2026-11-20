import { describe, expect, it, vi } from 'vitest';

import { WorkspaceModuleSearchFolderResolver } from '@adapter/outbound/search/workspace-module.folder-resolver';
import { ResolveWorkspaceUseCase } from '@application/workspace';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';

describe('WorkspaceModuleSearchFolderResolver — plan 11, B-09', () => {
  it('resolves through ResolveWorkspaceUseCase and answers its real path', async () => {
    const path = WorkspacePath.create('/srv/project');
    const execute = vi.fn().mockResolvedValue({ path });
    const workspaces = { execute } as unknown as ResolveWorkspaceUseCase;
    const resolver = new WorkspaceModuleSearchFolderResolver(workspaces);
    const userId = UserId.create('user-1');

    const resolved = await resolver.resolve('/srv/project', userId);

    expect(resolved).toBe(path);
    expect(execute).toHaveBeenCalledWith('/srv/project', userId);
  });

  it('propagates whatever the workspace use case refuses with', async () => {
    const failure = new Error('refused');
    const workspaces = {
      execute: vi.fn().mockRejectedValue(failure),
    } as unknown as ResolveWorkspaceUseCase;
    const resolver = new WorkspaceModuleSearchFolderResolver(workspaces);

    await expect(resolver.resolve('/elsewhere', UserId.create('user-1'))).rejects.toBe(failure);
  });
});
