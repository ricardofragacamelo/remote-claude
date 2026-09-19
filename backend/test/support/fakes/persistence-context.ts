import type { PersistenceContext } from '@infra/database/persistence-context';
import type { Database } from '@infra/database/connection';
import type { Clock } from '@domain/shared';
import type { Logger } from '@shared/logging/logger';
import { FixedClock } from './fixed-clock';
import { RecordingLogger } from './recording-logger';

/** The three things a repository is given, with the two a test rarely cares about defaulted. */
export function aPersistenceContext(
  db: Database,
  overrides: { clock?: Clock; logger?: Logger } = {},
): PersistenceContext {
  return {
    db,
    clock: overrides.clock ?? new FixedClock(new Date('2026-09-18T12:00:00.000Z')),
    logger: overrides.logger ?? new RecordingLogger().logger,
  };
}
