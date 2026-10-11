import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AgentWrites } from '@application/files';
import { SESSION_FILE_STATE_RECORDED } from '@application/shared';
import type { SessionFileStateRecorded } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * the agent's writes, as `files` hears of them — on the internal bus, never through `session`
 * (plan 07, B-18, S-126).
 *
 * The hook `PostToolUse` publishes how a session left each file it wrote; this keeps it, so the
 * watcher can tell a change of the agent's from somebody else's. Nothing it does can fail a session:
 * the bus swallows what a listener throws, and this throws nothing.
 */
@Injectable()
export class AgentWriteListener {
  constructor(
    @Inject(AgentWrites) private readonly writes: AgentWrites,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @OnEvent(SESSION_FILE_STATE_RECORDED)
  remember(event: SessionFileStateRecorded): void {
    this.logger.debug(
      { op: 'files.agentWrite', layer: 'adapter', path: event.path, engine: event.engine },
      'a write of the agent remembered',
    );
    this.writes.record(event);
  }
}
