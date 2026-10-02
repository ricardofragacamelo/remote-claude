import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { SessionFileEvents } from '@application/session';
import { SESSION_FILE_STATE_RECORDED } from '@application/shared';
import type { SessionFileStateRecorded } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * The session's file facts, on the internal bus (`EventEmitter2`).
 *
 * `files` listens and `session` never learns who: the bus is what keeps the arrow out of the
 * catalogue (docs/architecture/backend/03-modules.md#comunicação-assíncrona). **Publication never
 * throws** — the hook that publishes runs inside a turn of Claude, and a listener's problem is its
 * own (plan 07, B-18).
 */
@Injectable()
export class EmitterSessionFileEvents implements SessionFileEvents {
  constructor(
    @Inject(EventEmitter2) private readonly emitter: EventEmitter2,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  fileStateRecorded(event: SessionFileStateRecorded): void {
    this.logger.debug(
      { op: 'session.fileStateRecorded', layer: 'adapter', path: event.path },
      'publishing session.fileStateRecorded on the internal bus',
    );

    try {
      this.emitter.emit(SESSION_FILE_STATE_RECORDED, event);
    } catch (error) {
      this.logger.error(
        { op: 'session.fileStateRecorded', layer: 'adapter', path: event.path, err: error },
        `a consumer of ${SESSION_FILE_STATE_RECORDED} failed`,
      );
    }
  }
}
