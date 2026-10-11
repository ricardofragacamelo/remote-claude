import { Inject, Injectable } from '@nestjs/common';

import type { InstallationAnswer, LiveInstallation } from '@application/engines/claude';
import { liveControl, SessionRegistry } from '@application/session';
import type { UserId } from '@domain/auth';
import { claudeInitializationOf } from '@domain/engines/claude';
import type { WorkspacePath } from '@domain/workspace';
import { CLAUDE_ENGINE } from './claude-engine';

/**
 * What a live Claude session of the caller in a folder says about the installation — the answer
 * that costs no probe (plan 13, S-16). Through the registry module, never by importing the `session`
 * module: this adapter is the whole of the coupling. A session of another engine in the folder says
 * nothing of Claude's installation, and is passed over.
 */
@Injectable()
export class RegistryLiveInstallation implements LiveInstallation {
  constructor(@Inject(SessionRegistry) private readonly registry: SessionRegistry) {}

  async initializationOf(
    userId: UserId,
    folder: WorkspacePath,
  ): Promise<InstallationAnswer | null> {
    const live = this.registry
      .all()
      .find(
        (entry) =>
          entry.conversation.ref.engine.value === CLAUDE_ENGINE &&
          entry.session.isOwnedBy(userId) &&
          !entry.session.isClosed &&
          entry.session.workspace.value === folder.value,
      );

    if (live === undefined) {
      return null;
    }

    return {
      cliVersion: live.handle.cliVersion,
      initialization: claudeInitializationOf(await liveControl(live, 'initialization')()),
    };
  }
}
