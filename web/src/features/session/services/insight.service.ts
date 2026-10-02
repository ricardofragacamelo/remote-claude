import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type { EffortLevel } from '../store/claude-panel.store';
import type {
  ContextCategory,
  ContextUse,
  InstallationModel,
  McpServer,
  SessionModels,
} from '../types/insight';

const EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max']);
const KINDS = new Set<string>(['used', 'free', 'buffer', 'deferred']);
const STATUSES = new Set<string>(['connected', 'failed', 'needs-auth', 'pending', 'disabled']);

const sessionPath = (sessionId: string): string => `/sessions/${encodeURIComponent(sessionId)}`;
const listOf = (value: unknown): Readonly<Record<string, unknown>>[] =>
  (Array.isArray(value) ? value : []).filter(isRecord);
const numberOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * The models of the session's installation — from `supportedModels()`, never a list of ours
 * (plan 08, B-36).
 *
 * @throws {import('@/shared/api/errors').AppError} `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`, …
 */
export async function fetchModels(sessionId: string): Promise<SessionModels> {
  const body = await api.get<unknown>(`${sessionPath(sessionId)}/models`);
  const record = isRecord(body) ? body : {};

  return {
    current: readText(record, 'current'),
    models: listOf(record['models']).flatMap(modelOf),
  };
}

/** The use of the session's context window, by category (B-37). */
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

  return listOf(record['servers']).flatMap((server): McpServer[] => {
    const name = readText(server, 'name');
    const status = readText(server, 'status');
    return name === null || status === null || !STATUSES.has(status)
      ? []
      : [{ name, status: status as McpServer['status'], toolCount: numberOf(server['toolCount']) }];
  });
}

function modelOf(model: Readonly<Record<string, unknown>>): InstallationModel[] {
  const value = readText(model, 'value');

  if (value === null) {
    return [];
  }

  const levels = (
    Array.isArray(model['supportedEffortLevels']) ? model['supportedEffortLevels'] : []
  ).filter((level): level is EffortLevel => typeof level === 'string' && EFFORTS.has(level));

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

function categoryOf(category: Readonly<Record<string, unknown>>): ContextCategory[] {
  const id = readText(category, 'id');
  const kind = readText(category, 'kind');

  return id === null || kind === null || !KINDS.has(kind)
    ? []
    : [
        {
          id,
          name: readText(category, 'name') ?? id,
          tokens: numberOf(category['tokens']),
          kind: kind as ContextCategory['kind'],
        },
      ];
}
