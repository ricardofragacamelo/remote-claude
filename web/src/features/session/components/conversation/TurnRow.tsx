import { Archive, Receipt, TriangleAlert, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type { TurnSummary, TurnUsage } from '../../types/live-session';

/** A number in the reader's language. */
function formatted(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * The rows of the system in the conversation — the end of a turn, a compaction, an undo — are one
 * line each, in a quiet tone (plan 09, B-28): what does not fit is cut on screen, and read whole by
 * a screen reader and in the tooltip.
 */
const SYSTEM_ROW = 'flex min-w-0 items-center gap-1.5 text-ui-xs text-muted-foreground';

/** One row of the system: its icon and its one line, whole in the tooltip. */
function SystemRow({
  icon: Icon,
  text,
  className,
  ...props
}: {
  readonly icon: LucideIcon;
  readonly text: string;
  readonly className?: string;
} & Pick<React.ComponentProps<'li'>, 'role' | 'aria-label'>): React.JSX.Element {
  return (
    <li
      className={className === undefined ? SYSTEM_ROW : `${SYSTEM_ROW} ${className}`}
      title={text}
      {...props}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </li>
  );
}

/** The counts a turn row says, in its order, and how each is said — named in full for the check. */
const TOKEN_PARTS = [
  ['inputTokens', 'sessions.turn.inputTokens'],
  ['outputTokens', 'sessions.turn.outputTokens'],
] as const;

/**
 * The tokens of a turn, as far as the engine counted them: in, out and from the cache — the read and
 * the written together —, each only when it came (plan 28, B-29).
 */
function tokensOf(usage: TurnUsage | null, locale: string, t: TFunction): string {
  const parts = TOKEN_PARTS.flatMap(([field, key]) => {
    const count = usage?.[field];
    return count === undefined ? [] : [t(key, { count: formatted(count, locale) })];
  });
  const cached = [usage?.cacheReadTokens, usage?.cacheWriteTokens].filter(
    (count): count is number => count !== undefined,
  );

  if (cached.length > 0) {
    const count = formatted(
      cached.reduce((sum, each) => sum + each, 0),
      locale,
    );
    parts.push(t('sessions.turn.cacheTokens', { count }));
  }

  return parts.length === 0 ? t('sessions.turn.noTokens') : parts.join(', ');
}

/**
 * The end of a turn: what it cost, how long it took, the tokens in, out and from the cache — in the
 * reader's language (plan 08, B-23, S-97). It says what the engine reported and nothing else: no
 * cost from an engine that reports none (plan 28, S-86) — and a cost of zero as zero (S-87) —, and a
 * turn with no count says so, never `NaN` (S-98).
 *
 * A turn that did not end in `completed` says so instead of the summary above — its own `usage` and
 * `durationMs` are what the engine reports for that outcome, which a crash may leave zeroed, and a
 * row that showed them next to a real-looking cost would read as an answer nobody gave (plan 27,
 * B-10).
 */
export function TurnRow({ turn }: { readonly turn: TurnSummary }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (turn.outcome !== 'completed') {
    return (
      <SystemRow icon={TriangleAlert} text={t(`sessions.turn.outcome.${turn.outcome}`)} />
    );
  }

  const cost =
    turn.costUsd === null
      ? []
      : [
          formatted(Number(turn.costUsd) || 0, locale, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 4,
          }),
        ];
  const seconds = t('sessions.turn.seconds', {
    seconds: formatted(turn.durationMs / 1000, locale, { maximumFractionDigits: 1 }),
  });
  const details = [...cost, seconds, tokensOf(turn.usage, locale, t)].join(' · ');

  return <SystemRow icon={Receipt} text={t('sessions.turn.summary', { details })} />;
}

/** Where the conversation was compacted: what came before is a summary now. */
export function CompactedRow({
  trigger,
  preTokens,
}: {
  readonly trigger: string;
  readonly preTokens: number | null;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const text =
    preTokens === null
      ? t(trigger === 'manual' ? 'sessions.compacted.manual' : 'sessions.compacted.auto')
      : t(
          trigger === 'manual'
            ? 'sessions.compacted.manualTokens'
            : 'sessions.compacted.autoTokens',
          { tokens: formatted(preTokens, i18n.language) },
        );

  return (
    <SystemRow
      icon={Archive}
      text={text}
      className="border-y border-dashed border-border py-1"
      role="separator"
      aria-label={t('sessions.compacted.label')}
    />
  );
}

/**
 * Where the files of the session were put back, in the order it happened: how many went back, how
 * many stayed as they were and how many could not (plan 09, B-28) — file by file is the undo
 * dialog's.
 */
export function RewoundRow({
  entry,
}: {
  readonly entry: { readonly restored: number; readonly kept: number; readonly failed: number };
}): React.JSX.Element {
  const { t } = useTranslation();
  const text = t(entry.failed > 0 ? 'sessions.rewound.failed' : 'sessions.rewound.summary', {
    restored: entry.restored,
    kept: entry.kept,
    failed: entry.failed,
  });

  return <SystemRow icon={Undo2} text={text} />;
}
