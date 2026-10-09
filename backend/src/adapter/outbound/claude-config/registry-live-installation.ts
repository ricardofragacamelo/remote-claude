import { Inject, Injectable } from '@nestjs/common';

import type { InstallationAnswer, LiveInstallation } from '@application/claude-config';
import { SessionRegistry } from '@application/session';
import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * What a live session of the caller in a folder says about the installation — the answer that costs
 * no probe (plan 13, S-16). Through the registry module, never by importing the `session` module:
 * this adapter is the whole of the coupling.
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
          entry.session.isOwnedBy(userId) &&
          !entry.session.isClosed &&
          entry.session.workspace.value === folder.value,
      );

    if (live === undefined) {
      return null;
    }

    return {
      cliVersion: live.handle.cliVersion,
      initialization: await live.handle.initialization(),
    };
  }
}
