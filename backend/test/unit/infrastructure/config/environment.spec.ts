import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '@remote-claude/config';
import {
  AUDIT_PURGE_MIN_INTERVAL_MS,
  RULE_LIFETIME_CEILING_MS,
  loadConfig,
  loadDatabaseConfig,
} from '@infra/config/environment';
import type { RawEnvironment } from '@infra/config/environment';

const complete: RawEnvironment = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'debug',
  RC_BACKEND_PORT: '3000',
  RC_WEB_PORT: '5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
  OIDC_AUDIENCE: 'https://api.remote-claude.local',
  OIDC_CLIENT_ID_WEB: 'remote-claude-web',
  OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
  OIDC_SCOPES: 'openid profile email offline_access',
  RC_WORKSPACE_ALLOWLIST_FILE: '/etc/remote-claude/workspaces.yaml',
  RC_SESSION_MAX_CONCURRENT: '10',
  RC_SESSION_MAX_TURNS: '100',
  RC_SESSION_MAX_BUDGET_USD: '10',
  RC_SESSION_DEFAULT_MODEL: 'claude-sonnet-5',
  RC_SESSION_DEFAULT_PERMISSION_MODE: 'default',
  RC_PERMISSION_TIMEOUT_MS: '120000',
  RC_PERMISSION_EXTENSION_MS: '120000',
  RC_PERMISSION_MAX_EXTENSIONS: '3',
  RC_PERMISSION_RULE_LIFETIME_MS: '28800000',
  RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: '7776000000',
  RC_PERMISSION_RULE_MAX_LIFETIME_MS: '7776000000',
  RC_PUSH_ENDPOINT: 'https://push.example.test/v1/messages:send',
  RC_PUSH_CREDENTIALS_FILE: '/etc/remote-claude/push.json',
  RC_PUSH_SCOPE: 'https://push.example.test/auth/messaging',
  RC_CHECKPOINT_DIR: '/var/lib/remote-claude/checkpoints',
  RC_CHECKPOINT_MAX_FILE_BYTES: '5242880',
  RC_CHECKPOINT_MAX_STORE_BYTES: '524288000',
  RC_AUDIT_RETENTION_DAYS: '90',
  RC_AUDIT_PURGE_INTERVAL_MS: '86400000',
};

/** The complete environment, with one variable changed or removed. */
function withChange(change: Partial<RawEnvironment>): RawEnvironment {
  return { ...complete, ...change };
}

