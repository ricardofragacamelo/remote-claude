import { beforeEach, describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { ForgetPushTokenUseCase, ListApprovedDevicesUseCase } from '@application/auth';
import type { DeviceContext } from '@application/auth';
import { UserId } from '@domain/auth';
import {
  aDevice,
  anApprovedDevice,
  aRevokedDevice,
  deviceOwner,
} from '../../../support/builders/device.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryDeviceRepository } from '../../../support/fakes/in-memory-device.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const other = UserId.create('auth|other');

let devices: InMemoryDeviceRepository;

/**
 * The context both use cases are built against.
 *
 * Neither reading the approved devices nor erasing a dead token is an account fact anybody
 * audits, so the trail is the real object with nothing asked of it.
 */
const context = (): DeviceContext => ({
  devices,
  trail: new RecordAuditEventUseCase(new RecordingAuditEvents(), new SequentialIds()),
  clock: new FixedClock(new Date('2026-09-18T10:00:00.000Z')),
});

beforeEach(() => {
  devices = new InMemoryDeviceRepository();
});

describe('ListApprovedDevicesUseCase', () => {
  // D-04: notifying only the last active phone fails exactly when the phone was left behind.
  it('answers every approved device of the user', async () => {
    devices.seed(
      anApprovedDevice(),
      anApprovedDevice({ id: 'dev_2', installId: 'install-2' }),
      aDevice({ id: 'dev_3', installId: 'install-3' }),
      aRevokedDevice({ id: 'dev_4', installId: 'install-4' }),
    );

    const found = await new ListApprovedDevicesUseCase(context()).execute(deviceOwner);

    expect(found.map((device) => device.id)).toEqual(['dev_1', 'dev_2']);
  });

  it('never answers the device of another user', async () => {
    devices.seed(anApprovedDevice({ userId: other }));

    expect(await new ListApprovedDevicesUseCase(context()).execute(deviceOwner)).toEqual([]);
  });

  it('answers nothing when nobody has approved anything', async () => {
    expect(await new ListApprovedDevicesUseCase(context()).execute(deviceOwner)).toEqual([]);
  });
});

describe('ForgetPushTokenUseCase', () => {
  // S-61 and D-13: revoking would charge a fresh approval through the browser every time the
  // operating system rotates a token.
  it('erases the token and leaves the device approved — S-61', async () => {
    devices.seed(anApprovedDevice());

    expect(await new ForgetPushTokenUseCase(context()).execute(deviceOwner, 'dev_1')).toBe(true);

    const stored = await devices.findById(deviceOwner, 'dev_1');
    expect(stored?.pushToken).toBeNull();
    expect(stored?.canDecide).toBe(true);
  });

  it('is a no-op on a device that has no token left', async () => {
    devices.seed(anApprovedDevice({ pushToken: null }));

    expect(await new ForgetPushTokenUseCase(context()).execute(deviceOwner, 'dev_1')).toBe(true);
    expect((await devices.findById(deviceOwner, 'dev_1'))?.pushToken).toBeNull();
  });

  // A device that has gone in the meantime is not there any more, and that is not a failure:
  // there is no token left to erase.
  it('answers false for a device that is not there', async () => {
    expect(await new ForgetPushTokenUseCase(context()).execute(deviceOwner, 'dev_nobody')).toBe(
      false,
    );
  });

  it('never touches the device of another user', async () => {
    devices.seed(anApprovedDevice({ userId: other }));

    expect(await new ForgetPushTokenUseCase(context()).execute(deviceOwner, 'dev_1')).toBe(false);
    expect((await devices.findById(other, 'dev_1'))?.pushToken).not.toBeNull();
  });
});
