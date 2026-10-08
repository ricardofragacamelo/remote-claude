import type { FollowTranscriptUseCase } from '@application/transcript';
import type { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Logger } from '@shared/logging/logger';
import { ConnectionRelease } from '../connection-release';

/**
 * A socket that goes takes the conversations it followed with it — plan 22, B-17, S-67.
 *
 * The last subscription of a conversation stops its tick: an orphan subscription would keep asking the
 * store about a conversation nobody reads (R-05).
 */
export class ConnectionFollowRelease extends ConnectionRelease {
  constructor(
    registry: ConnectionRegistry,
    private readonly follower: FollowTranscriptUseCase,
    private readonly logger: Logger,
  ) {
    super(registry);
  }

  protected release(connectionId: string): Promise<void> {
    const released = this.follower.release(connectionId);

    if (released > 0) {
      this.logger.debug(
        {
          op: 'transcript.follow',
          layer: 'adapter',
          connectionId,
          released,
          conversations: this.follower.followedConversations,
        },
        'followed conversations of a closed connection released',
      );
    }
    return Promise.resolve();
  }
}
