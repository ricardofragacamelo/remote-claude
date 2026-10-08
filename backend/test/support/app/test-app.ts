import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../../../src/app.module';
import { configureApp, listen } from '../../../src/bootstrap';
import { AUDIENCE } from '../identity/fake-oidc';
import type { IdentityServer } from '../identity/identity-server';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { MACHINE_MEMORY } from '@infra/lifecycle/session-capacity';
import { OrphanSweep } from '@infra/lifecycle/orphan-sweep';
import type { ProcessTable } from '@infra/lifecycle/process-table';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { RecordingLogger } from '../fakes/recording-logger';

/** What a test needs handed back after the app is up. */
export interface TestApp {
  readonly app: INestApplication;
  readonly log: RecordingLogger;

  /** `http://127.0.0.1:<port>`, with the IPv6 form Nest prints normalised away. */
  readonly url: string;

  /** The allowlist this app came up with, and the root it declares. */
  readonly allowlist: TestAllowlist;

  close(): Promise<void>;
}

/**
 * A workspace allowlist for one suite, written to a temporary file.
 *
 * Written rather than committed: the allowlist is the security boundary of the product, and a
 * fixture that lives in the repository is a fixture somebody eventually points a real
 * installation at. The root is a fresh directory, so a test that writes into it cannot reach
 * anything the suite did not create.
 *
 * @param subjects OIDC subjects the roots are declared for
 * @returns the file's path and the root it declares
 */
export function writeTestAllowlist(subjects: readonly string[] = [SUBJECT]): TestAllowlist {
  const directory = mkdtempSync(path.join(tmpdir(), 'rc-allowlist-'));
  const root = path.join(directory, 'workspace');
  const file = path.join(directory, 'allowlist.yaml');

  mkdirSync(root);
  writeFileSync(
    file,
    `roots:\n  - path: ${root}\n    label: Suite\n    users:\n${subjects
      .map((subject) => `      - ${subject}`)
      .join('\n')}\n`,
    'utf8',
  );

  return { file, root };
}

/** Where a suite's allowlist ended up, and what it allows. */
export interface TestAllowlist {
  readonly file: string;
  readonly root: string;
}

/**
 * The RAM a suite's installation believes it has: roomy, so the capacity is whatever the suite's
 * ceiling says and never whatever the machine running it happens to have. A suite about the
 * capacity itself replaces it (plan 05, D-01).
 */
export const ROOMY_MACHINE = 64 * 1024 ** 3;

/**
 * The process table a suite's installation sweeps at boot: a machine with no process at all.
 *
 * The sweep is the product's and still runs on the way up — but over the **real** table it would
 * reach the processes of every other suite running beside this one, and the scenario that plants an
 * orphan to prove the sweep ends it (S-06) found its orphan already ended by somebody else's boot
 * (plan 05, cycle 21). The real table has a suite of its own:
 * test/integration/infrastructure/lifecycle/orphan-sweep.spec.ts.
 */
export const EMPTY_MACHINE: ProcessTable = {
  list: () => Promise.resolve([]),
  isAlive: () => true,
  signal: () => undefined,
};

/** The subject the fake identity provider mints tokens for. */
export const SUBJECT = 'auth|42';

