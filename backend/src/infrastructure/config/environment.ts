import { resolve } from 'node:path';
import { z } from 'zod';

import { parseEnvironment } from '@remote-claude/config';
import { AUDIT_RETENTION_FLOOR_DAYS } from '@domain/audit';
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

/**
 * The longest any persisted permission rule may live, whatever the environment says.
 *
 * A ceiling that an environment variable could raise without bound would not be a ceiling: set to
 * a century, every rule is a permanent grant. The variable picks a number **under** this one, and a
 * number above it stops the boot ([D-02](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export const RULE_LIFETIME_CEILING_MS = 365 * 24 * 60 * 60 * 1000;

const ruleLifetime = z.coerce.number().int().positive().max(RULE_LIFETIME_CEILING_MS);

/**
 * The shortest interval the purge job may run at.
 *
 * A minute: the cadence is not what keeps the floor — the trigger is — and a job configured to run
 * every few milliseconds would be a job that holds a connection for ever.
 */
export const AUDIT_PURGE_MIN_INTERVAL_MS = 60_000;

/**
 * `off`, or how often the purge job runs.
 *
 * Switching the job off is the literal word and nothing else. `0`, an empty value or a missing
 * variable stop the boot: the retention promise may be switched off by configuration, never by a
 * number typed wrong ([D-22](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
const purgeInterval = z.union([
  z.literal('off'),
  z.coerce.number().int().min(AUDIT_PURGE_MIN_INTERVAL_MS),
]);

/**
 * The shortest idle TTL a session may be given.
 *
 * A second, and only so a suite can watch one expire: the number the product runs with is thirty
 * minutes (D-02). Zero would close every session between two turns.
 */
export const SESSION_IDLE_TTL_FLOOR_MS = 1_000;

/**
 * `off`, or where the process writes its pid.
 *
 * The development stack turns it on so `pnpm allowlist` can find the running backend and send it
 * `SIGHUP` (06 · D-15). Off is the literal word, like the purge job's: a missing variable still
 * stops the boot.
 */
const pidFile = z.union([z.literal('off'), z.string().min(1)]);

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
  RC_PID_FILE: pidFile,
  RC_SESSION_MAX_CONCURRENT: z.coerce.number().int().min(1).max(100),
  RC_SESSION_MIN_CONCURRENT: z.coerce.number().int().min(1).max(100),
  RC_SESSION_MEMORY_FRACTION: z.coerce.number().positive().max(1),
  RC_SESSION_MEMORY_MB: z.coerce.number().int().min(64),
  RC_SESSION_IDLE_TTL_MS: z.coerce.number().int().min(SESSION_IDLE_TTL_FLOOR_MS),
  RC_WS_MAX_FRAMES_PER_SECOND: z.coerce.number().int().min(1),
  RC_WS_MAX_FRAME_BYTES: z.coerce.number().int().min(1_024),
  RC_WS_MAX_ATTACHED_SESSIONS: z.coerce.number().int().min(1),
  RC_SESSION_MAX_TURNS: z.coerce.number().int().min(1),
  RC_SESSION_MAX_BUDGET_USD: z.coerce.number().positive(),
  RC_SESSION_DEFAULT_MODEL: z.string().min(1),
  RC_SESSION_DEFAULT_PERMISSION_MODE: z.enum(PERMISSION_MODES),
  RC_PERMISSION_TIMEOUT_MS: z.coerce.number().int().positive(),
  RC_PERMISSION_EXTENSION_MS: z.coerce.number().int().positive(),
  RC_PERMISSION_MAX_EXTENSIONS: z.coerce.number().int().min(0),
  RC_PERMISSION_RULE_LIFETIME_MS: z.coerce.number().int().positive(),
  RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: ruleLifetime,
  RC_PERMISSION_RULE_MAX_LIFETIME_MS: ruleLifetime,
  RC_PUSH_ENDPOINT: z.url(),
  RC_PUSH_CREDENTIALS_FILE: z.string().min(1),
  RC_PUSH_SCOPE: z.string().min(1),
  RC_CHECKPOINT_DIR: z.string().min(1),
  RC_CHECKPOINT_MAX_FILE_BYTES: z.coerce.number().int().positive(),
  RC_CHECKPOINT_MAX_STORE_BYTES: z.coerce.number().int().positive(),
  // The floor is not a preference: a window below it stops the boot, rather than being raised to
  // it in silence. A floor that a variable can lower is not a floor.
  RC_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(AUDIT_RETENTION_FLOOR_DAYS).max(36_500),
  RC_AUDIT_PURGE_INTERVAL_MS: purgeInterval,
});

