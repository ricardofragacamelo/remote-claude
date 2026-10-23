import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { approveProjectMcpServer, rejectProjectMcpServer } from '../services/mcp.service';
import type { ProjectMcpServerView } from '../types/mcp';
import { mcpKeys } from './mcp-keys';

/** Approving or rejecting an entry of a project's own MCP file (plan 13, B-24, B-28). */
export interface ProjectMcpMutations {
  approve(name: string, digest: string): Promise<ProjectMcpServerView>;
  reject(name: string): Promise<void>;
  readonly saving: boolean;
  readonly saveError: AppError | null;
}

export function useProjectMcpMutations(engine: string, folder: string): ProjectMcpMutations {
  const queryClient = useQueryClient();
  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: mcpKeys.projectServers(engine, folder) });

  const approve = useMutation<ProjectMcpServerView, AppError, { name: string; digest: string }>({
    mutationFn: ({ name, digest }) => approveProjectMcpServer(engine, folder, name, digest),
    onSuccess: invalidate,
  });
  const reject = useMutation<void, AppError, string>({
    mutationFn: (name) => rejectProjectMcpServer(engine, folder, name),
    onSuccess: invalidate,
  });

  return {
    approve: (name, digest) => approve.mutateAsync({ name, digest }),
    reject: (name) => reject.mutateAsync(name),
    saving: approve.isPending || reject.isPending,
    saveError: approve.error ?? reject.error,
  };
}
