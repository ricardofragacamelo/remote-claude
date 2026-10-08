import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  OIDC_ADDITIONAL_ISSUERS: '',
  OIDC_AUDIENCE: 'https://api.remote-claude.local',
  OIDC_CLIENT_ID_WEB: 'remote-claude-web',
  OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
  OIDC_SCOPES: 'openid profile email offline_access',
  RC_WORKSPACE_ALLOWLIST_FILE: '/etc/remote-claude/workspaces.yaml',
  RC_PID_FILE: 'off',
  RC_SESSION_MAX_CONCURRENT: '10',
  RC_SESSION_MIN_CONCURRENT: '1',
  RC_SESSION_MEMORY_FRACTION: '0.5',
  RC_SESSION_MEMORY_MB: '256',
  RC_SESSION_IDLE_TTL_MS: '1800000',
  RC_WS_MAX_FRAMES_PER_SECOND: '20',
  RC_WS_MAX_FRAME_BYTES: '65536',
  RC_WS_MAX_ATTACHED_SESSIONS: '16',
  RC_SESSION_MAX_TURNS: '100',
  RC_SESSION_MAX_BUDGET_USD: '10',
  RC_SESSION_DEFAULT_MODEL: 'claude-sonnet-5',
  RC_SESSION_DEFAULT_PERMISSION_MODE: 'default',
  RC_PERMISSION_TIMEOUT_MS: '120000',
  RC_QUESTION_TIMEOUT_MS: '600000',
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
  RC_FILES_TREE_MAX_ENTRIES: '5000',
  RC_FILES_LARGE_FILE_BYTES: '1048576',
  RC_FILES_MAX_EDIT_BYTES: '10485760',
  RC_FILES_COPY_MAX_ENTRIES: '10000',
  RC_FILES_COPY_MAX_BYTES: '104857600',
  RC_FILES_DELETE_COUNT_CAP: '10000',
  RC_FILES_WATCH_WINDOW_MS: '200',
  RC_FILES_WATCH_MAX_CHANGES: '500',
  RC_FILES_WATCH_MAX_PER_CONNECTION: '16',
  RC_FILES_WATCH_MAX_BUFFERED_BYTES: '1048576',
  RC_FILES_DOWNLOAD_MAX_BYTES: '209715200',
  RC_FILES_ARCHIVE_MAX_ENTRIES: '10000',
  RC_FILES_UPLOAD_MAX_BYTES: '104857600',
  RC_FILES_UPLOAD_MAX_ENTRIES: '1000',
  RC_FILES_UPLOAD_MAX_TOTAL_BYTES: '524288000',
  RC_FILES_HISTORY_DIR: '/var/lib/remote-claude/file-history',
  RC_FILES_HISTORY_MAX_FILE_BYTES: '10485760',
  RC_FILES_HISTORY_MAX_PER_FILE: '50',
  RC_FILES_HISTORY_MAX_STORE_BYTES: '536870912',
  RC_FILES_HISTORY_RETENTION_DAYS: '30',
  RC_FILES_HISTORY_MAX_BATCH_ENTRIES: '1000',
  RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS: '120',
  RC_ATTACHMENT_MAX_BYTES: '5242880',
  RC_ATTACHMENT_TTL_SECONDS: '3600',
  RC_ATTACHMENT_MEMORY_BYTES: '67108864',
  RC_CONTEXT_WARN_PERCENT: '25',
  RC_CONTEXT_DRAFT_WINDOW_TOKENS: '200000',
  RC_CONTEXT_MAX_BYTES: '8388608',
  RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES: '262144',
  RC_TRANSCRIPT_IMAGE_MAX_BYTES: '10485760',
  RC_TRANSCRIPT_FOLLOW_ACTIVE_MS: '1000',
  RC_TRANSCRIPT_FOLLOW_IDLE_MS: '10000',
  RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION: '4',
  RC_TRANSCRIPT_FOLLOW_MAX: '16',
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
      pidFile: null,
      session: {
        capacity: { floor: 1, ceiling: 10, memoryFraction: 0.5, perSessionBytes: 268_435_456 },
        idleTtlMs: 1_800_000,
        limits: { maxBudgetUsd: 10, maxTurns: 100 },
        defaults: { model: 'claude-sonnet-5', permissionMode: 'default' },
      },
      websocket: { maxFramesPerSecond: 20, maxFrameBytes: 65_536, maxAttachedSessions: 16 },
      permission: {
        timeoutMs: 120_000,
        questionTimeoutMs: 600_000,
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
      files: {
        treeEntries: 5_000,
        largeFileBytes: 1_048_576,
        maxEditBytes: 10_485_760,
        copyEntries: 10_000,
        copyBytes: 104_857_600,
        deleteCountCap: 10_000,
        // Twice the editing ceiling, and room for the folder, the path and the flags.
        requestBodyBytes: 2 * 10_485_760 + 64 * 1024,
        watch: {
          windowMs: 200,
          maxChangesPerEvent: 500,
          maxPerConnection: 16,
          maxBufferedBytes: 1_048_576,
        },
        transfer: {
          downloadMaxBytes: 209_715_200,
          archiveMaxEntries: 10_000,
          uploadMaxBytes: 104_857_600,
          uploadMaxEntries: 1_000,
          uploadMaxTotalBytes: 524_288_000,
        },
        history: {
          directory: '/var/lib/remote-claude/file-history',
          maxFileBytes: 10_485_760,
          maxPerFile: 50,
          maxStoreBytes: 536_870_912,
          retentionDays: 30,
          maxBatchEntries: 1_000,
        },
      },
      transcript: {
        activeWindowMs: 120_000,
        toolResultMaxBytes: 262_144,
        imageMaxBytes: 10_485_760,
        follow: { activeMs: 1_000, idleMs: 10_000, maxPerConnection: 4, max: 16 },
      },
      composer: {
        attachments: { maxBytes: 5_242_880, ttlMs: 3_600_000, memoryBytes: 67_108_864 },
        context: {
          contextWarnFraction: 0.25,
          draftWindowTokens: 200_000,
          contextMaxBytes: 8_388_608,
        },
      },
      oidc: {
        issuers: ['http://localhost:8180/realms/remote-claude'],
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
    'OIDC_ADDITIONAL_ISSUERS',
    'OIDC_AUDIENCE',
    'OIDC_CLIENT_ID_WEB',
    'OIDC_CLIENT_ID_MOBILE',
    'OIDC_SCOPES',
    'RC_WORKSPACE_ALLOWLIST_FILE',
    'RC_PID_FILE',
    'RC_SESSION_MAX_CONCURRENT',
    'RC_SESSION_MIN_CONCURRENT',
    'RC_SESSION_MEMORY_FRACTION',
    'RC_SESSION_MEMORY_MB',
    'RC_SESSION_IDLE_TTL_MS',
    'RC_WS_MAX_FRAMES_PER_SECOND',
    'RC_WS_MAX_FRAME_BYTES',
    'RC_WS_MAX_ATTACHED_SESSIONS',
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
    'RC_FILES_TREE_MAX_ENTRIES',
    'RC_FILES_LARGE_FILE_BYTES',
    'RC_FILES_MAX_EDIT_BYTES',
    'RC_FILES_COPY_MAX_ENTRIES',
    'RC_FILES_COPY_MAX_BYTES',
    'RC_FILES_DELETE_COUNT_CAP',
    'RC_FILES_WATCH_WINDOW_MS',
    'RC_FILES_WATCH_MAX_CHANGES',
    'RC_FILES_WATCH_MAX_PER_CONNECTION',
    'RC_FILES_WATCH_MAX_BUFFERED_BYTES',
    'RC_FILES_DOWNLOAD_MAX_BYTES',
    'RC_FILES_ARCHIVE_MAX_ENTRIES',
    'RC_FILES_UPLOAD_MAX_BYTES',
    'RC_FILES_UPLOAD_MAX_ENTRIES',
    'RC_FILES_UPLOAD_MAX_TOTAL_BYTES',
    'RC_FILES_HISTORY_DIR',
    'RC_FILES_HISTORY_MAX_FILE_BYTES',
    'RC_FILES_HISTORY_MAX_PER_FILE',
    'RC_FILES_HISTORY_MAX_STORE_BYTES',
    'RC_FILES_HISTORY_RETENTION_DAYS',
    'RC_FILES_HISTORY_MAX_BATCH_ENTRIES',
    'RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS',
    'RC_ATTACHMENT_MAX_BYTES',
    'RC_ATTACHMENT_TTL_SECONDS',
    'RC_ATTACHMENT_MEMORY_BYTES',
    'RC_CONTEXT_WARN_PERCENT',
    'RC_CONTEXT_DRAFT_WINDOW_TOKENS',
    'RC_CONTEXT_MAX_BYTES',
    'RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES',
    'RC_TRANSCRIPT_IMAGE_MAX_BYTES',
    'RC_TRANSCRIPT_FOLLOW_ACTIVE_MS',
    'RC_TRANSCRIPT_FOLLOW_IDLE_MS',
    'RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION',
    'RC_TRANSCRIPT_FOLLOW_MAX',
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
    ['RC_SESSION_MIN_CONCURRENT', '0'],
    ['RC_SESSION_MEMORY_FRACTION', '0'],
    ['RC_SESSION_MEMORY_FRACTION', '1.5'],
    ['RC_SESSION_MEMORY_MB', '63'],
    ['RC_SESSION_IDLE_TTL_MS', '999'],
    ['RC_WS_MAX_FRAMES_PER_SECOND', '0'],
    ['RC_WS_MAX_FRAME_BYTES', '1023'],
    ['RC_WS_MAX_ATTACHED_SESSIONS', '0'],
    ['RC_SESSION_MAX_TURNS', '0'],
    ['RC_SESSION_MAX_BUDGET_USD', '0'],
    ['RC_SESSION_DEFAULT_PERMISSION_MODE', 'yolo'],
    ['RC_CHECKPOINT_MAX_FILE_BYTES', '0'],
    ['RC_CHECKPOINT_MAX_STORE_BYTES', '-1'],
    ['RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS', '0'],
    ['RC_PERMISSION_RULE_MAX_LIFETIME_MS', '0'],
    ['RC_FILES_TREE_MAX_ENTRIES', '0'],
    ['RC_FILES_LARGE_FILE_BYTES', '0'],
    ['RC_FILES_MAX_EDIT_BYTES', '0'],
    ['RC_FILES_COPY_MAX_ENTRIES', '0'],
    ['RC_FILES_COPY_MAX_BYTES', '0'],
    ['RC_FILES_DELETE_COUNT_CAP', '0'],
    ['RC_FILES_WATCH_WINDOW_MS', '0'],
    ['RC_FILES_WATCH_WINDOW_MS', '10001'],
    ['RC_FILES_WATCH_MAX_CHANGES', '0'],
    ['RC_FILES_WATCH_MAX_PER_CONNECTION', '0'],
    ['RC_FILES_WATCH_MAX_BUFFERED_BYTES', '0'],
    ['RC_FILES_DOWNLOAD_MAX_BYTES', '0'],
    ['RC_FILES_ARCHIVE_MAX_ENTRIES', '0'],
    ['RC_FILES_UPLOAD_MAX_BYTES', '0'],
    ['RC_FILES_UPLOAD_MAX_ENTRIES', '0'],
    ['RC_FILES_UPLOAD_MAX_TOTAL_BYTES', '0'],
    ['RC_FILES_HISTORY_MAX_FILE_BYTES', '0'],
    ['RC_FILES_HISTORY_MAX_PER_FILE', '0'],
    ['RC_FILES_HISTORY_MAX_STORE_BYTES', '0'],
    ['RC_FILES_HISTORY_RETENTION_DAYS', '0'],
    ['RC_FILES_HISTORY_MAX_BATCH_ENTRIES', '0'],
    ['RC_FILES_HISTORY_DIR', ''],
    ['RC_FILES_HISTORY_RETENTION_DAYS', '36501'],
    ['RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS', '0'],
    ['RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS', '86401'],
    ['RC_ATTACHMENT_MAX_BYTES', '1023'],
    ['RC_ATTACHMENT_MAX_BYTES', '5242881'],
    ['RC_ATTACHMENT_TTL_SECONDS', '0'],
    ['RC_ATTACHMENT_MEMORY_BYTES', '1023'],
    ['RC_CONTEXT_WARN_PERCENT', '0'],
    ['RC_CONTEXT_WARN_PERCENT', '101'],
    ['RC_CONTEXT_DRAFT_WINDOW_TOKENS', '999'],
    ['RC_CONTEXT_MAX_BYTES', '1023'],
    // Plan 22, S-71.
    ['RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES', '1023'],
    ['RC_TRANSCRIPT_IMAGE_MAX_BYTES', '67108865'],
    ['RC_TRANSCRIPT_FOLLOW_ACTIVE_MS', '99'],
    ['RC_TRANSCRIPT_FOLLOW_IDLE_MS', 'often'],
    ['RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION', '0'],
    ['RC_TRANSCRIPT_FOLLOW_MAX', '257'],
    ['RC_TRANSCRIPT_FOLLOW_ACTIVE_MS', '20000'],
    ['RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION', '17'],
  ] as const)('refuses %s set to %s', (variable, value) => {
    expect(() => loadConfig(withChange({ [variable]: value }))).toThrow(ConfigurationError);
  });

  // ADR-021 · plan 10, S-88
  describe('the accepted issuers', () => {
    const KEYCLOAK = 'http://localhost:8180/realms/remote-claude';
    const THROUGH_WEB = 'http://localhost:5173/realms/remote-claude';
    const PUBLIC = 'https://name.example.dev/realms/remote-claude';

    it('is OIDC_ISSUER alone when no other is listed, exactly the single issuer of before', () => {
      for (const none of ['', '   ']) {
        expect(loadConfig(withChange({ OIDC_ADDITIONAL_ISSUERS: none })).oidc.issuers).toEqual([
          KEYCLOAK,
        ]);
      }
    });

    it('accepts the others after OIDC_ISSUER, in order and trimmed, the primary first', () => {
      const { issuers } = loadConfig(
        withChange({ OIDC_ADDITIONAL_ISSUERS: ` ${THROUGH_WEB} ,${PUBLIC}` }),
      ).oidc;

      expect(issuers).toEqual([KEYCLOAK, THROUGH_WEB, PUBLIC]);
    });

    it.each([
      ['an entry that is not a URL', 'keycloak'],
      ['an empty entry between two', `${THROUGH_WEB},,${PUBLIC}`],
      ['a trailing comma', `${THROUGH_WEB},`],
      ['a scheme that is not http(s)', 'ftp://localhost/realms/remote-claude'],
      ['OIDC_ISSUER again', KEYCLOAK],
      ['OIDC_ISSUER again, with a trailing slash', `${KEYCLOAK}/`],
      ['the same issuer twice', `${THROUGH_WEB},${THROUGH_WEB}/`],
    ])('refuses to boot with %s, and names the variable', (_what, value) => {
      expect.assertions(2);

      try {
        loadConfig(withChange({ OIDC_ADDITIONAL_ISSUERS: value }));
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(String((error as ConfigurationError).problems)).toContain('OIDC_ADDITIONAL_ISSUERS');
      }
    });

    it('refuses to boot with no issuer at all', () => {
      expect(() =>
        loadConfig(withChange({ OIDC_ISSUER: '', OIDC_ADDITIONAL_ISSUERS: THROUGH_WEB })),
      ).toThrow(ConfigurationError);
    });
  });

  describe('the capacity of the machine — D-01', () => {
    it('refuses a light mode of the editor no file can reach, and names it — plan 07, D-04', () => {
      expect.assertions(2);

      try {
        loadConfig(withChange({ RC_FILES_LARGE_FILE_BYTES: '20', RC_FILES_MAX_EDIT_BYTES: '10' }));
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(String(error)).toContain('RC_FILES_LARGE_FILE_BYTES');
      }
    });

    it('refuses an upload ceiling per file above the whole upload, and names it — plan 07, D-16', () => {
      expect.assertions(2);

      try {
        loadConfig(
          withChange({ RC_FILES_UPLOAD_MAX_BYTES: '20', RC_FILES_UPLOAD_MAX_TOTAL_BYTES: '10' }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(String(error)).toContain('RC_FILES_UPLOAD_MAX_BYTES');
      }
    });

    it('refuses an attachment ceiling above the memory all of them may hold, and names it — plan 08, D-02', () => {
      expect.assertions(2);

      try {
        loadConfig(
          withChange({ RC_ATTACHMENT_MAX_BYTES: '4096', RC_ATTACHMENT_MEMORY_BYTES: '2048' }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(String(error)).toContain('RC_ATTACHMENT_MAX_BYTES');
      }
    });

    it('refuses a floor above the ceiling, and names the floor', () => {
      expect.assertions(2);

      try {
        loadConfig(
          withChange({ RC_SESSION_MIN_CONCURRENT: '11', RC_SESSION_MAX_CONCURRENT: '10' }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).problems[0]).toContain('RC_SESSION_MIN_CONCURRENT');
      }
    });

    it('accepts a floor equal to the ceiling — a fixed number, on purpose', () => {
      const { capacity } = loadConfig(
        withChange({ RC_SESSION_MIN_CONCURRENT: '4', RC_SESSION_MAX_CONCURRENT: '4' }),
      ).session;

      expect(capacity).toMatchObject({ floor: 4, ceiling: 4 });
    });

    it('accepts the whole of the RAM, and the shortest idle TTL there is', () => {
      const { session } = loadConfig(
        withChange({ RC_SESSION_MEMORY_FRACTION: '1', RC_SESSION_IDLE_TTL_MS: '1000' }),
      );

      expect(session.capacity.memoryFraction).toBe(1);
      expect(session.idleTtlMs).toBe(1_000);
    });
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

  describe('the deadline of a question — plan 24, S-26', () => {
    it('is its own, beside the deadline of a permission', () => {
      const { permission } = loadConfig(withChange({ RC_QUESTION_TIMEOUT_MS: '300000' }));

      expect(permission).toMatchObject({ timeoutMs: 120_000, questionTimeoutMs: 300_000 });
    });

    it.each([undefined, '0', '-1', 'ten minutes', '1.5'])(
      'refuses to boot with a deadline of %s',
      (value) => {
        expect(() => loadConfig(withChange({ RC_QUESTION_TIMEOUT_MS: value }))).toThrow(
          ConfigurationError,
        );
      },
    );
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

describe('the pid file — plan 06, B-11', () => {
  it('writes none when it is off', () => {
    expect(loadConfig(withChange({ RC_PID_FILE: 'off' })).pidFile).toBeNull();
  });

  it('makes the path absolute, whatever the working directory', () => {
    const config = loadConfig(withChange({ RC_PID_FILE: '.run/backend.pid' }));

    expect(config.pidFile?.startsWith('/')).toBe(true);
    expect(config.pidFile?.endsWith('/.run/backend.pid')).toBe(true);
  });

  it('refuses an empty value — off is the word, never a blank', () => {
    expect(() => loadConfig(withChange({ RC_PID_FILE: '' }))).toThrow(ConfigurationError);
  });
});

describe('the configuration the repository ships — plan 08, B-42', () => {
  /** What `.env.example` sets each name to — the file `pnpm dev` loads into the backend. */
  function shipped(): Record<string, string> {
    const file = fileURLToPath(new URL('../../../../../.env.example', import.meta.url));

    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line) => {
          const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\S*)/.exec(line);
          return match === null ? [] : [[match[1], match[2]]];
        }),
    );
  }

  it('attaches every session the installation can run, the tabs not on screen included — S-191', () => {
    // The panel keeps the sessions of every folder tab attached (D-11): a ceiling of attachments
    // below the ceiling of sessions would leave one of them deaf to its own questions.
    const env = shipped();

    expect(Number(env['RC_WS_MAX_ATTACHED_SESSIONS'])).toBeGreaterThanOrEqual(
      Number(env['RC_SESSION_MAX_CONCURRENT']),
    );
  });
});
