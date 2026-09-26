import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  ApproveDeviceUseCase,
  ExpirePendingDevicesUseCase,
  ListDevicesUseCase,
  RegisterDeviceUseCase,
  ResolveDeviceUseCase,
  RevokeDeviceUseCase,
} from '@application/auth';
import type { DeviceConnections, DeviceContext } from '@application/auth';
import {
  DeviceApprovalForbiddenError,
  DeviceNotFoundError,
  DeviceNotRegisteredError,
  DeviceRevokedError,
  PENDING_DEVICE_TTL_MS,
  UserId,
} from '@domain/auth';
import {
  aDevice,
  anApprovedDevice,
  aRevokedDevice,
  deviceOwner,
  registeredAt,
} from '../../../support/builders/device.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryDeviceRepository } from '../../../support/fakes/in-memory-device.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const other = UserId.create('auth|other');
const now = new Date('2026-09-18T12:00:00.000Z');

/** The closer, recording what it was asked to drop. */
class RecordingConnections implements DeviceConnections {
  readonly closed: string[] = [];

  closeForDevice(_userId: UserId, installId: string): number {
    this.closed.push(installId);
    return 1;
  }
}

let devices: InMemoryDeviceRepository;
let events: RecordingAuditEvents;
let trail: RecordAuditEventUseCase;
let clock: FixedClock;

/** The three things every device use case is built against. */
const context = (): DeviceContext => ({ devices, trail, clock });

beforeEach(() => {
  devices = new InMemoryDeviceRepository();
  events = new RecordingAuditEvents();
  trail = new RecordAuditEventUseCase(events, new SequentialIds());
  clock = new FixedClock(now);
});

const registration = {
  userId: deviceOwner,
  installId: 'install-1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  pushToken: 'push-token-abcdef',
  locale: 'pt-BR',
} as const;

function register(): RegisterDeviceUseCase {
  return new RegisterDeviceUseCase(context(), new SequentialIds('01J0000000000000000dev'));
}

describe('RegisterDeviceUseCase', () => {
  // S-01
  it('registers a new installation as pending, and writes it to the trail', async () => {
    const device = await register().execute(registration);

    expect(device.status).toBe('pending');
    expect(devices.rows.size).toBe(1);
    expect(events.kinds).toEqual(['device.registered']);
  });

  // S-02: the app calls this on every launch, so a second call moves a row and adds nothing.
  it('updates the same installation instead of adding a second row', async () => {
    const use = register();
    await use.execute(registration);

    const again = await use.execute({ ...registration, name: 'Pixel 9', pushToken: 'fresh' });

    expect(devices.rows.size).toBe(1);
    expect(again.snapshot().name).toBe('Pixel 9');
    expect(again.pushToken).toBe('fresh');
  });

  // Auditing every reopening of the app would bury the facts somebody is actually looking for.
  it('writes to the trail only the first time', async () => {
    const use = register();
    await use.execute(registration);
    await use.execute(registration);

    expect(events.kinds).toEqual(['device.registered']);
  });

  it('never revives a revoked device by registering it again', async () => {
    devices.seed(aRevokedDevice());

    expect((await register().execute(registration)).status).toBe('revoked');
  });

  // S-59: the same phone under another account is another device, and inherits no approval.
  it('gives the same installation of another user its own row', async () => {
    devices.seed(anApprovedDevice());

    const registered = await register().execute({ ...registration, userId: other });

    expect(registered.status).toBe('pending');
    expect(devices.rows.size).toBe(2);
  });

  // S-12 and S-11 reaching the use case, not only the entity.
  it('accepts a registration with neither a push token nor a language', async () => {
    const device = await register().execute({ ...registration, pushToken: null, locale: null });

    expect(device.pushToken).toBeNull();
    expect(device.locale.value).toBe('en');
  });
});

describe('ListDevicesUseCase', () => {
  it('answers the devices of this user and of nobody else', async () => {
    devices.seed(aDevice(), aDevice({ id: 'dev_2', installId: 'install-2', userId: other }));

    const listed = await new ListDevicesUseCase(devices).execute(deviceOwner);

    expect(listed.map((device) => device.id)).toEqual(['dev_1']);
  });
});

