import process from 'node:process';

import { createRootLogger } from '@shared/logging/logger';
import { COMMANDS, isDatabaseCommand } from './operations';
import { openDatabase } from './connection';
import { processEnvironment } from '../config/process-environment';
import { loadDatabaseConfig } from '../config/environment';

/**
 * The entry point behind `pnpm db`.
 *
 * It lives in the backend because the migrations and the purge do: one implementation of "bring
 * the schema up to date" and of "cut the trail back to its window", used by the boot and the job
 * and by the command alike. The script at `scripts/db.mjs` is the door.
 *
 * The result is **one JSON line on stdout**, for the script to read; the log goes to stderr, where
 * it cannot be mistaken for it. The exit code is the command's own: 0 only when it did what it was
 * asked — a purge that could not remove everything outside the window exits 1.
 */
const requested = process.argv[2] ?? '';

if (!isDatabaseCommand(requested)) {
  process.stderr.write(
    `unknown command "${requested}"; expected one of ${Object.keys(COMMANDS).join(', ')}\n`,
  );
  process.exit(2);
}

const config = loadDatabaseConfig(processEnvironment());
const logger = createRootLogger({ level: config.logLevel, service: 'db' }, process.stderr);
const { pool } = openDatabase(config.databaseUrl);

try {
  const outcome = await COMMANDS[requested]({
    pool,
    logger,
    retentionDays: config.audit.retentionDays,
  });
  process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
  process.exitCode = outcome.succeeded ? 0 : 1;
} finally {
  await pool.end();
}
