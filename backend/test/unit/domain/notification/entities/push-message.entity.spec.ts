import { describe, expect, it } from 'vitest';

import { DeviceLocale } from '@domain/auth';
import { PushMessage } from '@domain/notification';
import type { PermissionReference, PushTarget } from '@domain/notification';

const target: PushTarget = {
  deviceId: 'dev_1',
  token: 'push-token-abcdef',
  locale: DeviceLocale.create('pt-BR'),
};

const reference: PermissionReference = {
  sessionId: 'ses-1',
  requestId: 'req-1',
  expiresAt: '2026-09-18T10:02:00.000Z',
};

describe('PushMessage', () => {
  describe('the question', () => {
    // S-20: this is what lets the tap open the right card.
    it('carries the session, the request and the deadline', () => {
      const message = PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

      expect(message.reference).toEqual(reference);
    });

    it('carries only the parameters it was given, and they are the tool name', () => {
      const message = PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

      expect(message.params).toEqual({ toolName: 'Bash' });
    });

    // S-19: the payload has no field an output could go in. There is no setter, no free-form
    // body, and the only way to build one is a factory that takes a closed reference.
    it('has no field for the content of a file or the output of a command', () => {
      const message = PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

      expect(Object.keys(message.reference)).toEqual(['sessionId', 'requestId', 'expiresAt']);
      expect(JSON.stringify(message.reference)).not.toContain('/');
    });

    it('is meant to be seen', () => {
      expect(PushMessage.permissionRequested(target, reference, {}).isSilent).toBe(false);
    });
  });

  describe('the withdrawal', () => {
    // A provider cannot take a notification back, so the withdrawal is a message of its own.
    it('is silent, and says nothing', () => {
      const message = PushMessage.permissionResolved(target, reference);

      expect(message.isSilent).toBe(true);
      expect(message.params).toEqual({});
    });

    it('names the same request, which is what it is withdrawing', () => {
      expect(PushMessage.permissionResolved(target, reference).reference).toEqual(reference);
    });
  });

  // D-15: the operating system replaces a notification with the same tag rather than stacking a
  // second, and the withdrawal names the same tag.
  it('is tagged by the request, so one question is one notification', () => {
    expect(PushMessage.permissionRequested(target, reference, {}).tag).toBe('req-1');
    expect(PushMessage.permissionResolved(target, reference).tag).toBe('req-1');
  });

  it('keeps the device it is going to, and the language it is rendered in', () => {
    const message = PushMessage.permissionRequested(target, reference, {});

    expect(message.target.deviceId).toBe('dev_1');
    expect(message.target.locale.value).toBe('pt-BR');
  });
});