describe('ApproveDeviceUseCase', () => {
  const approve = (): ApproveDeviceUseCase => new ApproveDeviceUseCase(context());

  it('lets a pending device decide, and writes it to the trail', async () => {
    devices.seed(aDevice());

    const approved = await approve().execute({
      userId: deviceOwner,
      deviceId: 'dev_1',
      callerInstallId: null,
    });

    expect(approved.canDecide).toBe(true);
    expect(events.kinds).toEqual(['device.approved']);
  });

  // S-06: a device never approves a device, not even itself.
  it('refuses a caller that is itself a device', async () => {
    devices.seed(aDevice());

    await expect(
      approve().execute({ userId: deviceOwner, deviceId: 'dev_1', callerInstallId: 'install-1' }),
    ).rejects.toThrow(DeviceApprovalForbiddenError);
    expect(events.appended).toHaveLength(0);
  });

  it('answers NOT_FOUND for a device of somebody else, exactly as for one that does not exist', async () => {
    devices.seed(aDevice({ userId: other }));

    await expect(
      approve().execute({ userId: deviceOwner, deviceId: 'dev_1', callerInstallId: null }),
    ).rejects.toThrow(DeviceNotFoundError);
    await expect(
      approve().execute({ userId: deviceOwner, deviceId: 'nope', callerInstallId: null }),
    ).rejects.toThrow(DeviceNotFoundError);
  });

  it('is silent and writes nothing when the device is already approved', async () => {
    devices.seed(anApprovedDevice());
    devices.saves = 0;

    await approve().execute({ userId: deviceOwner, deviceId: 'dev_1', callerInstallId: null });

    expect(devices.saves).toBe(0);
    expect(events.appended).toHaveLength(0);
  });

  it('refuses a revoked device', async () => {
    devices.seed(aRevokedDevice());

    await expect(
      approve().execute({ userId: deviceOwner, deviceId: 'dev_1', callerInstallId: null }),
    ).rejects.toThrow(DeviceRevokedError);
  });

  // S-60: the deadline holds whether or not the sweep has run.
  it('refuses a pending registration past the deadline, even before the sweep removes it', async () => {
    devices.seed(aDevice());
    clock.set(new Date(registeredAt.getTime() + PENDING_DEVICE_TTL_MS + 1));

    await expect(
      approve().execute({ userId: deviceOwner, deviceId: 'dev_1', callerInstallId: null }),
    ).rejects.toThrow(DeviceNotFoundError);
  });

  it('still approves on the sixth day', async () => {
    devices.seed(aDevice());
    clock.set(new Date(registeredAt.getTime() + 6 * 24 * 60 * 60 * 1000));

    const approved = await approve().execute({
      userId: deviceOwner,
      deviceId: 'dev_1',
      callerInstallId: null,
    });

    expect(approved.canDecide).toBe(true);
  });
});

describe('RevokeDeviceUseCase', () => {
  let connections: RecordingConnections;

  beforeEach(() => {
    connections = new RecordingConnections();
  });

  const revoke = (): RevokeDeviceUseCase => new RevokeDeviceUseCase(context(), connections);

  // S-07: the sockets go at once, or the revocation revokes nothing for fifteen minutes.
  it('writes the row, closes the open connections and writes the trail', async () => {
    devices.seed(anApprovedDevice());

    const revoked = await revoke().execute(deviceOwner, 'dev_1');

    expect(revoked.status).toBe('revoked');
    expect(connections.closed).toEqual(['install-1']);
    expect(events.kinds).toEqual(['device.revoked']);
  });

  // S-09: revoking twice is a successful no-op on the row…
  it('is a no-op on the row the second time', async () => {
    devices.seed(aRevokedDevice());
    devices.saves = 0;

    await revoke().execute(deviceOwner, 'dev_1');

    expect(devices.saves).toBe(0);
    expect(events.appended).toHaveLength(0);
  });

  // …and still drops the sockets, because that is usually why somebody clicked again.
  it('still closes the connections of an already revoked device', async () => {
    devices.seed(aRevokedDevice());

    await revoke().execute(deviceOwner, 'dev_1');

    expect(connections.closed).toEqual(['install-1']);
  });

  it('answers NOT_FOUND for a device that belongs to somebody else', async () => {
    devices.seed(aDevice({ userId: other }));

    await expect(revoke().execute(deviceOwner, 'dev_1')).rejects.toThrow(DeviceNotFoundError);
  });
});

