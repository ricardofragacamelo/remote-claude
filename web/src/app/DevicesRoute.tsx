import { DeviceList } from '@/features/devices';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useFramedScreen } from './screen-shortcuts';

/**
 * `/devices` — the phones that may answer a permission request, and the ones waiting to be allowed
 * to.
 *
 * A screen of its own, and **not** a section of Settings: approving a phone is a security decision,
 * and it lives beside the audit trail and the rules (plan 06, B-29). The list is today's; the last
 * access, the test push and the history of a device are plan 15's.
 */
export function DevicesRoute(): React.JSX.Element {
  return (
    <ScreenFrame
      help="devices.help"
      {...useFramedScreen('devices.screen.title', 'devices.screen.purpose')}
    >
      <DeviceList />
    </ScreenFrame>
  );
}
