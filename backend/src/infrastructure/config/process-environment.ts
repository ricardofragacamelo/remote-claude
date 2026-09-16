import type { RawEnvironment } from './environment';

/**
 * The variables, read one by one and by name.
 *
 * Handing the whole `process.env` to the schema would work and would be worse: `pnpm verify`
 * checks that every variable the code reads is declared in `.env.example`, and it finds them by
 * looking for exactly these reads. A wholesale read is invisible to that check.
 */
export function processEnvironment(): RawEnvironment {
  return {
    NODE_ENV: process.env['NODE_ENV'],
    LOG_LEVEL: process.env['LOG_LEVEL'],
    RC_BACKEND_PORT: process.env['RC_BACKEND_PORT'],
    RC_WEB_PORT: process.env['RC_WEB_PORT'],
    DATABASE_URL: process.env['DATABASE_URL'],
    OIDC_ISSUER: process.env['OIDC_ISSUER'],
    OIDC_AUDIENCE: process.env['OIDC_AUDIENCE'],
    OIDC_CLIENT_ID_WEB: process.env['OIDC_CLIENT_ID_WEB'],
    OIDC_CLIENT_ID_MOBILE: process.env['OIDC_CLIENT_ID_MOBILE'],
    OIDC_SCOPES: process.env['OIDC_SCOPES'],
  };
}
