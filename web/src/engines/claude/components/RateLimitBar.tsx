import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { untilFrom } from '@/shared/lib/relative-time';
import { rateLimitWindowLabelKey } from '../lib/rate-limit-labels';
import type { RateLimitWindow } from '../types/rate-limits';

/** The tone of each status — colour is never the only way to tell them apart (the word is too). */
const TONE: Readonly<Record<RateLimitWindow['status'], string>> = {
  allowed: 'bg-primary',
  allowedWarning: 'bg-warning',
  rejected: 'bg-destructive',
};

/** One rate-limit window: its label, a bar at its utilization, and when it resets. */
export function RateLimitBar({ window }: { readonly window: RateLimitWindow }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const labelKey = rateLimitWindowLabelKey(window.kind);
  // The server's own label for a per-model window (`model_scoped`, "Fable") — never put through
  // `t()`: it is data from the account, not a string this build wrote (plan 16, D-09).
  const label = window.displayName ?? (labelKey === null ? window.kind : t(labelKey));
  const percent = window.utilizationPercent;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-ui-sm">
        <span className="font-ui-strong">{label}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span>{t(`engines.claude.usage.status.${window.status}`)}</span>
          <span>
            {percent === null ? t('engines.claude.usage.noReading') : `${String(percent)}%`}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent === null ? {} : { 'aria-valuenow': percent })}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width]', TONE[window.status])}
          style={{ width: `${String(percent ?? 0)}%` }}
        />
      </div>
      {window.resetsAt !== null && (
        <p className="text-ui-xs text-muted-foreground">
          {t('engines.claude.usage.resetsAt', {
            when: untilFrom(window.resetsAt, new Date(), i18n.language),
          })}
        </p>
      )}
    </div>
  );
}