/** Everything the backend needs in its environment, pointed at the fixtures of one suite. */
export function testEnvironment(
  databaseUrl: string,
  issuer: string,
  allowlistFile: string = writeTestAllowlist().file,
): void {
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'debug';
  // A real port, because the schema refuses anything that is not one; the suite still listens on
  // an ephemeral port, chosen by `listen(0)` below, so two suites never collide.
  process.env['RC_BACKEND_PORT'] = '3000';
  process.env['RC_WEB_PORT'] = '5173';
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['OIDC_ISSUER'] = issuer;
  // None: one issuer, as every suite but the one about the list (ADR-021) wants.
  process.env['OIDC_ADDITIONAL_ISSUERS'] = '';
  process.env['OIDC_AUDIENCE'] = AUDIENCE;
  process.env['OIDC_CLIENT_ID_WEB'] = 'remote-claude-web';
  process.env['OIDC_CLIENT_ID_MOBILE'] = 'remote-claude-mobile';
  process.env['OIDC_SCOPES'] = 'openid profile email offline_access';
  process.env['RC_WORKSPACE_ALLOWLIST_FILE'] = allowlistFile;
  // Off: a suite never writes a pid where `pnpm allowlist` would find it and signal the suite.
  process.env['RC_PID_FILE'] = 'off';
  process.env['RC_SESSION_MAX_CONCURRENT'] = '10';
  process.env['RC_SESSION_MIN_CONCURRENT'] = '1';
  process.env['RC_SESSION_MEMORY_FRACTION'] = '0.5';
  process.env['RC_SESSION_MEMORY_MB'] = '256';
  process.env['RC_SESSION_IDLE_TTL_MS'] = '1800000';
  process.env['RC_WS_MAX_FRAMES_PER_SECOND'] = '20';
  process.env['RC_WS_MAX_FRAME_BYTES'] = '65536';
  process.env['RC_WS_MAX_ATTACHED_SESSIONS'] = '16';
  process.env['RC_SESSION_MAX_TURNS'] = '100';
  process.env['RC_SESSION_MAX_BUDGET_USD'] = '10';
  process.env['RC_SESSION_DEFAULT_MODEL'] = 'claude-sonnet-5';
  process.env['RC_SESSION_DEFAULT_PERMISSION_MODE'] = 'default';
  // Small and explicit, because every scenario has to fix the values it uses or stop being
  // deterministic. The deadline is short enough for a suite to wait on it; the extension is twice
  // as long, so an extension always moves a fresh deadline and the difference is observable.
  process.env['RC_PERMISSION_TIMEOUT_MS'] = '400';
  process.env['RC_QUESTION_TIMEOUT_MS'] = '400';
  process.env['RC_PERMISSION_EXTENSION_MS'] = '800';
  process.env['RC_PERMISSION_MAX_EXTENSIONS'] = '2';
  process.env['RC_PERMISSION_RULE_LIFETIME_MS'] = '60000';
  process.env['RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS'] = '3600000';
  process.env['RC_PERMISSION_RULE_MAX_LIFETIME_MS'] = '86400000';
  // A push provider that does not exist, on purpose: a suite that is not about notifications
  // must never reach one, and an endpoint under `.invalid` cannot resolve by accident. The suite
  // that **is** about them overrides the sender.
  process.env['RC_PUSH_ENDPOINT'] = 'https://push.invalid/v1/messages:send';
  process.env['RC_PUSH_CREDENTIALS_FILE'] = path.join(
    mkdtempSync(path.join(tmpdir(), 'rc-push-')),
    'credentials.json',
  );
  process.env['RC_PUSH_SCOPE'] = 'https://push.invalid/auth';
  process.env['RC_CHECKPOINT_DIR'] = mkdtempSync(path.join(tmpdir(), 'rc-checkpoints-'));
  process.env['RC_CHECKPOINT_MAX_FILE_BYTES'] = '5242880';
  process.env['RC_CHECKPOINT_MAX_STORE_BYTES'] = '524288000';
  // The product's numbers, except the editing ceiling: small, so a suite can cross it without
  // writing ten megabytes — and the light-mode threshold under it.
  process.env['RC_FILES_TREE_MAX_ENTRIES'] = '5000';
  process.env['RC_FILES_LARGE_FILE_BYTES'] = '16384';
  process.env['RC_FILES_MAX_EDIT_BYTES'] = '65536';
  process.env['RC_FILES_COPY_MAX_ENTRIES'] = '10000';
  process.env['RC_FILES_COPY_MAX_BYTES'] = '104857600';
  process.env['RC_FILES_DELETE_COUNT_CAP'] = '10000';
  // The product's watcher numbers, the window shortened so a suite waits a fifth as long for it.
  process.env['RC_FILES_WATCH_WINDOW_MS'] = '40';
  process.env['RC_FILES_WATCH_MAX_CHANGES'] = '500';
  process.env['RC_FILES_WATCH_MAX_PER_CONNECTION'] = '16';
  process.env['RC_FILES_WATCH_MAX_BUFFERED_BYTES'] = '1048576';
  // Transfer ceilings small enough for a suite to cross each one without moving megabytes: the
  // download above the editing ceiling, so a file too big to edit can still be downloaded.
  process.env['RC_FILES_DOWNLOAD_MAX_BYTES'] = '262144';
  process.env['RC_FILES_ARCHIVE_MAX_ENTRIES'] = '200';
  process.env['RC_FILES_UPLOAD_MAX_BYTES'] = '65536';
  process.env['RC_FILES_UPLOAD_MAX_ENTRIES'] = '50';
  process.env['RC_FILES_UPLOAD_MAX_TOTAL_BYTES'] = '262144';
  // The local history in a folder of the suite's own, the snapshot ceiling at the editing one.
  process.env['RC_FILES_HISTORY_DIR'] = mkdtempSync(path.join(tmpdir(), 'rc-file-history-'));
  process.env['RC_FILES_HISTORY_MAX_FILE_BYTES'] = '65536';
  process.env['RC_FILES_HISTORY_MAX_PER_FILE'] = '50';
  process.env['RC_FILES_HISTORY_MAX_STORE_BYTES'] = '536870912';
  process.env['RC_FILES_HISTORY_RETENTION_DAYS'] = '30';
  process.env['RC_FILES_HISTORY_MAX_BATCH_ENTRIES'] = '1000';
  process.env['RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS'] = '120';
  process.env['RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES'] = '262144';
  process.env['RC_TRANSCRIPT_IMAGE_MAX_BYTES'] = '10485760';
  process.env['RC_TRANSCRIPT_FOLLOW_ACTIVE_MS'] = '1000';
  process.env['RC_TRANSCRIPT_FOLLOW_IDLE_MS'] = '10000';
  process.env['RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION'] = '4';
  process.env['RC_TRANSCRIPT_FOLLOW_MAX'] = '16';
  process.env['RC_ATTACHMENT_MAX_BYTES'] = '5242880';
  process.env['RC_ATTACHMENT_TTL_SECONDS'] = '3600';
  process.env['RC_ATTACHMENT_MEMORY_BYTES'] = '67108864';
  process.env['RC_CONTEXT_WARN_PERCENT'] = '25';
  process.env['RC_CONTEXT_DRAFT_WINDOW_TOKENS'] = '200000';
  process.env['RC_CONTEXT_MAX_BYTES'] = '8388608';
  process.env['RC_AUDIT_RETENTION_DAYS'] = '90';
  // On, and a day long: the first run is a minute after boot, which no suite waits for — the suites
  // about the purge drive it directly, at the instant they choose.
  process.env['RC_AUDIT_PURGE_INTERVAL_MS'] = '86400000';
}

