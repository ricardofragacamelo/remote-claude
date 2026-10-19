import { z } from 'zod';

import type {
  ProjectMcpServerListPayload,
  ProjectMcpServerApprovalPayload,
} from '@remote-claude/contracts';
import type { ProjectMcpListResult, ProjectMcpServerView } from '@application/mcp';
import { folderField } from '../agent-settings/agent-settings.dto';

/** `?folder=`, required — every route here names which folder's climb it is about. */
export const projectFolderQuerySchema = z.object({ folder: folderField });
export type ProjectFolderQuery = z.infer<typeof projectFolderQuerySchema>;

/** `PUT /engines/:engine/project-mcp-approvals`. */
export const approveProjectMcpServerSchema = z
  .object({
    folder: folderField,
    name: z.string().min(1).max(64),
    digest: z.string().min(1).max(256),
  })
  .strict();
export type ApproveProjectMcpServerBody = z.infer<typeof approveProjectMcpServerSchema>;

/** `DELETE /engines/:engine/project-mcp-approvals?folder=&name=`. */
export const rejectProjectMcpServerQuerySchema = z.object({
  folder: folderField,
  name: z.string().min(1).max(64),
});
export type RejectProjectMcpServerQuery = z.infer<typeof rejectProjectMcpServerQuerySchema>;

function toDto(server: ProjectMcpServerView): ProjectMcpServerApprovalPayload {
  return {
    folderPath: server.folderPath,
    name: server.name,
    state: server.state,
    digest: server.digest,
    transport: server.transport,
    command: server.command,
    args: [...server.args],
    url: server.url,
    env: server.env.map((entry) => ({ name: entry.name, value: entry.value })),
    headers: server.headers.map((header) => ({ name: header.name, value: header.value })),
  };
}

export const toProjectMcpServerDto = toDto;

export function toProjectMcpServerListDto(
  result: ProjectMcpListResult,
): ProjectMcpServerListPayload {
  return {
    servers: result.servers.map(toDto),
    errors: result.errors.map((issue) => ({ folderPath: issue.folderPath, reason: issue.reason })),
  };
}
