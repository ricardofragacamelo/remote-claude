import { resolve } from 'node:path';
import { z } from 'zod';

import { parseEnvironment } from '@remote-claude/config';
import { PERMISSION_MODES } from '@domain/session';
import type { PermissionMode } from '@domain/session';

/**
 * Every variable the backend reads, with what it is for.
 *
 * There is no default anywhere in this schema on purpose: a missing or malformed variable stops
 * the process, with a message naming the variable and what was expected. A backend that starts
 * with a silent fallback is a backend that fails in production for a reason nobody can see —
 * docs/architecture/shared/07-repository-layout.md#configuração-e-segredo.
 */
const port = z.coerce.number().int().min(1).max(65_535);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  RC_BACKEND_PORT: port,
  RC_WEB_PORT: port,
  DATABASE_URL: z.string().min(1).startsWith('postgres'),
  OIDC_ISSUER: z.url(),
  OIDC_AUDIENCE: z.string().min(1),
  OIDC_CLIENT_ID_WEB: z.string().min(1),
  OIDC_CLIENT_ID_MOBILE: z.string().min(1),
  OIDC_SCOPES: z.string().min(1),
  RC_WORKSPACE_ALLOWLIST_FILE: z.string().min(1),
  RC_SESSION_MAX_CONCURRENT: z.coerce.number().int().min(1).max(100),
  RC_SESSION_MAX_TURNS: z.coerce.number().int().min(1),
  RC_SESSION_MAX_BUDGET_USD: z.coerce.number().positive(),
  RC_SESSION_DEFAULT_MODEL: z.string().min(1),
  RC_SESSION_DEFAULT_PERMISSION_MODE: z.enum(PERMISSION_MODES),
  RC_PERMISSION_TIMEOUT_MS: z.coerce.number().int().positive(),
  RC_PERMISSION_EXTENSION_MS: z.coerce.number().int().positive(),
  RC_PERMISSION_MAX_EXTENSIONS: z.coerce.number().int().min(0),
  RC_PERMISSION_RULE_LIFETIME_MS: z.coerce.number().int().positive(),
  RC_CHECKPOINT_DIR: z.string().min(1),
  RC_CHECKPOINT_MAX_FILE_BYTES: z.coerce.number().int().positive(),
  RC_CHECKPOINT_MAX_STORE_BYTES: z.coerce.number().int().positive(),
});

/** The shape the schema accepts, before validation. */
export type RawEnvironment = Record<keyof z.infer<typeof environmentSchema>, string | undefined>;

/** The validated configuration, in the vocabulary of the code rather than of the shell. */
export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly logLevel: string;
  readonly port: number;
  readonly webOrigin: string;
  readonly databaseUrl: string;
  /** Absolute path of the workspace allowlist file — the one piece of config that is not a
   *  variable, because it is the security boundary of the product (D-02). */
  readonly workspaceAllowlistFile: string;
  /** What a session may cost this installation, and what it opens with. */
  readonly session: {
    /**
     * How many sessions may run at once.
     *
     * A concrete number and not a guess: ~222 MB of RSS and exactly one subprocess per session
     * were measured, so ten is about 2.2 GB. Deriving it from the machine's RAM is a later plan;
     * until then it is explicit, and the refusal beyond it is an ordinary path
     * (docs/plans/01-live-session/decisions.md#d-05).
     */
    readonly maxConcurrent: number;
    readonly limits: { readonly maxBudgetUsd: number; readonly maxTurns: number };
    readonly defaults: { readonly model: string; readonly permissionMode: PermissionMode };
  };

  /**
   * The numbers a permission request lives by.
   *
   * All four from configuration, none of them ever from a client. Our timeout is the only
   * protection against a session that hangs for ever — the CLI imposes none, measured — so a
   * client that could choose it could switch it off
   * ([D-09](../../../../docs/plans/01-live-session/decisions.md)).
   */
  readonly permission: {
    readonly timeoutMs: number;
    readonly extensionMs: number;
    readonly maxExtensions: number;
    readonly ruleLifetimeMs: number;
  };

  /** Where the undo snapshots live, and how much room they may take. */
  readonly checkpoints: {
    readonly directory: string;
    readonly maxFileBytes: number;
    readonly maxStoreBytes: number;
  };

  readonly oidc: {
    readonly issuer: string;
    readonly audience: string;
    readonly webClientId: string;
    readonly mobileClientId: string;
    readonly scopes: string;
  };
}

/**
 * Validates the environment, or refuses to produce a configuration.
 *
 * @param source the variables as read from the process — passed in, so the test does not have to
 *   mutate the real environment to exercise a missing variable
 * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
 */
export function loadConfig(source: RawEnvironment): AppConfig {
  const env = parseEnvironment(environmentSchema, source);

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.RC_BACKEND_PORT,
    webOrigin: `http://localhost:${String(env.RC_WEB_PORT)}`,
    databaseUrl: env.DATABASE_URL,
    workspaceAllowlistFile: resolve(env.RC_WORKSPACE_ALLOWLIST_FILE),
    session: {
      maxConcurrent: env.RC_SESSION_MAX_CONCURRENT,
      limits: {
        maxBudgetUsd: env.RC_SESSION_MAX_BUDGET_USD,
        maxTurns: env.RC_SESSION_MAX_TURNS,
      },
      defaults: {
        model: env.RC_SESSION_DEFAULT_MODEL,
        permissionMode: env.RC_SESSION_DEFAULT_PERMISSION_MODE,
      },
    },
    permission: {
      timeoutMs: env.RC_PERMISSION_TIMEOUT_MS,
      extensionMs: env.RC_PERMISSION_EXTENSION_MS,
      maxExtensions: env.RC_PERMISSION_MAX_EXTENSIONS,
      ruleLifetimeMs: env.RC_PERMISSION_RULE_LIFETIME_MS,
    },
    checkpoints: {
      directory: resolve(env.RC_CHECKPOINT_DIR),
      maxFileBytes: env.RC_CHECKPOINT_MAX_FILE_BYTES,
      maxStoreBytes: env.RC_CHECKPOINT_MAX_STORE_BYTES,
    },
    oidc: {
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_AUDIENCE,
      webClientId: env.OIDC_CLIENT_ID_WEB,
      mobileClientId: env.OIDC_CLIENT_ID_MOBILE,
      scopes: env.OIDC_SCOPES,
    },
  };
}

/** DI token of the validated configuration. */
export const APP_CONFIG = Symbol('AppConfig');
