import type pg from 'pg';

import { migrate } from './migrator';

/** The owner the seed data belongs to. Matches the test user of the local Keycloak realm. */
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

/** The commands `pnpm db` accepts. */
export const COMMANDS = {
  migrate: runMigrate,
  reset: runReset,
  seed: runSeed,
} as const;

export type DatabaseCommand = keyof typeof COMMANDS;

/** Whether a word names one of them. */
export function isDatabaseCommand(value: string): value is DatabaseCommand {
  return Object.hasOwn(COMMANDS, value);
}
