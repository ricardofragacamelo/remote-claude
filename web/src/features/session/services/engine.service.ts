import { isEngineListPayloadEnginesItem } from '@remote-claude/contracts';
import type { EngineListPayload } from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import type { Unchecked } from '@/shared/lib/json';
import type { EngineDirectory } from '../types/engine';

/**
 * The coding agents this installation drives, and what each can do (`GET /engines`, plan 28, B-12).
 * Nothing is spawned and no quota is spent to answer it.
 *
 * Read defensively: an engine this build cannot read is dropped rather than thrown over — it costs
 * the person its name on screen, which falls back to its id, not the screen.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchEngines(): Promise<EngineDirectory> {
  const body = await api.get<Unchecked<EngineListPayload>>('/engines');
  const engines = Array.isArray(body.engines)
    ? body.engines.filter(isEngineListPayloadEnginesItem)
    : [];

  return {
    defaultEngine:
      typeof body.defaultEngine === 'string' && body.defaultEngine.length > 0
        ? body.defaultEngine
        : (engines[0]?.id ?? null),
    engines,
  };
}