/**
 * The relations between variables that the variables alone cannot state.
 *
 * A default above the ceiling would make every rule granted from an approval card a rule the
 * installation refuses — the product would be configured to reject its own default.
 */
const consistentEnvironment = environmentSchema
  .refine(
    (env) => env.RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS <= env.RC_PERMISSION_RULE_MAX_LIFETIME_MS,
    {
      path: ['RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS'],
      message: 'must not be greater than RC_PERMISSION_RULE_MAX_LIFETIME_MS',
    },
  )
  // A floor above the ceiling is a capacity nobody can compute: refused at boot, not resolved in
  // favour of one of the two in silence.
  .refine((env) => env.RC_SESSION_MIN_CONCURRENT <= env.RC_SESSION_MAX_CONCURRENT, {
    path: ['RC_SESSION_MIN_CONCURRENT'],
    message: 'must not be greater than RC_SESSION_MAX_CONCURRENT',
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
  /** Absolute path the process writes its pid to, or `null` when it writes none. */
  readonly pidFile: string | null;
  /** What a session may cost this installation, and what it opens with. */
  readonly session: {
    /**
     * What the number of concurrent sessions is derived from.
     *
     * Not the number itself: that comes out of the machine's RAM at boot, held between the floor
     * and the ceiling — ~222 MB of RSS and exactly one subprocess per session were measured, and a
     * fixed ten is 2.2 GB on a laptop with 4 GB as much as on one with 64
     * ([D-01](../../../../docs/plans/05-hardening-operations/decisions.md)).
     */
    readonly capacity: {
      readonly floor: number;
      readonly ceiling: number;
      readonly memoryFraction: number;
      readonly perSessionBytes: number;
    };

    /** How long a session may sit with nothing happening before it is closed (D-02). */
    readonly idleTtlMs: number;
    readonly limits: { readonly maxBudgetUsd: number; readonly maxTurns: number };
    readonly defaults: { readonly model: string; readonly permissionMode: PermissionMode };
  };

  /**
   * What one WebSocket connection may send, announced in `connection.ready`.
   *
   * From configuration because a client that knows the limit does not have to find it by being
   * refused, and because the limit that fits a laptop is not the one that fits a shared box.
   */
  readonly websocket: {
    readonly maxFramesPerSecond: number;
    readonly maxFrameBytes: number;
    readonly maxAttachedSessions: number;
  };

  /**
   * The numbers a permission request lives by.
   *
   * All of them from configuration, none of them ever from a client. Our timeout is the only
   * protection against a session that hangs for ever — the CLI imposes none, measured — so a
   * client that could choose it could switch it off
   * ([D-09](../../../../docs/plans/01-live-session/decisions.md)).
   */
  readonly permission: {
    readonly timeoutMs: number;
    readonly extensionMs: number;
    readonly maxExtensions: number;
    readonly ruleLifetimeMs: number;
    /** How long a `project` or `always` rule lives when nobody said how long. */
    readonly ruleDefaultLifetimeMs: number;
    /** The longest one may live — itself bounded by {@link RULE_LIFETIME_CEILING_MS}. */
    readonly ruleMaxLifetimeMs: number;
  };

  /**
   * How a notification reaches a phone.
   *
   * Three values and not one line of vendor anywhere: the endpoint to post to, the file holding
   * the service account that signs the exchange, and the scope that exchange asks for. Changing
   * provider is changing these three ([AGENTS.md](../../../../AGENTS.md)).
   *
   * The credential is a **file** rather than a variable, like the workspace allowlist and for a
   * related reason: a private key in an environment variable is a private key in every process
   * listing and every crash dump. Unlike the allowlist, a missing one does not stop the boot —
   * push is a best effort beside a deadline that is not, and a backend that refused to start
   * because nobody has set up notifications yet would trade the product for one of its
   * conveniences.
   */
  readonly push: {
    readonly endpoint: string;
    readonly credentialsFile: string;
    readonly scope: string;
  };

  /**
   * How long the trail is kept, and how often it is cut back to that.
   *
   * `purgeIntervalMs` is `null` when the job is switched off — on purpose, and said out loud at
   * boot, because the retention then depends on somebody running `pnpm db purge`.
   */
  readonly audit: {
    readonly retentionDays: number;
    readonly purgeIntervalMs: number | null;
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
  const env = parseEnvironment(consistentEnvironment, source);

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    port: env.RC_BACKEND_PORT,
    webOrigin: `http://localhost:${String(env.RC_WEB_PORT)}`,
    databaseUrl: env.DATABASE_URL,
    workspaceAllowlistFile: resolve(env.RC_WORKSPACE_ALLOWLIST_FILE),
    pidFile: env.RC_PID_FILE === 'off' ? null : resolve(env.RC_PID_FILE),
    session: {
      capacity: {
        floor: env.RC_SESSION_MIN_CONCURRENT,
        ceiling: env.RC_SESSION_MAX_CONCURRENT,
        memoryFraction: env.RC_SESSION_MEMORY_FRACTION,
        perSessionBytes: env.RC_SESSION_MEMORY_MB * 1024 * 1024,
      },
      idleTtlMs: env.RC_SESSION_IDLE_TTL_MS,
      limits: {
        maxBudgetUsd: env.RC_SESSION_MAX_BUDGET_USD,
        maxTurns: env.RC_SESSION_MAX_TURNS,
      },
      defaults: {
        model: env.RC_SESSION_DEFAULT_MODEL,
        permissionMode: env.RC_SESSION_DEFAULT_PERMISSION_MODE,
      },
    },
    websocket: {
      maxFramesPerSecond: env.RC_WS_MAX_FRAMES_PER_SECOND,
      maxFrameBytes: env.RC_WS_MAX_FRAME_BYTES,
      maxAttachedSessions: env.RC_WS_MAX_ATTACHED_SESSIONS,
    },
    permission: {
      timeoutMs: env.RC_PERMISSION_TIMEOUT_MS,
      extensionMs: env.RC_PERMISSION_EXTENSION_MS,
      maxExtensions: env.RC_PERMISSION_MAX_EXTENSIONS,
      ruleLifetimeMs: env.RC_PERMISSION_RULE_LIFETIME_MS,
      ruleDefaultLifetimeMs: env.RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS,
      ruleMaxLifetimeMs: env.RC_PERMISSION_RULE_MAX_LIFETIME_MS,
    },
    push: {
      endpoint: env.RC_PUSH_ENDPOINT,
      credentialsFile: resolve(env.RC_PUSH_CREDENTIALS_FILE),
      scope: env.RC_PUSH_SCOPE,
    },
    audit: {
      retentionDays: env.RC_AUDIT_RETENTION_DAYS,
      purgeIntervalMs:
        env.RC_AUDIT_PURGE_INTERVAL_MS === 'off' ? null : env.RC_AUDIT_PURGE_INTERVAL_MS,
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

/**
 * The variables `pnpm db` reads — validated by the same schema as the boot, and no others.
 *
 * Purging old rows needs a database and a window, not a push endpoint; demanding the backend's
 * whole environment would make the command fail for the wrong reason, and exactly when the backend
 * is down ([D-22](../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
const databaseEnvironmentSchema = environmentSchema.pick({
  LOG_LEVEL: true,
  DATABASE_URL: true,
  RC_AUDIT_RETENTION_DAYS: true,
});

/** The shape the database command accepts, before validation. */
export type RawDatabaseEnvironment = Pick<
  RawEnvironment,
  keyof z.infer<typeof databaseEnvironmentSchema>
>;

/** What the database command is configured with. */
export interface DatabaseConfig {
  readonly logLevel: string;
  readonly databaseUrl: string;
  readonly audit: { readonly retentionDays: number };
}

/**
 * Validates what `pnpm db` needs, or refuses to produce a configuration.
 *
 * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
 */
export function loadDatabaseConfig(source: RawDatabaseEnvironment): DatabaseConfig {
  const env = parseEnvironment(databaseEnvironmentSchema, source);

  return {
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    audit: { retentionDays: env.RC_AUDIT_RETENTION_DAYS },
  };
}

/** DI token of the validated configuration. */
export const APP_CONFIG = Symbol('AppConfig');
