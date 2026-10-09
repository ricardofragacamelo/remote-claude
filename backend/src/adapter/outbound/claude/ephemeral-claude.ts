import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { Inject, Injectable } from '@nestjs/common';

import { SessionRegistry } from '@application/session';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { ClaudeTimeoutError, ClaudeUnavailableError } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { withinDeadline } from './deadline';
import { openEphemeralQuery } from './ephemeral-query';
import type { EphemeralQueryInput } from './ephemeral-query';
import { QUERY_FACTORY } from './query.factory';
import type { QueryFactory } from './query.factory';

/** What one question to a query that only asks is, beyond how it is opened. */
export interface EphemeralQuestion extends EphemeralQueryInput {
  /** The `op` of its log lines. */
  readonly op: string;

  /** What a refusal names: the folder, or what was tested. */
  readonly subject: string;

  /** What it was asked to do, as a timeout says it (`answer the probe`). */
  readonly what: string;
  readonly timeoutMs: number;
}

/**
 * Asks a query that only asks — the probe of the installation and the test of the connection (plan
 * 13, B-10, B-12) — the way both have to: a slot of the capacity taken before anything is spawned,
 * one deadline, a CLI that failed read as unavailable and one that did not answer as a timeout, and
 * the query closed and the slot given back in the `finally`, whatever happened (S-17, S-20, S-21).
 */
@Injectable()
export class EphemeralClaude {
  constructor(
    @Inject(QUERY_FACTORY) private readonly createQuery: QueryFactory,
    @Inject(SessionRegistry) private readonly capacity: SessionRegistry,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * @throws {import('@domain/session').SessionLimitReachedError} no slot: nothing was spawned
   * @throws {ClaudeUnavailableError} the CLI failed, or died
   * @throws {ClaudeTimeoutError} the CLI did not answer in time
   */
  async ask<T>(question: EphemeralQuestion, ask: (query: Query) => Promise<T>): Promise<T> {
    this.capacity.reserve();
    const startedAt = Date.now();
    const ephemeral = openEphemeralQuery(this.createQuery, question);

    try {
      return await withinDeadline(
        this.scheduler,
        question.timeoutMs,
        ask(ephemeral.query),
        () => new ClaudeTimeoutError(question.subject, question.what, question.timeoutMs),
      );
    } catch (error) {
      this.logger.warn(
        {
          op: question.op,
          layer: 'adapter',
          subject: question.subject,
          err: error,
          durationMs: Date.now() - startedAt,
        },
        `a query that only asks did not ${question.what}`,
      );
      throw error instanceof ClaudeTimeoutError
        ? error
        : new ClaudeUnavailableError(question.subject);
    } finally {
      ephemeral.close();
      this.capacity.release();
    }
  }
}
