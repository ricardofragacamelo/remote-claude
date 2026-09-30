import { describe, expect, it, vi } from 'vitest';

import { notify, onNotify } from '@/shared/lib/notify';

describe('notify', () => {
  it('reaches whoever listens, until they stop', () => {
    const listener = vi.fn();
    const stop = onNotify(listener);

    notify({ severity: 'info', messageKey: 'notification.connection.restored' });
    stop();
    notify({ severity: 'info', messageKey: 'notification.connection.restored' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      severity: 'info',
      messageKey: 'notification.connection.restored',
    });
  });

  it('drops what nobody listens to — nobody is signed in — without failing', () => {
    expect(() => {
      notify({ severity: 'error', messageKey: 'notification.command.failed' });
    }).not.toThrow();
  });
});
