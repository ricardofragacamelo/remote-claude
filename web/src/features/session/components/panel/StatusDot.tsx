import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import type { SessionHeaderState } from '../../hooks/useSessionHeader';
import { formatUsd } from '../../lib/money';

/** How the session stands, as the dot says it — by colour, and always by word too. */
type Standing = 'connected' | 'reconnecting' | 'running' | 'ended';

/** The colour of each standing — a role token, never a shade. */
const COLOURS: Readonly<Record<Standing, string>> = {
  connected: 'bg-success',
  reconnecting: 'bg-warning motion-safe:animate-pulse',
  running: 'bg-primary motion-safe:animate-pulse',
  ended: 'bg-muted-foreground',
};

/** The words of each standing — named in full so the i18n check sees each key. */
const WORDS: Readonly<Record<Standing, string>> = {
  connected: 'sessions.dot.connected',
  reconnecting: 'sessions.dot.reconnecting',
  running: 'sessions.dot.running',
  ended: 'sessions.dot.ended',
};

/** The standing of a session: ended first, then the socket, then the turn. */
export function standingOf(session: SessionHeaderState): Standing {
  if (session.ended || session.status === 'closed') {
    return 'ended';
  }

  if (session.connection !== 'ready') {
    return 'reconnecting';
  }

  return session.status === 'idle' || session.status === 'starting' ? 'connected' : 'running';
}

/**
 * Where the session stands, in the header of the panel (plan 09, B-18): a dot whose colour is said
 * in words too — its name and its tooltip, never colour alone (S-38) — with the id of the session
 * and what it cost since it opened (D-11). Before its first turn, it says no cost at all, never
 * "$0" (S-43). How the turn goes is the tail of the conversation's, not the header's.
 */
export function StatusDot({
  session,
}: {
  readonly session: SessionHeaderState;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const standing = standingOf(session);
  const lines = linesOf(session, standing, t, i18n.language);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={lines.join(' · ')}
          className="inline-flex size-touch shrink-0 items-center justify-center md:size-7"
        >
          <span className={cn('size-2 rounded-full', COLOURS[standing])} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/** What the dot says, a line each: how it stands, which session it is, and what it cost. */
function linesOf(
  session: SessionHeaderState,
  standing: Standing,
  t: TFunction,
  language: string,
): string[] {
  const lines = [t(WORDS[standing]), t('sessions.dot.session', { sessionId: session.sessionId })];

  if (session.turns > 0) {
    lines.push(
      t('sessions.status.cost', {
        cost: formatUsd(session.costUsd, language),
        turns: session.turns,
      }),
    );
  }

  return lines;
}