describe('loadConfig', () => {
  it('translates the environment into the vocabulary of the code', () => {
    const config = loadConfig(complete);

    expect(config).toEqual({
      nodeEnv: 'test',
      logLevel: 'debug',
      port: 3000,
      webOrigin: 'http://localhost:5173',
      databaseUrl: 'postgresql://u:p@localhost:5432/db',
      workspaceAllowlistFile: '/etc/remote-claude/workspaces.yaml',
      session: {
        maxConcurrent: 10,
        limits: { maxBudgetUsd: 10, maxTurns: 100 },
        defaults: { model: 'claude-sonnet-5', permissionMode: 'default' },
      },
      permission: {
        timeoutMs: 120_000,
        extensionMs: 120_000,
        maxExtensions: 3,
        ruleLifetimeMs: 28_800_000,
        ruleDefaultLifetimeMs: 7_776_000_000,
        ruleMaxLifetimeMs: 7_776_000_000,
      },
      push: {
        endpoint: 'https://push.example.test/v1/messages:send',
        credentialsFile: '/etc/remote-claude/push.json',
        scope: 'https://push.example.test/auth/messaging',
      },
      audit: { retentionDays: 90, purgeIntervalMs: 86_400_000 },
      checkpoints: {
        directory: '/var/lib/remote-claude/checkpoints',
        maxFileBytes: 5_242_880,
        maxStoreBytes: 524_288_000,
      },
      oidc: {
        issuer: 'http://localhost:8180/realms/remote-claude',
        audience: 'https://api.remote-claude.local',
        webClientId: 'remote-claude-web',
        mobileClientId: 'remote-claude-mobile',
        scopes: 'openid profile email offline_access',
      },
    });
  });

  it.each([
    'NODE_ENV',
    'LOG_LEVEL',
    'RC_BACKEND_PORT',
    'RC_WEB_PORT',
    'DATABASE_URL',
    'OIDC_ISSUER',
    'OIDC_AUDIENCE',
    'OIDC_CLIENT_ID_WEB',
    'OIDC_CLIENT_ID_MOBILE',
    'OIDC_SCOPES',
    'RC_WORKSPACE_ALLOWLIST_FILE',
    'RC_SESSION_MAX_CONCURRENT',
    'RC_SESSION_MAX_TURNS',
    'RC_SESSION_MAX_BUDGET_USD',
    'RC_SESSION_DEFAULT_MODEL',
    'RC_SESSION_DEFAULT_PERMISSION_MODE',
    'RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS',
    'RC_PERMISSION_RULE_MAX_LIFETIME_MS',
    'RC_CHECKPOINT_DIR',
    'RC_CHECKPOINT_MAX_FILE_BYTES',
    'RC_CHECKPOINT_MAX_STORE_BYTES',
    'RC_AUDIT_RETENTION_DAYS',
    'RC_AUDIT_PURGE_INTERVAL_MS',
  ] as const)('refuses to produce a configuration when %s is missing', (variable) => {
    expect(() => loadConfig(withChange({ [variable]: undefined }))).toThrow(ConfigurationError);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['RC_BACKEND_PORT', 'nope'],
    ['RC_BACKEND_PORT', '0'],
    ['RC_BACKEND_PORT', '65536'],
    ['DATABASE_URL', 'mysql://localhost/db'],
    ['OIDC_ISSUER', 'not-a-url'],
    // Numbers that carry a security decision refuse their own nonsense rather than clamping it:
    // a zero limit is a backend that opens no session, and a negative one is a bug wearing a
    // configuration's clothes.
    ['RC_SESSION_MAX_CONCURRENT', '0'],
    ['RC_SESSION_MAX_CONCURRENT', 'many'],
    ['RC_SESSION_MAX_TURNS', '0'],
    ['RC_SESSION_MAX_BUDGET_USD', '0'],
    ['RC_SESSION_DEFAULT_PERMISSION_MODE', 'yolo'],
    ['RC_CHECKPOINT_MAX_FILE_BYTES', '0'],
    ['RC_CHECKPOINT_MAX_STORE_BYTES', '-1'],
    ['RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS', '0'],
    ['RC_PERMISSION_RULE_MAX_LIFETIME_MS', '0'],
  ] as const)('refuses %s set to %s', (variable, value) => {
    expect(() => loadConfig(withChange({ [variable]: value }))).toThrow(ConfigurationError);
  });

  describe('the lifetime of a persisted rule — S-60', () => {
    it('refuses a ceiling past what the code allows, so no variable makes a rule permanent', () => {
      const overCeiling = String(RULE_LIFETIME_CEILING_MS + 1);

      expect(() =>
        loadConfig(
          withChange({
            RC_PERMISSION_RULE_MAX_LIFETIME_MS: overCeiling,
            RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: '1000',
          }),
        ),
      ).toThrow(ConfigurationError);
    });

    it('accepts a ceiling exactly at what the code allows', () => {
      const atCeiling = String(RULE_LIFETIME_CEILING_MS);

      expect(
        loadConfig(withChange({ RC_PERMISSION_RULE_MAX_LIFETIME_MS: atCeiling })).permission
          .ruleMaxLifetimeMs,
      ).toBe(RULE_LIFETIME_CEILING_MS);
    });

    it('refuses a default above the ceiling, and names the variable', () => {
      // Every rule granted from an approval card would then be refused by the installation's own
      // ceiling: the product configured to reject its own default.
      expect.assertions(2);

      try {
        loadConfig(
          withChange({
            RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: '7776000001',
            RC_PERMISSION_RULE_MAX_LIFETIME_MS: '7776000000',
          }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).problems[0]).toContain(
          'RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS',
        );
      }
    });

    it('accepts a default equal to the ceiling', () => {
      expect(loadConfig(complete).permission.ruleDefaultLifetimeMs).toBe(7_776_000_000);
    });
  });

  describe('the retention of the trail — S-33', () => {
    it('refuses a window below the ninety-day floor, rather than raising it in silence', () => {
      expect(() => loadConfig(withChange({ RC_AUDIT_RETENTION_DAYS: '89' }))).toThrow(
        ConfigurationError,
      );
    });

    it('accepts the floor itself, and a longer window', () => {
      expect(loadConfig(withChange({ RC_AUDIT_RETENTION_DAYS: '90' })).audit.retentionDays).toBe(
        90,
      );
      expect(loadConfig(withChange({ RC_AUDIT_RETENTION_DAYS: '365' })).audit.retentionDays).toBe(
        365,
      );
    });

    it.each(['ninety', '90.5', '0', '-90', '36501'])('refuses a window of %s', (value) => {
      expect(() => loadConfig(withChange({ RC_AUDIT_RETENTION_DAYS: value }))).toThrow(
        ConfigurationError,
      );
    });
  });

  describe('the purge job — S-82', () => {
    it('switches the job off only with the literal word', () => {
      expect(
        loadConfig(withChange({ RC_AUDIT_PURGE_INTERVAL_MS: 'off' })).audit.purgeIntervalMs,
      ).toBeNull();
    });

    // Switched off by configuration, never by accident: a zero or an empty value is a mistake,
    // and a mistake stops the boot instead of quietly ending the retention promise.
    it.each(['0', '', 'OFF', 'false', String(AUDIT_PURGE_MIN_INTERVAL_MS - 1), '-1'])(
      'refuses an interval of "%s"',
      (value) => {
        expect(() => loadConfig(withChange({ RC_AUDIT_PURGE_INTERVAL_MS: value }))).toThrow(
          ConfigurationError,
        );
      },
    );

    it('accepts the shortest interval there is', () => {
      expect(
        loadConfig(withChange({ RC_AUDIT_PURGE_INTERVAL_MS: String(AUDIT_PURGE_MIN_INTERVAL_MS) }))
          .audit.purgeIntervalMs,
      ).toBe(60_000);
    });
  });

  describe('what `pnpm db` reads — D-22', () => {
    const database = {
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      RC_AUDIT_RETENTION_DAYS: '120',
    };

    it('needs the database, the log level and the window, and nothing else', () => {
      expect(loadDatabaseConfig(database)).toEqual({
        logLevel: 'info',
        databaseUrl: 'postgresql://u:p@localhost:5432/db',
        audit: { retentionDays: 120 },
      });
    });

    it('holds the command to the same floor as the boot — S-33', () => {
      expect(() => loadDatabaseConfig({ ...database, RC_AUDIT_RETENTION_DAYS: '89' })).toThrow(
        ConfigurationError,
      );
    });

    it.each(['LOG_LEVEL', 'DATABASE_URL', 'RC_AUDIT_RETENTION_DAYS'] as const)(
      'refuses to run without %s',
      (variable) => {
        expect(() => loadDatabaseConfig({ ...database, [variable]: undefined })).toThrow(
          ConfigurationError,
        );
      },
    );
  });

  it('makes the allowlist path absolute, whatever the working directory turns out to be', () => {
    // The backend is started from different directories by `pnpm dev`, by the e2e script and by a
    // service manager. A relative path that resolved differently in each would be an allowlist
    // that means something different depending on who started the process.
    const config = loadConfig(withChange({ RC_WORKSPACE_ALLOWLIST_FILE: 'infra/allowlist.yaml' }));

    expect(config.workspaceAllowlistFile.startsWith('/')).toBe(true);
    expect(config.workspaceAllowlistFile.endsWith('/infra/allowlist.yaml')).toBe(true);
  });

  it('accepts the boundary ports', () => {
    expect(loadConfig(withChange({ RC_BACKEND_PORT: '1' })).port).toBe(1);
    expect(loadConfig(withChange({ RC_BACKEND_PORT: '65535' })).port).toBe(65_535);
  });

  it('names the variable and what was expected, so the message is actionable', () => {
    expect.assertions(2);

    try {
      loadConfig(withChange({ RC_BACKEND_PORT: 'nope' }));
    } catch (error) {
      expect((error as ConfigurationError).problems[0]).toContain('RC_BACKEND_PORT');
      expect((error as ConfigurationError).message).toContain('invalid environment');
    }
  });

  it('lists every problem at once, instead of one boot attempt per mistake', () => {
    expect.assertions(1);

    try {
      loadConfig(withChange({ NODE_ENV: undefined, LOG_LEVEL: undefined }));
    } catch (error) {
      expect((error as ConfigurationError).problems).toHaveLength(2);
    }
  });
});
