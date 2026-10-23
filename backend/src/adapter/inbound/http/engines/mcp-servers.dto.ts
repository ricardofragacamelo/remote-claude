import { z } from 'zod';

import type {
  McpServer,
  McpServerPreviewPayload,
  McpServerListPayload,
  McpServerTestOutcomePayload,
} from '@remote-claude/contracts';
import type { McpServerTestOutcome } from '@domain/mcp';
import type {
  McpServerFieldsInput,
  McpSecretFieldInput,
  McpServerPreviewResult,
  McpServerView,
} from '@application/mcp';
import { MCP_LIMITS } from '@domain/mcp';

/** `:engine`, in the form of an engine's name — whether it is enabled is the use case's to say. */
export const engineParamSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

const secretFieldSchema = z
  .object({
    name: z.string().min(1).max(256),
    value: z.string().max(MCP_LIMITS.maxEnvValueLength).nullable().optional(),
  })
  .strict();

const commonFields = {
  name: z.string().min(1).max(64),
  scope: z.enum(['user', 'folder']),
  folderPath: z.string().min(1).max(4096).nullable().optional(),

  /**
   * Set only on a call to `preview`, to name the server being **edited** — never on a create or on
   * the store-writing routes, which already carry it in the path (plan 13, B-28, D-62, D-79). Its
   * presence is what tells the preview to compute `revokedRules`.
   */
  id: z.string().min(1).max(64).optional(),
};

const stdioFieldsSchema = z
  .object({
    ...commonFields,
    transport: z.literal('stdio'),
    command: z.string().min(1).max(MCP_LIMITS.maxCommandLength),
    args: z.array(z.string().max(MCP_LIMITS.maxArgLength)).max(MCP_LIMITS.maxArgs).optional(),
    env: z.array(secretFieldSchema).max(MCP_LIMITS.maxEnvVars).optional(),
  })
  .strict();

const remoteFieldsSchema = z
  .object({
    ...commonFields,
    transport: z.enum(['http', 'sse']),
    url: z.string().min(1).max(MCP_LIMITS.maxUrlLength),
    headers: z.array(secretFieldSchema).max(MCP_LIMITS.maxHeaders).optional(),
  })
  .strict();

/** The body of `POST`, `PUT` and the preview — a server is one transport or the other, never both. */
export const mcpServerFieldsSchema = z.union([stdioFieldsSchema, remoteFieldsSchema]);
export type McpServerFieldsBody = z.infer<typeof mcpServerFieldsSchema>;

/** The body of `PATCH /engines/:engine/mcp-servers/:id`. */
export const setEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export type SetEnabledBody = z.infer<typeof setEnabledSchema>;

function secretFieldsOf(
  entries:
    readonly { readonly name: string; readonly value?: string | null | undefined }[] | undefined,
): readonly McpSecretFieldInput[] | undefined {
  return entries?.map((entry) => ({ name: entry.name, value: entry.value }));
}

/** [body] in the shape the use cases take — the union collapsed, nothing renamed. */
export function fieldsOf(body: McpServerFieldsBody): McpServerFieldsInput {
  if (body.transport === 'stdio') {
    return {
      name: body.name,
      scope: body.scope,
      folderPath: body.folderPath ?? null,
      transport: 'stdio',
      command: body.command,
      args: body.args,
      env: secretFieldsOf(body.env),
    };
  }
  return {
    name: body.name,
    scope: body.scope,
    folderPath: body.folderPath ?? null,
    transport: body.transport,
    url: body.url,
    headers: secretFieldsOf(body.headers),
  };
}

/**
 * [server] on the wire — structural fields only, never a secret value (S-70). `status` is the
 * store's own `disabled`, or what a live session shows for it, `pending` with none (B-28, D-45).
 */
export function toMcpServerDto(server: McpServerView): McpServer {
  return {
    id: server.id,
    name: server.name,
    scope: server.scope,
    folderPath: server.folderPath,
    transport: server.transport,
    command: server.command,
    args: [...server.args],
    envNames: [...server.envNames],
    url: server.url,
    headerNames: [...server.headerNames],
    enabled: server.enabled,
    status: server.status,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

export function toMcpServerListDto(servers: readonly McpServerView[]): McpServerListPayload {
  return { servers: servers.map(toMcpServerDto) };
}

/** [outcome] on the wire — every tool's annotations only where the server itself said something. */
export function toMcpServerTestDto(outcome: McpServerTestOutcome): McpServerTestOutcomePayload {
  return {
    status: outcome.status,
    error: outcome.error,
    tools: outcome.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: { ...tool.annotations },
    })),
  };
}

/**
 * [description] on the wire — every param stringified: the contract has no number type here.
 * `revokedRules` is empty for a create, or an edit that keeps the server's program (D-62, D-79).
 */
export function toPreviewDto(description: McpServerPreviewResult): McpServerPreviewPayload {
  return {
    messageKey: description.messageKey,
    revokedRules: [...description.revokedRules],
    params: Object.fromEntries(
      Object.entries(description.params).map(([key, value]) => [key, String(value)]),
    ),
  };
}
