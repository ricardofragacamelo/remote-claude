import type {
  McpServer,
  McpServerListPayload,
  ProjectMcpServerApprovalPayload,
  ProjectMcpServerListPayload,
} from '@remote-claude/contracts';

import { api, withFolder } from '@/shared/api';
import type { McpServerFields, McpServerPreview, McpTestOutcome } from '../types/mcp';

/** `GET /engines/:engine/mcp-servers` — every server of the caller, with its live status (D-45). */
export async function fetchMcpServers(engine: string): Promise<readonly McpServer[]> {
  return (await api.get<McpServerListPayload>(`/engines/${engine}/mcp-servers`)).servers;
}

/**
 * `POST /engines/:engine/mcp-servers/preview` — the description a save would record, word for word
 * (S-68). Carrying `editingId` also lists which of the caller's own permission rules the save would
 * revoke, when it is an edit that changes the program (plan 13, B-28, D-62, D-79).
 */
export function previewMcpServer(
  engine: string,
  fields: McpServerFields,
  editingId?: string,
): Promise<McpServerPreview> {
  return api.post<McpServerPreview>(`/engines/${engine}/mcp-servers/preview`, {
    ...fields,
    ...(editingId === undefined ? {} : { id: editingId }),
  });
}

/** `POST /engines/:engine/mcp-servers` — adding a server. */
export function createMcpServer(engine: string, fields: McpServerFields): Promise<McpServer> {
  return api.post<McpServer>(`/engines/${engine}/mcp-servers`, fields);
}

/** `PUT /engines/:engine/mcp-servers/:id` — changing a server, whole. */
export function updateMcpServer(
  engine: string,
  id: string,
  fields: McpServerFields,
): Promise<McpServer> {
  return api.put<McpServer>(`/engines/${engine}/mcp-servers/${id}`, fields);
}

/** `PATCH /engines/:engine/mcp-servers/:id` — turning a server on or off within the store. */
export function setMcpServerEnabled(
  engine: string,
  id: string,
  enabled: boolean,
): Promise<McpServer> {
  return api.patch<McpServer>(`/engines/${engine}/mcp-servers/${id}`, { enabled });
}

/** `DELETE /engines/:engine/mcp-servers/:id` — removing a server for good. */
export function removeMcpServer(engine: string, id: string): Promise<void> {
  return api.delete<void>(`/engines/${engine}/mcp-servers/${id}`);
}

/** `POST /engines/:engine/mcp-servers/:id/test` — testing an already-saved server's connection. */
export function testMcpServer(engine: string, id: string): Promise<McpTestOutcome> {
  return api.post<McpTestOutcome>(`/engines/${engine}/mcp-servers/${id}/test`, {});
}

/** `GET /engines/:engine/project-mcp-approvals?folder=` — every entry of the project's own file. */
export function fetchProjectMcpServers(
  engine: string,
  folder: string,
): Promise<ProjectMcpServerListPayload> {
  return api.get<ProjectMcpServerListPayload>(
    withFolder(`/engines/${engine}/project-mcp-approvals`, folder),
  );
}

/** `PUT /engines/:engine/project-mcp-approvals` — approving one entry, at the digest shown. */
export function approveProjectMcpServer(
  engine: string,
  folder: string,
  name: string,
  digest: string,
): Promise<ProjectMcpServerApprovalPayload> {
  return api.put<ProjectMcpServerApprovalPayload>(`/engines/${engine}/project-mcp-approvals`, {
    folder,
    name,
    digest,
  });
}

/** `DELETE /engines/:engine/project-mcp-approvals?folder=&name=` — rejecting one entry. */
export function rejectProjectMcpServer(
  engine: string,
  folder: string,
  name: string,
): Promise<void> {
  const query = new URLSearchParams({ folder, name }).toString();
  return api.delete<void>(`/engines/${engine}/project-mcp-approvals?${query}`);
}
