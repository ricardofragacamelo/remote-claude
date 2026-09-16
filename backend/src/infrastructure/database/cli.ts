import process from 'node:process';

import { COMMANDS, isDatabaseCommand } from './operations';
import { openDatabase } from './connection';
import { processEnvironment } from '../config/process-environment';
import { loadConfig } from '../config/environment';

/**
 * The entry point behind `pnpm db`.
 *
 * It lives in the backend because the migrations do: one implementation of "bring the schema up to
 * date", used by the boot and by the command alike. The script at `scripts/db.mjs` is the door.
 */
const requested = process.argv[2] ?? '';

if (!isDatabaseCommand(requested)) {
  process.stderr.write(
    `unknown command "${requested}"; expected one of ${Object.keys(COMMANDS).join(', ')}\n`,
  );
  process.exit(2);
}

const { pool } = openDatabase(loadConfig(processEnvironment()).databaseUrl);

try {
  const result = await COMMANDS[requested](pool);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
