import { api } from '@/shared/api/api';
import type { ClaudeAccount, ClaudeInstallation, ModelCheckOutcome } from '../types/installation';
import type { ClaudeDefaults, ClaudeModel, DefaultsView } from '../types/defaults';

/** The query of a folder, when there is one. */
function withFolder(path: string, folder: string | undefined): string {
  return folder === undefined ? path : `${path}?${new URLSearchParams({ folder }).toString()}`;
}

/** `GET /claude/account` — `refresh` reads the account again instead of the minute it is kept. */
export function fetchAccount(refresh = false): Promise<ClaudeAccount> {
  return api.get<ClaudeAccount>(refresh ? '/claude/account?refresh=true' : '/claude/account');
}

/** `GET /claude/installation` — never fails because the CLI did not answer. */
export function fetchInstallation(): Promise<ClaudeInstallation> {
  return api.get<ClaudeInstallation>('/claude/installation');
}

/**
 * `POST /claude/diagnostics/model-check` — the one thing here that spends quota. The screen tests
 * the installation's own model; the route also takes another, for the diagnostic of other screens.
 */
export function checkModel(): Promise<ModelCheckOutcome> {
  return api.post<ModelCheckOutcome>('/claude/diagnostics/model-check', {});
}

/** `GET /claude/models?folder=` — the installation's, never a list of ours. */
export async function fetchModels(folder: string | undefined): Promise<readonly ClaudeModel[]> {
  return (
    await api.get<{ readonly models: readonly ClaudeModel[] }>(withFolder('/claude/models', folder))
  ).models;
}

/** `GET /claude/defaults?folder=`. */
export function fetchDefaults(folder: string | undefined): Promise<DefaultsView> {
  return api.get<DefaultsView>(withFolder('/claude/defaults', folder));
}

/** `PUT /claude/defaults` — the user's own default, whole. */
export function saveUserDefaults(values: ClaudeDefaults): Promise<DefaultsView> {
  return api.put<DefaultsView>('/claude/defaults', values);
}

/** `PUT /claude/defaults/folder` — the override of one folder, whole. */
export function saveFolderDefaults(folder: string, values: ClaudeDefaults): Promise<DefaultsView> {
  return api.put<DefaultsView>('/claude/defaults/folder', { folder, ...values });
}

/** `DELETE /claude/defaults/folder?folder=` — the folder goes back to the user's default. */
export function clearFolderDefaults(folder: string): Promise<void> {
  return api.delete<void>(withFolder('/claude/defaults/folder', folder));
}
