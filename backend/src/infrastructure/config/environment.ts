import { z } from 'zod';

import { parseEnvironment } from '@remote-claude/config';

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
