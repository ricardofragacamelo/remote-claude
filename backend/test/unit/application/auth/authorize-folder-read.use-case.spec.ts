import { describe, expect, it } from 'vitest';

import { AuthorizeFolderReadUseCase, ResolveDeviceUseCase } from '@application/auth';
import { DeviceNotRegisteredError, DeviceRevokedError, UserId } from '@domain/auth';
import type { Device } from '@domain/auth';
import {
  aDevice,
  anApprovedDevice,
  aRevokedDevice,
  deviceOwner,
} from '../../../support/builders/device.builder';
import { InMemoryDeviceRepository } from '../../../support/fakes/in-memory-device.repository';

const WEB = 'remote-claude-web';
const MOBILE = 'remote-claude-mobile';

/** The use case over a repository seeded with [devices]. */
function authorize(...devices: Device[]): AuthorizeFolderReadUseCase {
  const repository = new InMemoryDeviceRepository().seed(...devices);

  return new AuthorizeFolderReadUseCase(new ResolveDeviceUseCase(repository), WEB);
}

const reader = (clientId: string | null, userId: UserId = deviceOwner) => ({ userId, clientId });

describe('AuthorizeFolderReadUseCase — 25 · B-32', () => {
  it('lets the web read without a device, as it always has (S-148)', async () => {
    await expect(authorize().execute(reader(WEB), null)).resolves.toBeUndefined();
  });

  it('lets the app read from an approved device of the same person (S-143)', async () => {
    await expect(
      authorize(anApprovedDevice()).execute(reader(MOBILE), 'install-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses the app without the header — leaving it out does not get round the rule (S-145)', async () => {
    await expect(authorize(anApprovedDevice()).execute(reader(MOBILE), null)).rejects.toThrow(
      DeviceNotRegisteredError,
    );
  });

  it('refuses a pending device (S-144)', async () => {
    await expect(authorize(aDevice()).execute(reader(MOBILE), 'install-1')).rejects.toThrow(
      DeviceNotRegisteredError,
    );
  });

  it('refuses a revoked device with its own code (S-146)', async () => {
    await expect(authorize(aRevokedDevice()).execute(reader(MOBILE), 'install-1')).rejects.toThrow(
      DeviceRevokedError,
    );
  });

  it("refuses an unknown installation and another person's (S-146)", async () => {
    const other = UserId.create('auth|other');

    await expect(
      authorize(anApprovedDevice()).execute(reader(MOBILE), 'install-unknown'),
    ).rejects.toThrow(DeviceNotRegisteredError);
    await expect(
      authorize(anApprovedDevice()).execute(reader(MOBILE, other), 'install-1'),
    ).rejects.toThrow(DeviceNotRegisteredError);
  });

  it.each([null, 'some-other-client', ''])(
    'a token whose client is %j needs an approved device like the app (S-147, D-24)',
    async (clientId) => {
      await expect(authorize().execute(reader(clientId), null)).rejects.toThrow(
        DeviceNotRegisteredError,
      );
      await expect(
        authorize(anApprovedDevice()).execute(reader(clientId), 'install-1'),
      ).resolves.toBeUndefined();
    },
  );
});
