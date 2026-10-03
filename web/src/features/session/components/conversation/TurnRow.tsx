import { Archive, Receipt, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TurnSummary } from '../../types/live-session';

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

/**
 * The end of a turn: what it cost, how long it took, the tokens in, out and from the cache — in the
 * reader's language (plan 08, B-23, S-97). A turn interrupted before the model answered has no
 * usage: it says what it has, and never `NaN` (S-98).
 */
export function TurnRow({ turn }: { readonly turn: TurnSummary }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const cost = formatted(Number(turn.costUsd) || 0, locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
  const seconds = formatted(turn.durationMs / 1000, locale, { maximumFractionDigits: 1 });

  const text =
    turn.usage === null
      ? t('sessions.turn.noUsage', { cost, seconds })
      : t('sessions.turn.summary', {
          cost,
          seconds,
          input: formatted(turn.usage.input, locale),
          output: formatted(turn.usage.output, locale),
          cache: formatted(turn.usage.cacheRead + turn.usage.cacheWrite, locale),
        });

  return <SystemRow icon={Receipt} text={text} />;
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
