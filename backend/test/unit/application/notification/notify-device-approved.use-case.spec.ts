import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyDeviceApprovedUseCase } from '@application/notification';
import { anApprovedDevice } from '../../../support/builders/device.builder';
import { RecordingPushSender, RecordingPushTokens } from '../../../support/fakes/recording-push';

/** Telling a phone it was approved — plan 17, F3. */

let sender: RecordingPushSender;
let tokens: RecordingPushTokens;

beforeEach(() => {
  sender = new RecordingPushSender();
  tokens = new RecordingPushTokens();
});

const notify = (): NotifyDeviceApprovedUseCase => new NotifyDeviceApprovedUseCase(sender, tokens);

describe('NotifyDeviceApprovedUseCase', () => {
  it('sends one approval to the device, in its language', async () => {
    const device = anApprovedDevice();

    expect(await notify().execute(device)).toBe('delivered');
    expect(sender.kinds).toEqual(['deviceApproved']);
    expect(sender.sent[0]?.target).toEqual({
      deviceId: device.id,
      token: device.pushToken,
      locale: device.locale,
    });
  });

  // S-123 · no token, nothing to send to — and that is said, not thrown.
  it('sends nothing to a device with no token', async () => {
    expect(await notify().execute(anApprovedDevice({ pushToken: null }))).toBe('noToken');
    expect(sender.sent).toHaveLength(0);
  });

  // S-124 · a token the provider says is gone is forgotten; the device stays approved.
  it('forgets a token the provider refused, and tries once', async () => {
    sender.answer = () => 'tokenRejected';
    const device = anApprovedDevice();

    expect(await notify().execute(device)).toBe('tokenRejected');
    expect(tokens.forgotten).toEqual([device]);
    expect(sender.sent).toHaveLength(1);
  });

  // S-124 · D-15: one attempt; a failure is answered, never retried, and the token stays.
  it.each(['failed', 'rejected'] as const)(
    'answers %s once, keeping the token',
    async (delivery) => {
      sender.answer = () => delivery;

      expect(await notify().execute(anApprovedDevice())).toBe(delivery);
      expect(sender.sent).toHaveLength(1);
      expect(tokens.forgotten).toHaveLength(0);
    },
  );
});
