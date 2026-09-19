import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { SessionStatus } from '../types/live-session';

export interface SessionControlsProps {
  readonly status: SessionStatus;

  /** Whether this browser opened the session. Only its owner may end it. */
  readonly isOwner: boolean;

  onInterrupt(): void;
  onClose(): void;
}

/**
 * What can be done to a session that is running.
 *
 * **Closing is the owner's alone, and for everybody else the control is disabled with an
 * explanation** rather than hidden. A rule of authorisation that is invisible looks like a bug the
 * first time somebody runs into it; one that says why is a rule.
 */
export function SessionControls({
  status,
  isOwner,
  onInterrupt,
  onClose,
}: SessionControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const isOver = status === 'closed';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase opacity-70">{t(`session.status.${status}`)}</span>

      <Button variant="outline" size="touch" disabled={isOver} onClick={onInterrupt}>
        {t('session.controls.interrupt')}
      </Button>

      <Button
        variant="destructive"
        size="touch"
        disabled={isOver || !isOwner}
        title={isOwner ? undefined : t('session.controls.closeNotOwner')}
        onClick={onClose}
      >
        {t('session.controls.close')}
      </Button>

      {!isOwner && (
        <span className="text-xs opacity-70">{t('session.controls.closeNotOwner')}</span>
      )}
    </div>
  );
}
