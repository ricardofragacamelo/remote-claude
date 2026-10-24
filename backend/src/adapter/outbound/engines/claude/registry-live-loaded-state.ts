import { Inject, Injectable } from '@nestjs/common';

import type { LiveLoadedState } from '@application/engines/claude';
import { SessionRegistry } from '@application/session';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import { liveClaudeSessionOf } from './live-claude-session';

/** What this adapter asks of a live session's handle — `SessionRunner`'s own extra, by shape. */
interface HasLoadedMemoryFiles {
  loadedMemoryFiles(): Promise<readonly string[]>;
}

function hasLoadedMemoryFiles(handle: unknown): handle is HasLoadedMemoryFiles {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    typeof (handle as Partial<HasLoadedMemoryFiles>).loadedMemoryFiles === 'function'
  );
}

/**
 * What a live Claude session of the caller, in a folder, actually loaded (plan 13, B-32, S-148) —
 * through the registry module, never by importing the `session` module, the same coupling
 * {@link import('./registry-live-installation').RegistryLiveInstallation} already makes. A session
 * of another engine in the folder, or none at all, answers `null`: the screen then shows the rule
 * alone, with nothing to confirm.
 *
 * Reaches `SessionRunner`'s extra `loadedMemoryFiles()` by shape, not by importing the concrete
 * class: `EngineControl` stays neutral on purpose (`toContextUse`'s own comment already says that
 * mapping carries no file paths), so this one extra method is a Claude-only escape hatch, not a
 * capability the core's generic dispatch knows about.
 */
@Injectable()
export class RegistryLiveLoadedState implements LiveLoadedState {
  constructor(@Inject(SessionRegistry) private readonly registry: SessionRegistry) {}

  async loadedMemoryFiles(
    userId: UserId,
    folder: WorkspacePath,
  ): Promise<readonly string[] | null> {
    const live = liveClaudeSessionOf(this.registry, userId, folder);

    if (live === undefined || !hasLoadedMemoryFiles(live.handle)) {
      return null;
    }

    return live.handle.loadedMemoryFiles();
  }
}
