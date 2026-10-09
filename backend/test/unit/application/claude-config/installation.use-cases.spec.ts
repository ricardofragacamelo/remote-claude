import { describe, expect, it } from 'vitest';

import {
  CheckModelUseCase,
  ClaudeInstallationCatalog,
  ModelChecks,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadModelsUseCase,
} from '@application/claude-config';
import type { FolderAccess, InstallationFacts, ModelCheck } from '@application/claude-config';
import { UserId } from '@domain/auth';
import { ClaudeConfigForbiddenError } from '@domain/claude-config';
import { ClaudeUnavailableError } from '@domain/session';
import type { SessionInitialization } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const USER = UserId.create('auth|42');
const ROOT = WorkspacePath.create('/srv');
const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'));

const initWith = (account: Partial<SessionInitialization['account']>): SessionInitialization => ({
  commands: [],
  agents: [],
  models: [],
  outputStyle: 'default',
  outputStyles: [],
  account: {
    email: null,
    organization: null,
    plan: null,
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
    ...account,
  },
});

const folders = (root: WorkspacePath | null = ROOT): FolderAccess => ({
  resolve: (raw) => Promise.resolve(WorkspacePath.create(raw)),
  locate: (raw) => Promise.resolve({ folder: WorkspacePath.create(raw), root: '/srv' }),
  firstRoot: () => Promise.resolve(root),
});

const catalogOf = (init: SessionInitialization) =>
  new ClaudeInstallationCatalog(
    { initializationOf: () => Promise.resolve(null) },
    { probe: () => Promise.resolve({ cliVersion: '2.1.277', initialization: init }) },
    clock,
    { cliVersion: '2.1.277', configDir: '/home/me/.claude' },
  );

const facts = (pathVersion: string | null): InstallationFacts => ({
  agentSdk: { version: '0.3.277', reason: null },
  bundledCli: { version: '2.1.277', reason: null },
  pathCli: () =>
    Promise.resolve({ version: pathVersion, reason: pathVersion === null ? 'notInstalled' : null }),
  configDir: { path: '/home/me/.claude', fromEnvironment: false },
});

describe('the account and the installation — plan 13, B-11', () => {
  it('answers the account in the first root, with whether it is signed in — S-24, S-25', async () => {
    const signedIn = await new ReadAccountUseCase(
      folders(),
      catalogOf(initWith({ email: 'p@example.com', plan: 'max' })),
    ).execute(USER, false);
    const signedOut = await new ReadAccountUseCase(folders(), catalogOf(initWith({}))).execute(
      USER,
      false,
    );

    expect(signedIn).toMatchObject({ state: 'ready', email: 'p@example.com', plan: 'max' });
    expect(signedOut.state).toBe('loginRequired');
  });

  it('refuses the account to somebody with no root at all — D-07', async () => {
    await expect(
      new ReadAccountUseCase(folders(null), catalogOf(initWith({}))).execute(USER, false),
    ).rejects.toThrow(ClaudeConfigForbiddenError);
  });

  it('marks the claude on PATH when it differs from the one the product runs — S-27', async () => {
    const checks = new ModelChecks({ run: () => Promise.reject(new Error('unused')) }, clock);
    const catalog = catalogOf(initWith({ email: 'p@example.com' }));

    const older = await new ReadInstallationUseCase(facts('2.1.226'), catalog, checks).execute(
      USER,
    );
    const same = await new ReadInstallationUseCase(facts('2.1.277'), catalog, checks).execute(USER);
    const none = await new ReadInstallationUseCase(facts(null), catalog, checks).execute(USER);

    expect(older.pathCli).toEqual({ version: '2.1.226', reason: null, differs: true });
    expect(same.pathCli.differs).toBe(false);
    expect(none.pathCli).toEqual({ version: null, reason: 'notInstalled', differs: false });
    expect(older.login).toBe('unknown');
  });

  it('says what the last answer said of the login once there was one', async () => {
    const checks = new ModelChecks({ run: () => Promise.reject(new Error('unused')) }, clock);
    const catalog = catalogOf(initWith({}));
    await catalog.of(USER, ROOT);

    expect(
      (await new ReadInstallationUseCase(facts(null), catalog, checks).execute(USER)).login,
    ).toBe('loginRequired');
  });

  it('answers the models of the installation and every mode of the product — S-34', async () => {
    const init = {
      ...initWith({}),
      models: [
        {
          value: 'sonnet',
          resolvedModel: null,
          displayName: 'S',
          description: '',
          supportsEffort: false,
          supportedEffortLevels: [],
        },
      ],
    };
    const view = await new ReadModelsUseCase(folders(), catalogOf(init)).execute(USER, '/srv/repo');

    expect(view.models.map((model) => model.value)).toEqual(['sonnet']);
    expect(view.permissionModes).toContain('acceptEdits');
    expect(
      (await new ReadModelsUseCase(folders(), catalogOf(init)).execute(USER, null)).cliVersion,
    ).toBe('2.1.277');
    await expect(
      new ReadModelsUseCase(folders(null), catalogOf(init)).execute(USER, null),
    ).rejects.toThrow(ClaudeConfigForbiddenError);
  });
});

describe('the test of the connection — plan 13, B-12', () => {
  it('runs one test per user at a time, the second taking the first’s answer — S-33', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const check: ModelCheck = {
      run: () => {
        calls += 1;
        return new Promise((resolve) => {
          release = () => {
            resolve({
              result: 'ok',
              model: 'sonnet',
              latencyMs: 900,
              costUsd: 0.001,
              reason: null,
            });
          };
        });
      },
    };
    const checks = new ModelChecks(check, clock);
    const use = new CheckModelUseCase(checks);

    const first = use.execute(USER, null);
    const second = use.execute(USER, null);
    release();

    expect(await first).toBe(await second);
    expect(calls).toBe(1);
    expect(checks.lastOf(USER)).toMatchObject({ result: 'ok', at: clock.now() });
  });

  it('keeps no result of a test that could not run — S-31', async () => {
    const checks = new ModelChecks(
      { run: () => Promise.reject(new ClaudeUnavailableError('model-check')) },
      clock,
    );

    await expect(new CheckModelUseCase(checks).execute(USER, 'sonnet')).rejects.toThrow(
      ClaudeUnavailableError,
    );
    expect(checks.lastOf(USER)).toBeNull();
  });
});
