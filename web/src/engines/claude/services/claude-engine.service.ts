import { api, withFolder } from '@/shared/api';
import type { ClaudeAccount, ClaudeInstallation, ModelCheckOutcome } from '../types/installation';
import type { OutputStyleView } from '../types/output-style';
import type { RateLimitsView } from '../types/rate-limits';

/** `GET /engines/claude/account` — `refresh` reads the account again instead of the minute it is kept. */
export function fetchAccount(refresh = false): Promise<ClaudeAccount> {
  return api.get<ClaudeAccount>(
    refresh ? '/engines/claude/account?refresh=true' : '/engines/claude/account',
  );
}

/** `GET /engines/claude/usage/rate-limits` — the account's windows, as the CLI last reported them. */
export function fetchRateLimits(): Promise<RateLimitsView> {
  return api.get<RateLimitsView>('/engines/claude/usage/rate-limits');
}

/** `GET /engines/claude/installation` — never fails because the CLI did not answer. */
export function fetchInstallation(): Promise<ClaudeInstallation> {
  return api.get<ClaudeInstallation>('/engines/claude/installation');
}

/**
 * `POST /engines/claude/diagnostics/model-check` — the one thing here that spends quota. The screen
 * tests the installation's own model; the route also takes another, for the diagnostic of other
 * screens.
 */
export function checkModel(): Promise<ModelCheckOutcome> {
  return api.post<ModelCheckOutcome>('/engines/claude/diagnostics/model-check', {});
}

/** `GET /engines/claude/output-style?folder=`. */
export function fetchOutputStyle(folder: string | undefined): Promise<OutputStyleView> {
  return api.get<OutputStyleView>(withFolder('/engines/claude/output-style', folder));
}

/** `PUT /engines/claude/output-style` — the user's own, whole. */
export function saveUserOutputStyle(outputStyle: string | null): Promise<OutputStyleView> {
  return api.put<OutputStyleView>('/engines/claude/output-style', { outputStyle });
}

/** `PUT /engines/claude/output-style/folder` — the override of one folder, whole. */
export function saveFolderOutputStyle(
  folder: string,
  outputStyle: string | null,
): Promise<OutputStyleView> {
  return api.put<OutputStyleView>('/engines/claude/output-style/folder', { folder, outputStyle });
}

/**
 * Saves the output style in the scope the folder names — the user's own with none, a folder's
 * override with one, cleared by setting it back to `null` there (mirrors the core's own defaults).
 */
export function saveOutputStyle(
  folder: string | undefined,
  outputStyle: string | null,
): Promise<OutputStyleView> {
  return folder === undefined
    ? saveUserOutputStyle(outputStyle)
    : saveFolderOutputStyle(folder, outputStyle);
}
