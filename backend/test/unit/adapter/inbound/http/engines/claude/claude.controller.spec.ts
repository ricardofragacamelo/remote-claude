import { describe, expect, it } from 'vitest';

import { ClaudeController } from '@adapter/inbound/http/engines/claude/claude.controller';
import type {
  CheckModelUseCase,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  SaveOutputStyleUseCase,
} from '@application/engines/claude';
import type { ModelCheckOutcome } from '@application/engines/claude';
import { UserId } from '@domain/auth';

const NOT_USED = (): never => {
  throw new Error('not used by this test');
};

const controllerWith = (modelCheck: Partial<CheckModelUseCase>): ClaudeController =>
  new ClaudeController(
    { execute: NOT_USED } as unknown as ReadAccountUseCase,
    { execute: NOT_USED } as unknown as ReadInstallationUseCase,
    modelCheck as CheckModelUseCase,
    { execute: NOT_USED } as unknown as ReadOutputStyleUseCase,
    { execute: NOT_USED } as unknown as SaveOutputStyleUseCase,
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
    const controller = controllerWith({ execute: () => Promise.resolve(outcome) });

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
