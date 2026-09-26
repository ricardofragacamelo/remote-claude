import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyPermissionUseCase } from '@application/notification';
import { ForgetPushTokenUseCase, ListApprovedDevicesUseCase } from '@application/auth';
import type { DeviceContext } from '@application/auth';
import { RecordAuditEventUseCase } from '@application/audit';
import { PermissionRequest } from '@domain/permission';
import { SessionId } from '@domain/session';
import { UserId } from '@domain/auth';
import {
  CancelOnPermissionResolved,
  NotifyOnPermissionRequested,
} from '@adapter/outbound/notification/permission-notification.listeners';
import { RegistryPushAudience } from '@adapter/outbound/notification/registry-push.audience';
import { RepositoryPushTokenRegistry } from '@adapter/outbound/notification/repository-push-token.registry';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import type { Sendable } from '@infra/websocket/connection-registry';
import {
  anApprovedDevice,
  aDevice,
  deviceOwner,
} from '../../../../support/builders/device.builder';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { InMemoryDeviceRepository } from '../../../../support/fakes/in-memory-device.repository';
import { RecordingAuditEvents } from '../../../../support/fakes/recording-audit-events';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const other = UserId.create('auth|other');
const socket = (): Sendable => ({ send: () => undefined, close: () => undefined });

let devices: InMemoryDeviceRepository;
let connections: ConnectionRegistry;
let logger: RecordingLogger;

/**
 * The context `auth`'s use cases are built against.
 *
 * The trail and the clock are unused on these two paths — neither reading the approved devices
 * nor erasing a dead token is an account fact anybody audits — so they are the real objects with
 * nothing asked of them rather than stand-ins that would need explaining.
 */
const context = (): DeviceContext => ({
  devices,
  trail: new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds()),
  clock: new FixedClock(new Date('2026-09-18T10:00:00.000Z')),
});

beforeEach(() => {
  devices = new InMemoryDeviceRepository();
  connections = new ConnectionRegistry();
  logger = new RecordingLogger();
});

/** Registers an authenticated connection watching a session, as the handshake would leave it. */
function watching(id: string, userId: UserId, sessionId: string): void {
  const connection = connections.register(id, socket());
  connection.userId = userId;
  connection.attached.add(sessionId);
}

describe('who can be reached', () => {
  const audience = (): RegistryPushAudience =>
    new RegistryPushAudience(new ListApprovedDevicesUseCase(context()), connections);

  it('answers the approved devices of the user', async () => {
    devices.seed(anApprovedDevice(), aDevice({ id: 'dev_2', installId: 'install-2' }));

    expect((await audience().approvedDevices(deviceOwner)).map((device) => device.id)).toEqual([
      'dev_1',
    ]);
  });

  it('says somebody is watching when a connection of that user is attached', () => {
    watching('c1', deviceOwner, 'ses-1');

    expect(audience().isWatching(deviceOwner, 'ses-1')).toBe(true);
  });

  it('says nobody is watching another session', () => {
    watching('c1', deviceOwner, 'ses-1');

    expect(audience().isWatching(deviceOwner, 'ses-2')).toBe(false);
  });

  // "Somebody is looking" has to mean somebody who could answer.
  it('does not count a connection of another user watching the same session', () => {
    watching('c1', other, 'ses-1');

    expect(audience().isWatching(deviceOwner, 'ses-1')).toBe(false);
  });

  it('says nobody is watching when nothing is connected', () => {
    expect(audience().isWatching(deviceOwner, 'ses-1')).toBe(false);
  });
});

describe('forgetting a token the provider refused', () => {
  // S-61 and D-13: revoking would charge a fresh approval through the browser every time the
  // operating system rotates a token.
  it('erases the token and leaves the device approved — S-61', async () => {
    const device = anApprovedDevice();
    devices.seed(device);

    await new RepositoryPushTokenRegistry(
      new ForgetPushTokenUseCase(context()),
      logger.logger,
    ).forget(device);

    const stored = await devices.findById(deviceOwner, 'dev_1');
    expect(stored?.pushToken).toBeNull();
    expect(stored?.canDecide).toBe(true);
  });

  it('says so at info — it is the ordinary end of a token life, not a failure', async () => {
    const device = anApprovedDevice();
    devices.seed(device);

    await new RepositoryPushTokenRegistry(
      new ForgetPushTokenUseCase(context()),
      logger.logger,
    ).forget(device);

    expect(logger.withOp('push.send')).toMatchObject([{ level: 'info', deviceId: 'dev_1' }]);
  });
});

describe('the consumers on the bus', () => {
  const at = new Date('2026-09-18T10:00:00.000Z');

  const request = (): PermissionRequest =>
    PermissionRequest.open({
      id: 'req-1',
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      userId: deviceOwner,
      projectPath: null,
      toolUseId: 'toolu_1',
      toolName: 'Bash',
      input: { command: 'rm -rf build' },
      riskHint: 'destructive',
      requestedAt: at,
      expiresAt: new Date(at.getTime() + 120_000),
    });

  /** The use case, recording what it was asked rather than reaching a provider. */
  class RecordingNotify {
    readonly announced: unknown[] = [];
    readonly withdrawn: unknown[] = [];
    failure: Error | null = null;

    execute(command: unknown): Promise<string> {
      this.announced.push(command);
      return this.failure === null ? Promise.resolve('announced') : Promise.reject(this.failure);
    }

    cancel(_userId: UserId, reference: unknown): Promise<number> {
      this.withdrawn.push(reference);
      return this.failure === null ? Promise.resolve(1) : Promise.reject(this.failure);
    }
  }

  let notify: RecordingNotify;

  beforeEach(() => {
    notify = new RecordingNotify();
  });

  const asNotify = (): NotifyPermissionUseCase => notify as unknown as NotifyPermissionUseCase;

  /** The listeners are fire-and-forget, so a test has to let the microtask queue drain. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('announces a question with the tool name, and nothing from its input', async () => {
    new NotifyOnPermissionRequested(asNotify(), logger.logger).handle({ request: request() });
    await settle();

    expect(notify.announced).toEqual([
      {
        userId: deviceOwner,
        sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
        requestId: 'req-1',
        expiresAt: new Date(at.getTime() + 120_000),
        toolName: 'Bash',
      },
    ]);
    expect(JSON.stringify(notify.announced)).not.toContain('rm -rf');
  });

  it('withdraws by the request that is over', async () => {
    new CancelOnPermissionResolved(asNotify(), logger.logger).handle({ request: request() });
    await settle();

    expect(notify.withdrawn).toEqual([
      {
        sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
        requestId: 'req-1',
        expiresAt: '2026-09-18T10:02:00.000Z',
      },
    ]);
  });

  // Neither consumer may hold the loop: one runs while it is blocked, the other while it is
  // being released.
  it('logs a failure to announce and goes no further', async () => {
    notify.failure = new Error('the provider is away');

    new NotifyOnPermissionRequested(asNotify(), logger.logger).handle({ request: request() });
    await settle();

    expect(logger.withOp('push.send').at(-1)).toMatchObject({ level: 'warn' });
  });

  it('logs a failure to withdraw and goes no further', async () => {
    notify.failure = new Error('the provider is away');

    new CancelOnPermissionResolved(asNotify(), logger.logger).handle({ request: request() });
    await settle();

    expect(logger.withOp('push.send').at(-1)).toMatchObject({ level: 'warn' });
  });
});
