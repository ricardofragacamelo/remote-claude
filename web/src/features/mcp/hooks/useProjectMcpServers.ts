import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchProjectMcpServers } from '../services/mcp.service';
import type { ProjectMcpServerView } from '../types/mcp';
import { mcpKeys } from './mcp-keys';

/** One file site the climb could not read — nothing of it is approvable (S-106). */
export interface ProjectMcpFileIssue {
  readonly folderPath: string;
  readonly reason: 'malformed' | 'tooLarge' | 'linkEscapesRoot';
}

/** The servers a project's own MCP file declares, with where each stands (plan 13, B-24). */
export interface ProjectMcpServers {
  readonly servers: readonly ProjectMcpServerView[];
  readonly errors: readonly ProjectMcpFileIssue[];
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/** `GET /engines/:engine/project-mcp-approvals?folder=` — nothing read while no folder is in view. */
export function useProjectMcpServers(
  engine: string,
  folder: string | undefined,
): ProjectMcpServers {
  const query = useQuery<
    {
      readonly servers: readonly ProjectMcpServerView[];
      readonly errors: readonly ProjectMcpFileIssue[];
    },
    AppError
  >({
    queryKey: mcpKeys.projectServers(engine, folder ?? ''),
    queryFn: () => fetchProjectMcpServers(engine, folder as string),
    enabled: folder !== undefined,
    retry: false,
  });

  return {
    servers: query.data?.servers ?? [],
    errors: query.data?.errors ?? [],
    isLoading: query.isPending && folder !== undefined,
    error: query.error,
    retry: () => {
      void query.refetch();
    },
  };
}
