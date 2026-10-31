import { describe, expect, it } from 'vitest';

import { ClaudeController } from '@adapter/inbound/http/engines/claude/claude.controller';
import type {
  CheckModelUseCase,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  ReadProjectConfigUseCase,
  ReadRateLimitsUseCase,
  SaveOutputStyleUseCase,
} from '@application/engines/claude';
import type { ModelCheckOutcome } from '@application/engines/claude';
import { UserId } from '@domain/auth';
import type { ProjectConfigView } from '@domain/engines/claude';
import type { RateLimitWindow } from '@domain/engines/claude';

const NOT_USED = (): never => {
  throw new Error('not used by this test');
};

const controllerWith = (
  overrides: {
    modelCheck?: Partial<CheckModelUseCase>;
    projectConfig?: Partial<ReadProjectConfigUseCase>;
    rateLimits?: Partial<ReadRateLimitsUseCase>;
  } = {},
): ClaudeController =>
  new ClaudeController(
    { execute: NOT_USED } as unknown as ReadAccountUseCase,
    { execute: NOT_USED } as unknown as ReadInstallationUseCase,
    (overrides.modelCheck ?? { execute: NOT_USED }) as CheckModelUseCase,
    { execute: NOT_USED } as unknown as ReadOutputStyleUseCase,
    { execute: NOT_USED } as unknown as SaveOutputStyleUseCase,
    (overrides.projectConfig ?? { execute: NOT_USED }) as ReadProjectConfigUseCase,
    (overrides.rateLimits ?? { execute: NOT_USED }) as ReadRateLimitsUseCase,
  );

describe('POST /engines/claude/diagnostics/model-check — the wire form of a result nobody spent anything on', () => {
  it('carries a `null` costUsd as `null`, never calling `.toFixed` on it — S-30', async () => {
    const outcome: ModelCheckOutcome = {
      result: 'notLoggedIn',
      model: null,
      latencyMs: 42,
      costUsd: null,
      reason: 'authentication_failed',
      at: new Date('2026-10-15T00:00:00.000Z'),
    };
    const controller = controllerWith({ modelCheck: { execute: () => Promise.resolve(outcome) } });

    const response = await controller.checkModel({}, UserId.create('auth|someone'));

    expect(response).toEqual({
      result: 'notLoggedIn',
      model: null,
      latencyMs: 42,
      costUsd: null,
      reason: 'authentication_failed',
      at: '2026-10-15T00:00:00.000Z',
    });
  });
});

describe('GET /engines/claude/project-config — plan 13, B-31', () => {
  it('passes the folder and the caller straight to the use case, and answers its view as-is', async () => {
    const view: ProjectConfigView = {
      folderPath: '/srv/app',
      memory: [],
      commands: [],
      agents: [],
      outputStyles: [],
      hooks: [],
      permissions: [],
      plugins: { enabled: [], disabled: [], enableAllProjectMcpServers: false },
      issues: [],
    };
    let askedFolder: string | undefined;
    const controller = controllerWith({
      projectConfig: {
        execute: (_userId, folder) => {
          askedFolder = folder;
          return Promise.resolve(view);
        },
      },
    });

    const response = await controller.readProjectConfig(
      { folder: '/srv/app' },
      UserId.create('auth|someone'),
    );

    expect(askedFolder).toBe('/srv/app');
    expect(response).toEqual(view);
  });
});

describe('GET /engines/claude/usage/rate-limits — plan 16, D-09', () => {
  it('passes the caller straight to the use case, and carries every window on the wire', async () => {
    const windows: RateLimitWindow[] = [
      {
        kind: 'five_hour',
        status: 'allowed',
        utilizationPercent: 8,
        resetsAt: new Date('2026-11-02T00:00:00.000Z'),
        observedAt: new Date('2026-10-26T12:00:00.000Z'),
        displayName: 'Fable',
      },
      {
        kind: 'seven_day',
        status: 'rejected',
        utilizationPercent: 100,
        resetsAt: null,
        observedAt: new Date('2026-10-26T12:00:00.000Z'),
      },
    ];
    let askedUser: UserId | undefined;
    const controller = controllerWith({
      rateLimits: {
        execute: (userId) => {
          askedUser = userId;
          return Promise.resolve(windows);
        },
      },
    });

    const response = await controller.readRateLimits(UserId.create('auth|someone'));

    expect(askedUser).toEqual(UserId.create('auth|someone'));
    expect(response).toEqual({
      windows: [
        {
          kind: 'five_hour',
          status: 'allowed',
          utilizationPercent: 8,
          resetsAt: '2026-11-02T00:00:00.000Z',
          observedAt: '2026-10-26T12:00:00.000Z',
          displayName: 'Fable',
        },
        {
          kind: 'seven_day',
          status: 'rejected',
          utilizationPercent: 100,
          resetsAt: null,
          observedAt: '2026-10-26T12:00:00.000Z',
        },
      ],
    });
  });

  it('answers no window when nothing has ever been observed', async () => {
    const controller = controllerWith({ rateLimits: { execute: () => Promise.resolve([]) } });

    const response = await controller.readRateLimits(UserId.create('auth|someone'));

    expect(response).toEqual({ windows: [] });
  });
});
