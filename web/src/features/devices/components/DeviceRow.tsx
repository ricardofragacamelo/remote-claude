import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { Device } from '../types/device';

export interface DeviceRowProps {
  readonly device: Device;
  readonly busy: boolean;
  onApprove(deviceId: string): void;
  onRevoke(deviceId: string): void;
}

/**
 * One device, and what may be done to it.
 *
 * Revoking is destructive, so it asks first and the confirming button is **not** the one that
 * receives focus: the focus goes to the way out. A destructive action one stray Enter away is a
 * destructive action that eventually happens by accident
 * (docs/architecture/web/03-ui-system.md#acessibilidade--não-é-opcional).
 *
 * Approving is not behind a confirmation. It is the action somebody came to this screen to
 * perform, and putting a dialogue in front of the expected click is how people learn to dismiss
 * dialogues without reading them — which is what makes the one on revoke worth having.
 */
export function DeviceRow({
  device,
  busy,
  onApprove,
  onRevoke,
}: DeviceRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus is moved deliberately rather than with `autoFocus`, which is refused by the
  // accessibility lint for good reason — but the reason it is refused is about focus stolen on
  // page load, and this is a dialogue the person just opened. Where it goes is the point: the way
  // out, never the destruction.
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    }
  }, [confirming]);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{device.name}</span>
        <span className="text-xs text-muted-foreground">
          {t('devices.row.platform', { platform: device.platform, appVersion: device.appVersion })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('devices.row.lastSeen', { at: device.lastSeenAt })}
        </span>
        {!device.pushEnabled && (
          <span className="text-xs text-muted-foreground">{t('devices.row.noPush')}</span>
        )}
      </div>

      <span className="text-xs font-medium" data-testid={`device-status-${device.id}`}>
        {t(`devices.status.${device.status}`)}
      </span>

      {device.status === 'pending' && (
        <Button
          size="touch"
          disabled={busy}
          onClick={() => {
            onApprove(device.id);
          }}
        >
          {t('devices.action.approve')}
        </Button>
      )}

      {device.status === 'approved' && !confirming && (
        <Button
          variant="outline"
          size="touch"
          disabled={busy}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('devices.action.revoke')}
        </Button>
      )}

      {device.status === 'approved' && confirming && (
        <div role="group" aria-label={t('devices.confirm.title')} className="flex flex-col gap-2">
          <p className="text-sm">{t('devices.confirm.description', { name: device.name })}</p>
          <div className="flex gap-2">
            {/* First in the DOM, and therefore first in the tab order: the way out, not the
                destruction. */}
            <Button
              ref={cancelRef}
              variant="outline"
              size="touch"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('devices.confirm.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="touch"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onRevoke(device.id);
              }}
            >
              {t('devices.confirm.confirm')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
