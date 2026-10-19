import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type {
  ContextCategory,
  ContextUse,
  InstallationModel,
  McpServer,
  SessionModels,
} from '../types/insight';

const KINDS = new Set<string>(['used', 'free', 'buffer', 'deferred']);
const STATUSES = new Set<string>(['connected', 'failed', 'needs-auth', 'pending', 'disabled']);
const SOURCES = new Set<string>(['ours', 'project', 'plugin', 'other']);

const sessionPath = (sessionId: string): string => `/sessions/${encodeURIComponent(sessionId)}`;
const listOf = (value: unknown): Readonly<Record<string, unknown>>[] =>
  (Array.isArray(value) ? value : []).filter(isRecord);
const numberOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * The models of the session's installation — from `supportedModels()`, never a list of ours
 * (plan 08, B-36).
 *
 * @throws {import('@/shared/api/errors').AppError} `AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`, …
 */
export async function fetchModels(sessionId: string): Promise<SessionModels> {
  const body = await api.get<unknown>(`${sessionPath(sessionId)}/models`);
  const record = isRecord(body) ? body : {};

  return {
    current: readText(record, 'current'),
    models: listOf(record['models']).flatMap(modelOf),
  };
}

/**
 * The use of the session's context window, by category (B-37; plan 28, B-24).
 *
 * @throws {import('@/shared/api/errors').AppError} `ENGINE_CAPABILITY_UNAVAILABLE` (409) for an
 *   engine without `contextUse`, `AGENT_UNAVAILABLE`, …
 */
export async function fetchContext(sessionId: string): Promise<ContextUse> {
  const body = await api.get<unknown>(`${sessionPath(sessionId)}/context`);
  const record = isRecord(body) ? body : {};

  return {
    percentage: numberOf(record['percentage']),
    totalTokens: numberOf(record['totalTokens']),
    maxTokens: numberOf(record['maxTokens']),
    categories: listOf(record['categories']).flatMap(categoryOf),
    model: readText(record, 'model') ?? '',
  };
}

/** The MCP servers of the session — name, status, tool count (B-38). */
export async function fetchMcpServers(sessionId: string): Promise<readonly McpServer[]> {
  const body = await api.get<unknown>(`${sessionPath(sessionId)}/mcp-servers`);
  const record = isRecord(body) ? body : {};

  return mcpServerListOf(record['servers']);
}

/**
 * The servers of a `{ servers: [...] }` shape, read the same way whether it came from the HTTP
 * route above or from a `session.mcpStatusChanged` event (plan 13, B-22) — one parser, so the two
 * never drift. A server missing a required field, or carrying a status or source this build does not
 * know, is left out rather than shown wrong.
 */
export function mcpServerListOf(value: unknown): readonly McpServer[] {
  return listOf(value).flatMap((server): McpServer[] => {
    const name = readText(server, 'name');
    const status = readText(server, 'status');
    const source = readText(server, 'source');
    const error = readText(server, 'error');

    if (name === null || status === null || !STATUSES.has(status)) {
      return [];
    }

    return [
      {
        name,
        status: status as McpServer['status'],
        source: source !== null && SOURCES.has(source) ? (source as McpServer['source']) : 'other',
        toolCount: numberOf(server['toolCount']),
        ...(status === 'failed' && error !== null ? { error } : {}),
      },
    ];
  });
}

export function modelOf(model: Readonly<Record<string, unknown>>): InstallationModel[] {
  const value = readText(model, 'value');

  if (value === null) {
    return [];
  }

  // The model's own levels, as text: which of them a conversation offers is what its engine
  // announces (plan 28, B-28), never a list of this build.
  const levels = (
    Array.isArray(model['supportedEffortLevels']) ? model['supportedEffortLevels'] : []
  ).filter((level): level is string => typeof level === 'string');

  return [
    {
      value,
      resolvedModel: readText(model, 'resolvedModel'),
      displayName: readText(model, 'displayName') ?? value,
      description: typeof model['description'] === 'string' ? model['description'] : '',
      supportsEffort: model['supportsEffort'] === true && levels.length > 0,
      supportedEffortLevels: levels,
    },
  ];
}

/**
 * One category of the window, or none when it is not one this build can draw: a canonical one with
 * its key, any other with the engine's text.
 */
function categoryOf(category: Readonly<Record<string, unknown>>): ContextCategory[] {
  const id = readText(category, 'id');
  const kind = readText(category, 'kind');
  const messageKey = readText(category, 'messageKey');
  const text = readText(category, 'text');

  return id === null || kind === null || !KINDS.has(kind)
    ? []
    : [
        {
          id,
          ...(messageKey === null ? {} : { messageKey }),
          ...(text === null ? {} : { text }),
          tokens: numberOf(category['tokens']),
          kind: kind as ContextCategory['kind'],
        },
      ];
}
