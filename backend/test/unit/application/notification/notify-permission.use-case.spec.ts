import { beforeEach, describe, expect, it } from 'vitest';

import { NotificationRegistry, NotifyPermissionUseCase } from '@application/notification';
import type { NotifyPermissionCommand } from '@application/notification';
import { PushMessage } from '@domain/notification';
import type { PushTarget } from '@domain/notification';
import type { Device } from '@domain/auth';
import { anApprovedDevice, deviceOwner } from '../../../support/builders/device.builder';
import {
  RecordingPushSender,
  RecordingPushTokens,
  StubPushAudience,
} from '../../../support/fakes/recording-push';

const expiresAt = new Date('2026-09-18T10:02:00.000Z');

const command: NotifyPermissionCommand = {
  userId: deviceOwner,
  sessionId: 'ses-1',
  requestId: 'req-1',
  expiresAt,
  toolName: 'Bash',
};

/** The composition the module performs, repeated here so the use case is exercised as wired. */
const render = (target: PushTarget, asked: NotifyPermissionCommand): PushMessage =>
  PushMessage.permissionRequested(
    target,
    {
      sessionId: asked.sessionId,
      requestId: asked.requestId,
      expiresAt: asked.expiresAt.toISOString(),
    },
    { toolName: asked.toolName },
  );

let sender: RecordingPushSender;
let tokens: RecordingPushTokens;
let registry: NotificationRegistry;

beforeEach(() => {
  sender = new RecordingPushSender();
  tokens = new RecordingPushTokens();
  registry = new NotificationRegistry();
});

function notify(devices: readonly Device[], watching = false): NotifyPermissionUseCase {
  return new NotifyPermissionUseCase(
    new StubPushAudience(devices, watching),
    sender,
    tokens,
    registry,
    render,
  );
}

const phone = anApprovedDevice({ pushToken: 'token-one' });
const tablet = anApprovedDevice({ id: 'dev_2', installId: 'install-2', pushToken: 'token-two' });

describe('announcing a question', () => {
  // S-15
  it('sends when nobody is watching that session — S-15', async () => {
    expect(await notify([phone]).execute(command)).toBe('announced');
    expect(sender.deviceIds).toEqual(['dev_1']);
  });

  // S-16: they have already been asked. A notification on top of the card is the noise that
  // teaches people to dismiss notifications.
  it('sends nothing when somebody is watching — S-16', async () => {
    expect(await notify([phone], true).execute(command)).toBe('somebodyIsWatching');
    expect(sender.sent).toEqual([]);
  });

  // S-25
  it('sends to every approved device, not only the last one — S-25', async () => {
    await notify([phone, tablet]).execute(command);

    expect(sender.deviceIds).toEqual(['dev_1', 'dev_2']);
  });

  it('skips a device with no token, and still reaches the others', async () => {
    const silent = anApprovedDevice({ id: 'dev_3', installId: 'install-3', pushToken: null });

    await notify([silent, phone]).execute(command);

    expect(sender.deviceIds).toEqual(['dev_1']);
  });

  it('answers that there was nobody to tell, which is not a failure', async () => {
    expect(await notify([]).execute(command)).toBe('nobodyToTell');
    expect(sender.sent).toEqual([]);
  });

  // S-24: the SDK redelivers, the deadline is extended, a reconnect replays — none of those is a
  // second question.
  it('never announces the same request twice — S-24', async () => {
    const use = notify([phone]);
    await use.execute(command);

    expect(await use.execute(command)).toBe('alreadyAnnounced');
    expect(sender.sent).toHaveLength(1);
  });

  // S-20
  it('carries the session, the request and the deadline', async () => {
    await notify([phone]).execute(command);

    expect(sender.sent[0]?.reference).toEqual({
      sessionId: 'ses-1',
      requestId: 'req-1',
      expiresAt: '2026-09-18T10:02:00.000Z',
    });
  });

  // S-19: the only thing about the tool that crosses is its name.
  it('carries the tool name and nothing else about the tool — S-19', async () => {
    await notify([phone]).execute(command);

    expect(sender.sent[0]?.params).toEqual({ toolName: 'Bash' });
  });

  // S-61
  it('erases a token the provider refused, and leaves the device approved — S-61', async () => {
    sender.answer = () => 'tokenRejected';

    await notify([phone]).execute(command);

    expect(tokens.forgotten.map((device) => device.id)).toEqual(['dev_1']);
    expect(tokens.forgotten[0]?.canDecide).toBe(true);
  });

  // S-23: the request is still valid in the browser, and the deadline still decides.
  it('says nothing about a provider that merely failed — S-23', async () => {
    sender.answer = () => 'failed';

    expect(await notify([phone]).execute(command)).toBe('announced');
    expect(tokens.forgotten).toEqual([]);
  });

  it('erases only the token that was refused, when two devices answer differently', async () => {
    sender.answer = (message) =>
      message.target.deviceId === 'dev_2' ? 'tokenRejected' : 'delivered';

    await notify([phone, tablet]).execute(command);

    expect(tokens.forgotten.map((device) => device.id)).toEqual(['dev_2']);
  });
});

