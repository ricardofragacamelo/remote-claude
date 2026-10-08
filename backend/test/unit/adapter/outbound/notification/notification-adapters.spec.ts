import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyDeviceApprovedUseCase, NotifyPermissionUseCase } from '@application/notification';
import { ForgetPushTokenUseCase, ListApprovedDevicesUseCase } from '@application/auth';
import type { DeviceContext } from '@application/auth';
import { RecordAuditEventUseCase } from '@application/audit';
import { PermissionRequest, normalizeQuestion } from '@domain/permission';
import { SessionId } from '@domain/session';
import { UserId } from '@domain/auth';
import type { Device } from '@domain/auth';
import { DEVICE_APPROVED, EmitterDeviceEvents } from '@adapter/outbound/auth/emitter-device.events';
import { NotifyOnDeviceApproved } from '@adapter/outbound/notification/device-notification.listener';
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
        question: false,
      },
    ]);
    expect(JSON.stringify(notify.announced)).not.toContain('rm -rf');
  });

  it('announces a question of Claude as one, with nothing of what it asks — plan 24, S-52', async () => {
    const question = PermissionRequest.open({
      id: 'req-2',
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      userId: deviceOwner,
      projectPath: null,
      toolUseId: 'toolu_2',
      toolName: 'AskUserQuestion',
      input: { questions: [{ question: 'Which secret plan?' }] },
      interaction: normalizeQuestion({ questions: [] }),
      riskHint: 'read',
      requestedAt: at,
      expiresAt: new Date(at.getTime() + 600_000),
    });

    new NotifyOnPermissionRequested(asNotify(), logger.logger).handle({ request: question });
    await settle();

    expect(notify.announced).toEqual([
      expect.objectContaining({ requestId: 'req-2', question: true }),
    ]);
    expect(JSON.stringify(notify.announced)).not.toContain('secret');
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

describe('the approval of a device, on the bus — plan 17, F3', () => {
  /** The use case, recording the devices it was asked about. */
  class RecordingDeviceNotify {
    readonly told: Device[] = [];
    failure: Error | null = null;

    execute(device: Device): Promise<string> {
      this.told.push(device);
      return this.failure === null ? Promise.resolve('delivered') : Promise.reject(this.failure);
    }
  }

  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('tells the approved device, and logs how it went', async () => {
    const notify = new RecordingDeviceNotify();
    const device = anApprovedDevice();

    new NotifyOnDeviceApproved(
      notify as unknown as NotifyDeviceApprovedUseCase,
      logger.logger,
    ).handle({ device });
    await settle();

    expect(notify.told).toEqual([device]);
    expect(logger.withOp('push.send').at(-1)).toMatchObject({
      level: 'debug',
      kind: 'deviceApproved',
      deviceId: device.id,
      outcome: 'delivered',
    });
  });

  it('logs a failure and goes no further', async () => {
    const notify = new RecordingDeviceNotify();
    notify.failure = new Error('the provider is away');

    new NotifyOnDeviceApproved(
      notify as unknown as NotifyDeviceApprovedUseCase,
      logger.logger,
    ).handle({ device: anApprovedDevice() });
    await settle();

    expect(logger.withOp('push.send').at(-1)).toMatchObject({ level: 'warn' });
  });

  it('is published on the bus, and a consumer that throws never reaches the approval', () => {
    const bus = new EventEmitter2();
    const heard: unknown[] = [];
    bus.on(DEVICE_APPROVED, (event: unknown) => heard.push(event));
    const events = new EmitterDeviceEvents(bus, logger.logger);
    const event = { device: anApprovedDevice() };

    events.approved(event);
    expect(heard).toEqual([event]);

    bus.on(DEVICE_APPROVED, () => {
      throw new Error('a consumer broke');
    });
    expect(() => {
      events.approved(event);
    }).not.toThrow();
    expect(logger.withOp('device.approve').at(-1)).toMatchObject({ level: 'error' });
  });
});
