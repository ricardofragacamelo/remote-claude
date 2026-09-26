import type pg from 'pg';

import { UlidGenerator } from '@shared/ids/ulid-generator';
import type { Logger } from '@shared/logging/logger';
import { SystemClock } from '@shared/time/system-clock';
import { createAuditPurge, failureMessage, summarisePurge } from './audit-purge';
import type { AuditPurgeSummary } from './audit-purge';
import { migrate } from './migrator';

/** The owner the seed data belongs to. Matches the test user of the local identity realm. */
export const SEED_OWNER = 'seed|local-developer';

/** Sessions the seed plants, so a fresh database is not an empty screen. */
const SEED_SESSIONS = [
  { id: '01J0SEED000000000000000001', pingCount: 3 },
  { id: '01J0SEED000000000000000002', pingCount: 0 },
];

/** What an operation did, for the script to report. */
export interface DatabaseOperationResult {
  readonly applied: readonly string[];
  readonly seeded: number;
}

/** Brings the schema up to date. Applying twice applies nothing the second time. */
export async function runMigrate(pool: pg.Pool): Promise<DatabaseOperationResult> {
  return { applied: await migrate(pool), seeded: 0 };
}

/**
 * Plants the demo data.
 *
 * Idempotent: running it twice leaves the same rows, because the command people actually use every
 * day is `reset`, and a seed that fails the second time makes `reset` a coin toss.
 */
export async function runSeed(pool: pg.Pool): Promise<DatabaseOperationResult> {
  for (const session of SEED_SESSIONS) {
    await pool.query(
      `INSERT INTO "diag_sessions" ("id", "owner_id", "opened_at", "last_pinged_at", "ping_count")
       VALUES ($1, $2, now(), now(), $3)
       ON CONFLICT ("id") DO NOTHING`,
      [session.id, SEED_OWNER, session.pingCount],
    );
  }

  return { applied: [], seeded: SEED_SESSIONS.length };
}

/**
 * Drops everything, migrates and seeds.
 *
 * This is the one people run daily, and it is exactly the sequence nobody remembers in the right
 * order — which is why it is a command and not a paragraph in a README.
 */
export async function runReset(pool: pg.Pool): Promise<DatabaseOperationResult> {
  await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE');
  await pool.query('CREATE SCHEMA "public"');

  const migrated = await runMigrate(pool);
  const seeded = await runSeed(pool);

  return { applied: migrated.applied, seeded: seeded.seeded };
}

/** What a command runs against. */
export interface DatabaseCommandContext {
  readonly pool: pg.Pool;
  readonly logger: Logger;
  readonly retentionDays: number;
}

/** What `pnpm db purge` did, including the purge that never got as far as the lock. */
export type PurgeOperationResult = AuditPurgeSummary | NotStartedPurge;

/** The purge that could not start — the database unreachable, typically. Nothing was deleted. */
export interface NotStartedPurge {
  readonly status: 'notStarted';
  readonly triggeredBy: 'cli';
  readonly retentionDays: number;
  readonly error: string;
}

/**
 * Cuts the trail back to its retention window, from the command line.
 *
 * The **same** purge the job runs, assembled by the same function, under the same lock — it says
 * `cli` where the job says `job`, and that is the whole difference
 * ([D-07](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * A failure before the purge begins is not thrown at the caller: it is the one case where it is
 * certain that nothing was deleted, and the command owes the person that sentence.
 */
export async function runPurge(context: DatabaseCommandContext): Promise<PurgeOperationResult> {
  const purge = createAuditPurge({
    pool: context.pool,
    logger: context.logger,
    clock: new SystemClock(),
    ids: new UlidGenerator(),
    retentionDays: context.retentionDays,
  });

  try {
    return summarisePurge(await purge.execute('cli'));
  } catch (error) {
    context.logger.error(
      { op: 'audit.purge', layer: 'infrastructure', module: 'audit', err: error },
      'the retention purge failed before it began',
    );

    return {
      status: 'notStarted',
      triggeredBy: 'cli',
      retentionDays: context.retentionDays,
      error: failureMessage(error),
    };
  }
}

/** What a command came back with, and whether it did what it was asked. */
export interface DatabaseCommandOutcome {
  readonly succeeded: boolean;
  readonly result: DatabaseOperationResult | PurgeOperationResult;
}

/** A command that could only succeed or throw. */
function always(
  operation: (pool: pg.Pool) => Promise<DatabaseOperationResult>,
): (context: DatabaseCommandContext) => Promise<DatabaseCommandOutcome> {
  return async (context) => ({ succeeded: true, result: await operation(context.pool) });
}

/**
 * The commands `pnpm db` accepts.
 *
 * A purge that another purge beat to the lock **succeeded**: it had nothing to do that the other
 * was not already doing, and it said so (S-51). One that failed on either trail, or never started,
 * did not.
 */
export const COMMANDS = {
  migrate: always(runMigrate),
  purge: async (context: DatabaseCommandContext): Promise<DatabaseCommandOutcome> => {
    const result = await runPurge(context);
    return { succeeded: result.status === 'completed' || result.status === 'skipped', result };
  },
  reset: always(runReset),
  seed: always(runSeed),
} as const;

export type DatabaseCommand = keyof typeof COMMANDS;

/** Whether a word names one of them. */
export function isDatabaseCommand(value: string): value is DatabaseCommand {
  return Object.hasOwn(COMMANDS, value);
}