describe('withdrawing it', () => {
  const reference = {
    sessionId: 'ses-1',
    requestId: 'req-1',
    expiresAt: expiresAt.toISOString(),
  };

  // S-21 and S-22: however the question ended, the notification for it goes.
  it('tells exactly the devices that were told — S-21', async () => {
    const use = notify([phone, tablet]);
    await use.execute(command);
    sender.sent.length = 0;

    expect(await use.cancel(deviceOwner, reference)).toBe(2);
    expect(sender.deviceIds).toEqual(['dev_1', 'dev_2']);
    expect(sender.kinds).toEqual(['permissionResolved', 'permissionResolved']);
  });

  it('tells nobody when nobody was told — S-22', async () => {
    const use = notify([phone], true);
    await use.execute(command);

    expect(await use.cancel(deviceOwner, reference)).toBe(0);
    expect(sender.sent).toEqual([]);
  });

  it('withdraws once: a second cancellation has nothing left to withdraw', async () => {
    const use = notify([phone]);
    await use.execute(command);
    await use.cancel(deviceOwner, reference);
    sender.sent.length = 0;

    expect(await use.cancel(deviceOwner, reference)).toBe(0);
    expect(sender.sent).toEqual([]);
  });

  // S-63: three questions are three notifications, and each is withdrawn by its own request.
  it('withdraws one question without touching the others — S-63', async () => {
    const use = notify([phone]);
    await use.execute(command);
    await use.execute({ ...command, requestId: 'req-2' });
    await use.execute({ ...command, requestId: 'req-3' });
    sender.sent.length = 0;

    await use.cancel(deviceOwner, { ...reference, requestId: 'req-2' });

    expect(sender.sent.map((message) => message.tag)).toEqual(['req-2']);
    expect(registry.size).toBe(2);
  });

  it('erases a token the provider refuses on the way out too', async () => {
    const use = notify([phone]);
    await use.execute(command);
    sender.answer = () => 'tokenRejected';

    await use.cancel(deviceOwner, reference);

    expect(tokens.forgotten.map((device) => device.id)).toEqual(['dev_1']);
  });

  // A device that has gone in the meantime is not there any more, and that is not a failure.
  it('says nothing about a device that is no longer approved', async () => {
    const use = notify([phone]);
    await use.execute(command);
    sender.answer = () => 'tokenRejected';

    const forgetful = new NotifyPermissionUseCase(
      new StubPushAudience([], false),
      sender,
      tokens,
      registry,
      render,
    );

    await expect(forgetful.cancel(deviceOwner, reference)).resolves.toBe(1);
    expect(tokens.forgotten).toEqual([]);
  });
});

describe('the registry of what was announced', () => {
  it('remembers a request and forgets it once it is taken', () => {
    registry.remember('req-1', []);

    expect(registry.has('req-1')).toBe(true);
    expect(registry.take('req-1')).toEqual([]);
    expect(registry.has('req-1')).toBe(false);
  });

  it('answers nothing for a request nobody announced', () => {
    expect(registry.take('req-nobody')).toEqual([]);
  });

  it('counts what is still open', () => {
    registry.remember('req-1', []);
    registry.remember('req-2', []);

    expect(registry.size).toBe(2);
  });
});
