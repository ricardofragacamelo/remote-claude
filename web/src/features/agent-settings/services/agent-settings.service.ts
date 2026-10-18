import type { EngineModelsPayload } from '@remote-claude/contracts';

import { api, withFolder } from '@/shared/api';
import type { AgentDefaults, AgentModel, DefaultsView } from '../types/defaults';

/**
 * `GET /engines/:engine/models?folder=` — the installation's, never a list of ours. The engine's
 * version and the modes it runs in travel on the same payload; this form never names either, both
 * already known from `GET /engines` (B-12).
 */
export async function fetchModels(
  engine: string,
  folder: string | undefined,
): Promise<readonly AgentModel[]> {
  return (
    await api.get<Pick<EngineModelsPayload, 'models'>>(
      withFolder(`/engines/${engine}/models`, folder),
    )
  ).models;
}

/** `GET /engines/:engine/defaults?folder=`. */
export function fetchDefaults(engine: string, folder: string | undefined): Promise<DefaultsView> {
  return api.get<DefaultsView>(withFolder(`/engines/${engine}/defaults`, folder));
}

/** `PUT /engines/:engine/defaults` — the user's own default, whole. */
export function saveUserDefaults(engine: string, values: AgentDefaults): Promise<DefaultsView> {
  return api.put<DefaultsView>(`/engines/${engine}/defaults`, values);
}

/** `PUT /engines/:engine/defaults/folder` — the override of one folder, whole. */
export function saveFolderDefaults(
  engine: string,
  folder: string,
  values: AgentDefaults,
): Promise<DefaultsView> {
  return api.put<DefaultsView>(`/engines/${engine}/defaults/folder`, { folder, ...values });
}

/** `DELETE /engines/:engine/defaults/folder?folder=` — the folder goes back to the user's default. */
export function clearFolderDefaults(engine: string, folder: string): Promise<void> {
  return api.delete<void>(withFolder(`/engines/${engine}/defaults/folder`, folder));
}
