import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { useDevices } from '../hooks/useDevices';
import { DeviceRow } from './DeviceRow';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'devices.list.title',
  description: 'devices.list.description',
  loading: 'devices.list.loading',
  emptyTitle: 'devices.list.emptyTitle',
  emptyDescription: 'devices.list.emptyDescription',
};

/**
 * The phones that may answer a permission request, and the ones waiting to be allowed to.
 *
 * This screen is the reason the registration proves anything: approval starts from a session that
 * is already trusted, and a device never approves itself
 * ([D-02](../../../../docs/plans/02-mobile-approval/decisions.md)).
 *
 * The empty state matters here: nobody has installed the app yet, which is not a failure, and
 * "no devices" on its own reads as one.
 *
 * It imports a hook, and nothing else: no service, no `api.ts`.
 */
export function DeviceList(): React.JSX.Element {
  const { isLoading, error, devices, pendingId, approve, revoke, reload } = useDevices();

  return (
    <LoadedList
      keys={KEYS}
      isLoading={isLoading}
      error={error}
      isEmpty={devices.length === 0}
      onRetry={reload}
    >
      {devices.map((device) => (
        <DeviceRow
          key={device.id}
          device={device}
          busy={pendingId === device.id}
          onApprove={approve}
          onRevoke={revoke}
        />
      ))}
    </LoadedList>
  );
}
