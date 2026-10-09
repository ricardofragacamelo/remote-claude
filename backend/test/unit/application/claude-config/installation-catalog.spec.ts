import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_TTL_MS,
  CATALOGUE_CAPACITY,
  ClaudeInstallationCatalog,
} from '@application/claude-config';
import type { InstallationProbe, LiveInstallation } from '@application/claude-config';
import { UserId } from '@domain/auth';
import { ClaudeUnavailableError } from '@domain/session';
import type { SessionInitialization } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const USER = UserId.create('auth|42');
const folder = (path = '/srv/repo'): WorkspacePath => WorkspacePath.create(path);

const init = (models: string[] = ['sonnet']): SessionInitialization => ({
  commands: [],
  agents: [],
  models: models.map((value) => ({
    value,
    resolvedModel: null,
    displayName: value,
    description: '',
    supportsEffort: false,
    supportedEffortLevels: [],
  })),
  outputStyle: 'default',
  outputStyles: ['default'],
  account: {
    email: 'p@example.com',
    organization: null,
    plan: 'max',
    provider: 'firstParty',
    tokenSource: null,
    apiKeySource: null,
  },
});

/** A probe that counts, answers what it is told, and can be held open. */
function probeOf(
  answer: () => Promise<{ cliVersion: string | null; initialization: SessionInitialization }>,
) {
  let calls = 0;
  const probe: InstallationProbe = {
    probe: () => {
      calls += 1;
      return answer();
    },
  };
  return { probe, calls: () => calls };
}

const noLive: LiveInstallation = { initializationOf: () => Promise.resolve(null) };

function catalogOf(
  probe: InstallationProbe,
  live: LiveInstallation = noLive,
  clock = new FixedClock(new Date('2026-10-09T12:00:00Z')),
  cliVersion: string | null = '2.1.277',
) {
  return new ClaudeInstallationCatalog(live, probe, clock, {
    cliVersion,
    configDir: '/home/me/.claude',
  });
}

describe('ClaudeInstallationCatalog — plan 13, B-10', () => {
  it('answers from a live session of the caller in the folder, with no probe — S-16', async () => {
    const counted = probeOf(() =>
      Promise.resolve({ cliVersion: '2.1.277', initialization: init() }),
    );
    const live: LiveInstallation = {
      initializationOf: () =>
        Promise.resolve({ cliVersion: '2.1.277', initialization: init(['opus']) }),
    };

    const answer = await catalogOf(counted.probe, live).of(USER, folder());

    expect(answer.initialization.models.map((each) => each.value)).toEqual(['opus']);
    expect(counted.calls()).toBe(0);
  });

  it('makes one probe for two screens asking together — S-18', async () => {
    let release: () => void = () => undefined;
    const counted = probeOf(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ cliVersion: '2.1.277', initialization: init() });
          };
        }),
    );
    const catalog = catalogOf(counted.probe);

    const first = catalog.of(USER, folder());
    const second = catalog.of(USER, folder());
    await Promise.resolve();
    await Promise.resolve();
    release();

    expect(await first).toBe(await second);
    expect(counted.calls()).toBe(1);
  });

  it('keeps the answer by version, configuration directory and folder — S-19', async () => {
    const counted = probeOf(() =>
      Promise.resolve({ cliVersion: '2.1.277', initialization: init() }),
    );
    const catalog = catalogOf(counted.probe);

    await catalog.of(USER, folder());
    await catalog.of(USER, folder());
    await catalog.of(USER, folder('/srv/other'));

    expect(counted.calls()).toBe(2);
    expect(catalog.known(folder())).not.toBeNull();
    expect(catalog.known(folder('/srv/nowhere'))).toBeNull();
  });

  it('asks again when the version of the CLI is another — S-19', async () => {
    const counted = probeOf(() =>
      Promise.resolve({ cliVersion: '2.1.277', initialization: init() }),
    );
    await catalogOf(counted.probe).of(USER, folder());

    const newer = catalogOf(counted.probe, noLive, undefined, '2.1.300');
    await newer.of(USER, folder());

    expect(counted.calls()).toBe(2);
  });

  it('keeps no failure, and no answer whose version is unknown — S-20', async () => {
    let fail = true;
    const counted = probeOf(() =>
      fail
        ? Promise.reject(new ClaudeUnavailableError('/srv/repo'))
        : Promise.resolve({ cliVersion: null, initialization: init() }),
    );
    const catalog = catalogOf(counted.probe);

    await expect(catalog.of(USER, folder())).rejects.toThrow(ClaudeUnavailableError);
    fail = false;
    await catalog.of(USER, folder());
    await catalog.of(USER, folder());

    expect(counted.calls()).toBe(3);
    expect(catalog.latest()).toBeNull();
  });

  it('reads the account again past its minute, or when asked to — S-26', async () => {
    const clock = new FixedClock(new Date('2026-10-09T12:00:00Z'));
    const counted = probeOf(() =>
      Promise.resolve({ cliVersion: '2.1.277', initialization: init() }),
    );
    const catalog = catalogOf(counted.probe, noLive, clock);

    await catalog.of(USER, folder());
    await catalog.of(USER, folder(), true);
    clock.advance(ACCOUNT_TTL_MS + 1);
    await catalog.of(USER, folder());

    expect(counted.calls()).toBe(3);
  });

  it('keeps no more folders than its capacity, the least used going first', async () => {
    const counted = probeOf(() =>
      Promise.resolve({ cliVersion: '2.1.277', initialization: init() }),
    );
    const catalog = catalogOf(counted.probe);

    for (let index = 0; index <= CATALOGUE_CAPACITY; index += 1) {
      await catalog.of(USER, folder(`/srv/f${String(index)}`));
    }

    expect(catalog.known(folder('/srv/f0'))).toBeNull();
    expect(catalog.known(folder(`/srv/f${String(CATALOGUE_CAPACITY)}`))).not.toBeNull();
    expect(catalog.latest()).not.toBeNull();
  });
});
