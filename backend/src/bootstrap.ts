import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { ShutdownSignal } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '@infra/config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { NestLoggerBridge } from '@shared/logging/nest-logger';

/** The repository's own `.env`, from this file's location. */
export function repositoryDotEnv(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
}

/**
 * Loads the repository `.env` when the process was not started by `pnpm dev`.
 *
 * The startup script already exports it; running `pnpm --filter backend dev` on its own does not,
 * and a backend that refuses to start because nobody sourced a file is friction with no upside.
 *
 * @param file the file to load; a parameter so a test can point it somewhere it owns rather than
 *   at whatever the machine happens to have
 * @returns whether there was one to load
 */
export function loadDotEnv(file: string = repositoryDotEnv()): boolean {
  const loaded = fs.existsSync(file);

  if (loaded) {
    process.loadEnvFile(file);
  }

  forgetEmptyClaudeConfigDir();
  return loaded;
}

/**
 * Drops a `CLAUDE_CONFIG_DIR` that is set to nothing — from the file above, or exported by
 * `pnpm dev`.
 *
 * `.env.example` declares it empty to mean "the default, `~/.claude`", and this backend reads it
 * that way. **The Claude CLI does not**: it inherits the variable, takes the empty string for a
 * directory, finds no login there and answers every prompt with "Not logged in" as an ordinary
 * turn. The two halves also disagreed about which `.claude.json` is live, so the trust mark was
 * cleared in a file the CLI was not reading. Found by `pnpm test:e2e:live` (plan 04, F5).
 *
 * @param env the environment the CLI will inherit; a parameter so a test owns what it changes
 */
export function forgetEmptyClaudeConfigDir(env: NodeJS.ProcessEnv = process.env): void {
  if (env['CLAUDE_CONFIG_DIR']?.trim() === '') {
    delete env['CLAUDE_CONFIG_DIR'];
  }
}

/**
 * The signals that shut the application down: every one Nest knows, **except** `SIGHUP`.
 *
 * `SIGHUP` reloads the workspace allowlist (06 · D-15). Left in this list, Nest's hook would close
 * the application on it and then re-raise it — the operator adding a folder would take the backend,
 * its sockets and every live session down with it (plan 06, S-180).
 */
export const SHUTDOWN_SIGNALS: readonly ShutdownSignal[] = Object.values(ShutdownSignal).filter(
  (signal) => signal !== ShutdownSignal.SIGHUP,
);

/**
 * Everything a built application needs before it listens.
 *
 * Written once because there is more than one way into this process: `main.ts` is the product, and
 * the end-to-end suite starts the same application with a scripted Agent SDK behind it. Two copies
 * of this block would be two places for the CORS origin or the WebSocket adapter to differ — and
 * a suite running against an application configured differently from the product proves nothing
 * about the product.
 *
 * @returns the port it was configured to listen on
 */
export function configureApp(app: INestApplication): number {
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get<Logger>(LOGGER);

  app.useLogger(new NestLoggerBridge(logger));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.enableShutdownHooks([...SHUTDOWN_SIGNALS]);

  return config.port;
}

/** What the product binds to. Every interface, because it is reached from another device. */
export const ALL_INTERFACES = '0.0.0.0';

/**
 * Starts listening, and says so on the one line an operator greps for.
 *
 * `host` has no default on purpose. The product binds everything, because the phone that approves
 * a permission is not on this machine; a suite binds the loopback, so two runs on one box cannot
 * reach each other's application. A default would make one of the two the silent case, and the
 * silent case is the one nobody checks.
 */
export async function listen(app: INestApplication, port: number, host: string): Promise<void> {
  await app.listen(port, host);

  app
    .get<Logger>(LOGGER)
    .info({ op: 'server.start', layer: 'infrastructure', port }, 'backend listening');
}
