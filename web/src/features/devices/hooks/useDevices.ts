import { useCallback, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { useLoad } from '@/shared/hooks/useLoad';
import { approveDevice, fetchDevices, revokeDevice } from '../services/device.service';
import type { Device } from '../types/device';

/** What the screen gets: the four states, what is in flight, and the three things it can do. */
export interface Devices {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly devices: readonly Device[];
  /** The device an approval or a revocation is running for, so its row can say so. */
  readonly pendingId: string | null;
  approve(deviceId: string): void;
  revoke(deviceId: string): void;
  reload(): void;
}

/**
 * The devices, as the screen sees them.
 *
 * The hook is the only layer that knows both sides: React above, the service below. The component
 * never learns that HTTP exists — see docs/architecture/web/01-architecture.md.
 *
 * An approval or a revocation replaces the row it changed rather than reloading the list. The list
 * is what somebody is reading while they click, and having it reorder under them — it is sorted by
 * last seen — is how the wrong device gets revoked.
 */
export function useDevices(): Devices {
  const { load, isLoading, error, setLoad, reload } = useLoad(fetchDevices);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const act = useCallback(
    (deviceId: string, call: (id: string) => Promise<Device>) => {
      setPendingId(deviceId);

      void call(deviceId)
        .then((changed) => {
          setLoad((current) =>
            current.status === 'ready'
              ? {
                  status: 'ready',
                  value: current.value.map((device) =>
                    device.id === changed.id ? changed : device,
                  ),
                }
              : current,
          );
        })
        .catch((failure: AppError) => {
          setLoad(() => ({ status: 'failed', error: failure }));
        })
        .finally(() => {
          setPendingId(null);
        });
    },
    [setLoad],
  );

  const approve = useCallback(
    (deviceId: string) => {
      act(deviceId, approveDevice);
    },
    [act],
  );

  const revoke = useCallback(
    (deviceId: string) => {
      act(deviceId, revokeDevice);
    },
    [act],
  );

  return {
    isLoading,
    error,
    devices: load.status === 'ready' ? load.value : [],
    pendingId,
    approve,
    revoke,
    reload,
  };
}
