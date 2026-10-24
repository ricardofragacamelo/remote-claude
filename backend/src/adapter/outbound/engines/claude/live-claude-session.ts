import type { LiveSession, SessionRegistry } from '@application/session';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { CLAUDE_ENGINE } from './claude-engine';

/**
 * The live Claude session of [userId], in [folder], or `undefined` when there is none — the one
 * selection {@link import('./registry-live-installation').RegistryLiveInstallation} and
 * {@link import('./registry-live-loaded-state').RegistryLiveLoadedState} both need (plan 13, S-16,
 * B-32): a session of another engine in the folder, of another user, already closed, or in a
 * different folder entirely is never it.
 */
export function liveClaudeSessionOf(
  registry: SessionRegistry,
  userId: UserId,
  folder: WorkspacePath,
): LiveSession | undefined {
  return registry
    .all()
    .find(
      (entry) =>
        entry.conversation.ref.engine.value === CLAUDE_ENGINE &&
        entry.session.isOwnedBy(userId) &&
        !entry.session.isClosed &&
        entry.session.workspace.value === folder.value,
    );
}
