import { useCallback } from 'react';

import type { ConnectionStatus } from '@/shared/api/ws-client';
import { isReconnecting, useConnectionChange } from '@/shared/hooks/useConnectionStatus';
import { notify } from '@/shared/lib/notify';

/**
 * Tells the person when the connection to the machine drops, and when it comes back — something
 * they did not ask about and need to know (06 · D-17).
 *
 * Once per drop: a socket that goes from reconnecting to held back is still the same drop. Opening
 * the app, and signing out, say nothing.
 *
 * @param onRestored what else the return of the connection calls for — reading the centre again,
 *   sending what could not be sent; has to be stable
 */
export function useConnectionNotices(onRestored: () => void): void {
  useConnectionChange(
    useCallback(
      (was: ConnectionStatus, now: ConnectionStatus) => {
        if (was === 'ready' && isReconnecting(now)) {
          notify({ severity: 'warning', messageKey: 'notification.connection.lost' });
        } else if (isReconnecting(was) && now === 'ready') {
          notify({ severity: 'info', messageKey: 'notification.connection.restored' });
          onRestored();
        }
      },
      [onRestored],
    ),
  );
}
