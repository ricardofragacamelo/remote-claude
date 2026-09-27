import { Inject, Injectable } from '@nestjs/common';

import type { UndoJournal, UndoReach } from '@application/session';
import type { SessionFileState, TurnFileCheckpoint } from '@domain/session';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * The journal, as the undo reads it: by the conversation, not only by the live session.
 *
 * One of ours continued in place is a new live session on the same conversation, and the undo
 * points the sessions before it recorded are its points too — the other half of S-59, which the
 * resume of F2 left for this phase.
 */
@Injectable()
export class JournalUndoStore implements UndoJournal {
  constructor(
    @Inject(DrizzleSessionFileRepository) private readonly files: DrizzleSessionFileRepository,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  checkpointsOf(reach: UndoReach): Promise<readonly TurnFileCheckpoint[]> {
    return this.files.checkpointsOfConversation(reach.sessionId, reach.claudeSessionId);
  }

  baselinesOf(reach: UndoReach): Promise<readonly SessionFileState[]> {
    return this.files.statesOfConversation(reach.sessionId, reach.claudeSessionId);
  }

  /**
   * Records how the undo left a path — and never fails the undo over it.
   *
   * The file is already back by the time this runs. A baseline that could not be written costs only
   * a more conservative next undo of that path, which is the same asymmetry the journal has always
   * had: degrading to "more careful" is acceptable, degrading to "the undo said it failed after it
   * had succeeded" is not.
   */
  async recordBaseline(state: SessionFileState): Promise<void> {
    try {
      await this.files.saveState(state);
    } catch (error) {
      this.logger.warn(
        {
          op: 'sessionFile.journal',
          layer: 'adapter',
          sessionId: state.sessionId.value,
          path: state.path,
          what: 'baseline after undo',
          err: error,
        },
        'the baseline an undo left could not be written — the next undo of this path will be conservative',
      );
    }
  }

  async reachOf(live: readonly UndoReach[]): Promise<ReadonlySet<string>> {
    const earlier = await this.files.sessionsOfConversations(
      live.map((reach) => reach.claudeSessionId.value),
    );

    return new Set([...live.map((reach) => reach.sessionId.value), ...earlier]);
  }
}
