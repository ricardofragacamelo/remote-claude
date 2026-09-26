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
    RC_WORKSPACE_ALLOWLIST_FILE: process.env['RC_WORKSPACE_ALLOWLIST_FILE'],
    RC_SESSION_MAX_CONCURRENT: process.env['RC_SESSION_MAX_CONCURRENT'],
    RC_SESSION_MAX_TURNS: process.env['RC_SESSION_MAX_TURNS'],
    RC_SESSION_MAX_BUDGET_USD: process.env['RC_SESSION_MAX_BUDGET_USD'],
    RC_SESSION_DEFAULT_MODEL: process.env['RC_SESSION_DEFAULT_MODEL'],
    RC_SESSION_DEFAULT_PERMISSION_MODE: process.env['RC_SESSION_DEFAULT_PERMISSION_MODE'],
    RC_PERMISSION_TIMEOUT_MS: process.env['RC_PERMISSION_TIMEOUT_MS'],
    RC_PERMISSION_EXTENSION_MS: process.env['RC_PERMISSION_EXTENSION_MS'],
    RC_PERMISSION_MAX_EXTENSIONS: process.env['RC_PERMISSION_MAX_EXTENSIONS'],
    RC_PERMISSION_RULE_LIFETIME_MS: process.env['RC_PERMISSION_RULE_LIFETIME_MS'],
    RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: process.env['RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS'],
    RC_PERMISSION_RULE_MAX_LIFETIME_MS: process.env['RC_PERMISSION_RULE_MAX_LIFETIME_MS'],
    RC_PUSH_ENDPOINT: process.env['RC_PUSH_ENDPOINT'],
    RC_PUSH_CREDENTIALS_FILE: process.env['RC_PUSH_CREDENTIALS_FILE'],
    RC_PUSH_SCOPE: process.env['RC_PUSH_SCOPE'],
    RC_CHECKPOINT_DIR: process.env['RC_CHECKPOINT_DIR'],
    RC_CHECKPOINT_MAX_FILE_BYTES: process.env['RC_CHECKPOINT_MAX_FILE_BYTES'],
    RC_CHECKPOINT_MAX_STORE_BYTES: process.env['RC_CHECKPOINT_MAX_STORE_BYTES'],
    RC_AUDIT_RETENTION_DAYS: process.env['RC_AUDIT_RETENTION_DAYS'],
    RC_AUDIT_PURGE_INTERVAL_MS: process.env['RC_AUDIT_PURGE_INTERVAL_MS'],
  };
}
