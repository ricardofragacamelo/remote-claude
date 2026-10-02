import { useTranslation } from 'react-i18next';

import type { SessionStatus } from '../../types/live-session';
import { formatUsd } from '../../lib/money';

/** The statuses that mean something is happening — the others are said by the session's own line. */
const BUSY: ReadonlySet<SessionStatus> = new Set(['thinking', 'running', 'waitingPermission']);

/**
 * Where the turn is — thinking, running a tool, waiting on the person, which leads to the question
 * (S-96) — and what the session has cost **since it opened**, each turn counted once (S-99). The
 * cost per day, folder and model is plan 14's.
 */
export function TurnStatus({
  sessionId,
  status,
  costUsd,
  turns,
}: {
  readonly sessionId: string;
  readonly status: SessionStatus;

  /** What the session has cost since it opened, as the contract writes money: a string. */
  readonly costUsd: string;

  /** How many turns that is. */
  readonly turns: number;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const cost = formatUsd(costUsd, i18n.language);

  return (
    <div className="flex flex-wrap items-center gap-2 text-ui-xs text-muted-foreground">
      {BUSY.has(status) && (
        <span role="status" className="font-ui-strong text-foreground">
          {status === 'waitingPermission' ? (
            <a href={`#permission-queue-${sessionId}`} className="underline underline-offset-4">
              {t('sessions.status.waitingPermission')}
            </a>
          ) : (
            t(`sessions.status.${status}`)
          )}
        </span>
      )}
      {turns > 0 && <span>{t('sessions.status.cost', { cost, turns })}</span>}
    </div>
  );
}
