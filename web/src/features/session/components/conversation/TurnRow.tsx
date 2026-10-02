import { Archive, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TurnSummary } from '../../types/live-session';

/** A number in the reader's language. */
function formatted(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
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

  return (
    <li className="flex items-center gap-1.5 text-ui-xs text-muted-foreground">
      <Receipt className="size-3.5" aria-hidden />
      {turn.usage === null
        ? t('sessions.turn.noUsage', { cost, seconds })
        : t('sessions.turn.summary', {
            cost,
            seconds,
            input: formatted(turn.usage.input, locale),
            output: formatted(turn.usage.output, locale),
            cache: formatted(turn.usage.cacheRead + turn.usage.cacheWrite, locale),
          })}
    </li>
  );
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

  return (
    <li
      className="flex items-center gap-1.5 border-y border-dashed border-border py-1 text-ui-xs text-muted-foreground"
      role="separator"
      aria-label={t('sessions.compacted.label')}
    >
      <Archive className="size-3.5" aria-hidden />
      {preTokens === null
        ? t(trigger === 'manual' ? 'sessions.compacted.manual' : 'sessions.compacted.auto')
        : t(
            trigger === 'manual'
              ? 'sessions.compacted.manualTokens'
              : 'sessions.compacted.autoTokens',
            {
              tokens: formatted(preTokens, i18n.language),
            },
          )}
    </li>
  );
}
