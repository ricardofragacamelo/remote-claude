import { Asterisk } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { useElapsed } from '../../hooks/useElapsed';
import { isTurnRunning } from '../../lib/turn';
import { verbOf } from '../../lib/working-verbs';
import type { SessionStatus } from '../../types/live-session';

export interface WorkingIndicatorProps {
  readonly status: SessionStatus;

  /** When the turn began, by the server's clock — `null` when it is not known. */
  readonly turnSince: string | null;

  /** What names the turn — the session and the turns before it: what the verb is drawn from. */
  readonly turn: string;

  /** The tool of the main conversation running now — `null` when none is. */
  readonly tool: string | null;

  /** How many questions wait on the person. */
  readonly waiting: number;

  /**
   * Every one of them is a question of Claude, and none a permission — the indicator says it waits
   * for an answer to a question, never what the question is (plan 24, B-16).
   */
  readonly questionsOnly?: boolean;

  /** Takes the person to the oldest question. */
  onGoToRequest?(): void;
}

/**
 * The last line of the conversation while a turn runs (plan 09, B-21): our asterisk, what Claude is
 * doing — the tool it runs, that it waits on the person, or the verb of the turn —, and for how long.
 * It shows that something is happening when nothing new has arrived; once the turn ends it is gone,
 * and the summary of the turn stands where it was (S-50).
 *
 * The glyph moves only for who has not asked the system for less motion (S-51). What is announced is
 * the **change** of what Claude does, never the clock: the time is outside the live region (S-52).
 */
export function WorkingIndicator(props: WorkingIndicatorProps): React.JSX.Element | null {
  return isTurnRunning(props.status) ? <Working {...props} /> : null;
}

/** The indicator of a turn that runs — its own component, so the clock starts with the turn. */
function Working({
  status,
  turnSince,
  turn,
  tool,
  waiting,
  questionsOnly = false,
  onGoToRequest,
}: WorkingIndicatorProps): React.JSX.Element {
  const { t } = useTranslation();
  const seconds = useElapsed(turnSince);
  const asking = status === 'waitingPermission' || waiting > 0;
  const label = labelOf({ asking, questionsOnly, status, tool, turn }, t);

  return (
    <div data-working-indicator className="flex min-w-0 items-center gap-1.5 text-ui-sm">
      <Asterisk className="size-4 shrink-0 text-primary motion-safe:animate-pulse" aria-hidden />
      <span role="status" className="min-w-0 truncate">
        {asking && onGoToRequest !== undefined ? (
          <button
            type="button"
            onClick={onGoToRequest}
            className="underline underline-offset-4 hover:text-primary"
          >
            {label}
          </button>
        ) : (
          label
        )}
      </span>
      <span className="ml-auto shrink-0 text-ui-xs text-muted-foreground tabular-nums">
        {elapsedOf(seconds, t)}
      </span>
    </div>
  );
}

/** What Claude is doing, in words: waiting on the person, the tool it runs, or the turn's verb. */
function labelOf(
  {
    asking,
    questionsOnly,
    status,
    tool,
    turn,
  }: {
    asking: boolean;
    questionsOnly: boolean;
    status: SessionStatus;
    tool: string | null;
    turn: string;
  },
  t: TFunction,
): string {
  if (asking) {
    return questionsOnly ? t('permission.question.waiting') : t('sessions.working.waiting');
  }

  return status === 'running' && tool !== null
    ? t('sessions.working.runningTool', { tool })
    : t(`sessions.workingVerb.${verbOf(turn)}`);
}

/** How long the turn has run: seconds, then minutes and seconds. */
function elapsedOf(seconds: number, t: TFunction): string {
  return seconds < 60
    ? t('sessions.working.seconds', { seconds })
    : t('sessions.working.minutes', {
        minutes: Math.floor(seconds / 60),
        seconds: String(seconds % 60).padStart(2, '0'),
      });
}
