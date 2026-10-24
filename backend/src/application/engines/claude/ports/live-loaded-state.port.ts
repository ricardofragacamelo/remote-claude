import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * What a live Claude session of the caller, in a folder, says it actually loaded — the confirmation
 * half of D-16's "declared" vs "in use". Backed by `getContextUsage({ detail: 'summary' })`'s own
 * `memory_files`, which this port reduces to just the paths: the rest of that answer (token counts,
 * skills, agents) is Claude-only vocabulary that stays inside `adapter/outbound/engines/claude/`
 * (plan 13, B-32, S-148).
 */
export interface LiveLoadedState {
  /**
   * The absolute paths of the memory files a live session of `userId` in `folder` has loaded, or
   * `null` when the caller has no live session there to ask (S-148: with no live session, the
   * screen shows the rule alone, with nothing to confirm or diverge from).
   */
  loadedMemoryFiles(userId: UserId, folder: WorkspacePath): Promise<readonly string[] | null>;
}

export const LIVE_LOADED_STATE = Symbol('LiveLoadedState');