/**
 * The real application, with the real filter, interceptor, middleware and gateway.
 *
 * Only the outside world is a fixture: PostgreSQL is a container and the identity provider is a
 * local server. Nothing inside `src/` is replaced, which is the point of an integration test —
 * a suite that mocks the transport leaves the transport uncovered.
 *
 * @param environment variables this suite needs different from the defaults, applied last
 * @param mount what the suite adds to the application before it starts — the door the e2e entry
 *   point opens into Claude's store, mounted as `scripted-main.ts` mounts it (plan 22, S-123)
 */
export async function startTestApp(
  databaseUrl: string,
  identity: IdentityServer,
  customise: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  allowlist: TestAllowlist = writeTestAllowlist(),
  environment: Readonly<Record<string, string>> = {},
  mount: (app: INestApplication) => void = () => undefined,
): Promise<TestApp> {
  testEnvironment(databaseUrl, identity.issuer, allowlist.file);

  // After the defaults and before the container is built, because the configuration is read once
  // when the module compiles. A suite that has to fix a number — every permission scenario does,
  // or it stops being deterministic — states it here rather than reaching into `process.env`
  // from its own `beforeAll` and hoping about the ordering.
  for (const [name, value] of Object.entries(environment)) {
    process.env[name] = value;
  }

  const log = new RecordingLogger();
  const moduleRef = await customise(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOGGER)
      .useValue(log.logger)
      .overrideProvider(MACHINE_MEMORY)
      .useValue(ROOMY_MACHINE)
      .overrideProvider(OrphanSweep)
      .useFactory({
        inject: [SCHEDULER, LOGGER],
        factory: (scheduler: Scheduler, logger: Logger) =>
          new OrphanSweep(EMPTY_MACHINE, scheduler, logger),
      }),
  ).compile();

  const app = moduleRef.createNestApplication();

  // The **product's** wiring, not a copy of it: the logger, the WebSocket adapter, the cookie
  // parser and the shutdown hooks all come from `src/bootstrap.ts`. A suite that configured its
  // own application would be a suite proving nothing about the one that ships.
  configureApp(app);
  mount(app);

  await app.init();
  await listen(app, 0, '127.0.0.1');

  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return { app, log, url, allowlist, close: () => app.close() };
}