describe('ExpirePendingDevicesUseCase', () => {
  const expire = (): ExpirePendingDevicesUseCase => new ExpirePendingDevicesUseCase(context());

  // S-60: the sixth day lives, the eighth is gone, and a second sweep changes nothing.
  it('leaves the sixth day and removes the eighth', async () => {
    devices.seed(aDevice());
    clock.set(new Date(registeredAt.getTime() + 6 * 24 * 60 * 60 * 1000));

    expect(await expire().execute()).toBe(0);

    clock.set(new Date(registeredAt.getTime() + 8 * 24 * 60 * 60 * 1000));

    expect(await expire().execute()).toBe(1);
    expect(devices.rows.size).toBe(0);
    expect(events.kinds).toEqual(['device.expired']);
  });

  it('sweeping twice removes nothing the second time', async () => {
    devices.seed(aDevice());
    clock.set(new Date(registeredAt.getTime() + 8 * 24 * 60 * 60 * 1000));

    await expire().execute();

    expect(await expire().execute()).toBe(0);
    expect(events.kinds).toEqual(['device.expired']);
  });

  it('never touches an approved or a revoked device', async () => {
    devices.seed(anApprovedDevice(), aRevokedDevice({ id: 'dev_2', installId: 'install-2' }));
    clock.set(new Date(registeredAt.getTime() + 400 * 24 * 60 * 60 * 1000));

    expect(await expire().execute()).toBe(0);
    expect(devices.rows.size).toBe(2);
  });
});

describe('ResolveDeviceUseCase', () => {
  const resolve = (): ResolveDeviceUseCase => new ResolveDeviceUseCase(devices);

  it('answers null for a browser, which is not a device and still decides', async () => {
    expect(await resolve().execute(deviceOwner, null)).toBeNull();
    await expect(resolve().ensureCanDecide(deviceOwner, null)).resolves.toBeNull();
  });

  // S-03: a pending device resolves, so it can watch a session.
  it('resolves a pending device', async () => {
    devices.seed(aDevice());

    expect((await resolve().execute(deviceOwner, 'install-1'))?.status).toBe('pending');
  });

  it('refuses an installation nobody registered', async () => {
    await expect(resolve().execute(deviceOwner, 'install-nope')).rejects.toThrow(
      DeviceNotRegisteredError,
    );
  });

  // S-04 and S-05: the two refusals of the decision path.
  it('refuses a pending device that tries to decide', async () => {
    devices.seed(aDevice());

    await expect(resolve().ensureCanDecide(deviceOwner, 'install-1')).rejects.toThrow(
      DeviceNotRegisteredError,
    );
  });

  it('refuses a revoked device that tries to decide', async () => {
    devices.seed(aRevokedDevice());

    await expect(resolve().ensureCanDecide(deviceOwner, 'install-1')).rejects.toThrow(
      DeviceRevokedError,
    );
  });

  it('lets an approved device decide', async () => {
    devices.seed(anApprovedDevice());

    expect((await resolve().ensureCanDecide(deviceOwner, 'install-1'))?.canDecide).toBe(true);
  });

  // S-59, at the boundary that matters: one account's approval is not the other's.
  it('does not find the same installation registered by another user', async () => {
    devices.seed(anApprovedDevice());

    await expect(resolve().ensureCanDecide(other, 'install-1')).rejects.toThrow(
      DeviceNotRegisteredError,
    );
  });
});
