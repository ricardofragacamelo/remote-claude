import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { BearerAuthGuard } from '@adapter/inbound/http/auth/bearer.guard';
import { ApprovedDeviceGuard } from '@adapter/inbound/http/files/approved-device.guard';
import { AuthorizeFolderReadUseCase, ResolveDeviceUseCase } from '@application/auth';
import type { AuthenticateUseCase } from '@application/auth';
import { DeviceNotRegisteredError, DeviceRevokedError } from '@domain/auth';
import type { Device } from '@domain/auth';
import {
  aDevice,
  anApprovedDevice,
  aRevokedDevice,
  deviceOwner,
} from '../../../../../support/builders/device.builder';
import { InMemoryDeviceRepository } from '../../../../../support/fakes/in-memory-device.repository';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const TOKEN = 'secret-access-token';

/** The token decides the client: `web` and `app` are what the two clients' tokens carry. */
const authenticate = {
  execute: (token: string) =>
    Promise.resolve({
      userId: deviceOwner,
      expiresAt: new Date(),
      clientId: token.startsWith('web') ? 'remote-claude-web' : 'remote-claude-mobile',
    }),
} as unknown as AuthenticateUseCase;

/** A request through the bearer guard first, as the routes chain them. */
async function guarded(
  token: string,
  installId: string | undefined,
  ...devices: Device[]
): Promise<{ outcome: Promise<boolean>; log: RecordingLogger }> {
  const request: Record<string | symbol, unknown> = {
    method: 'GET',
    path: '/files/tree',
    headers: {
      authorization: `Bearer ${token}`,
      ...(installId === undefined ? {} : { 'x-install-id': installId }),
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  await new BearerAuthGuard(authenticate).canActivate(context);

  const log = new RecordingLogger();
  const guard = new ApprovedDeviceGuard(
    new AuthorizeFolderReadUseCase(
      new ResolveDeviceUseCase(new InMemoryDeviceRepository().seed(...devices)),
      'remote-claude-web',
    ),
    log.logger,
  );

  return { outcome: guard.canActivate(context), log };
}

describe('ApprovedDeviceGuard — 25 · B-32', () => {
  it('lets an unexpected failure through untouched, logged without a code', async () => {
    const request: Record<string | symbol, unknown> = {
      method: 'GET',
      path: '/files/raw',
      headers: { authorization: 'Bearer app-token', 'x-install-id': 'install-1' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await new BearerAuthGuard(authenticate).canActivate(context);

    const log = new RecordingLogger();
    const broken = {
      execute: () => Promise.reject(new Error('the device table did not answer')),
    } as unknown as AuthorizeFolderReadUseCase;

    await expect(new ApprovedDeviceGuard(broken, log.logger).canActivate(context)).rejects.toThrow(
      'the device table did not answer',
    );
    expect(log.withOp('files.device')[0]?.['errorCode']).toBeUndefined();
  });

  it('lets the web through without a device', async () => {
    await expect((await guarded('web-token', undefined)).outcome).resolves.toBe(true);
  });

  it('lets the app through from an approved device', async () => {
    await expect(
      (await guarded('app-token', 'install-1', anApprovedDevice())).outcome,
    ).resolves.toBe(true);
  });

  it.each([
    [undefined, [], DeviceNotRegisteredError],
    ['install-1', [aDevice()], DeviceNotRegisteredError],
    ['install-1', [aRevokedDevice()], DeviceRevokedError],
  ] as const)('refuses the app from %j', async (installId, devices, refusal) => {
    await expect((await guarded('app-token', installId, ...devices)).outcome).rejects.toThrow(
      refusal,
    );
  });

  it('logs the refusal in debug with the installation and the route, never the token (S-151)', async () => {
    const { outcome, log } = await guarded('app-token', 'install-1', aDevice());
    await outcome.catch(() => undefined);

    const [line] = log.withOp('files.device');
    expect(line).toMatchObject({
      level: 'debug',
      installId: 'install-1',
      route: 'GET /files/tree',
      errorCode: 'DEVICE_NOT_REGISTERED',
    });
    expect(JSON.stringify(log.lines)).not.toContain(TOKEN);
    expect(JSON.stringify(log.lines)).not.toContain('app-token');
  });
});
