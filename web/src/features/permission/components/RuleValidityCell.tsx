import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { agoFrom, untilFrom } from '@/shared/lib/relative-time';
import type { PermissionRule } from '../types/rule';

function fullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/** What `RuleLastUsedCell` and `RuleCreatedCell` both read — a rule, and the clock's own snapshot. */
interface RuleNowProps {
  readonly rule: PermissionRule;
  readonly now: number;
}

/** A relative time, with the exact date in a tooltip — `RuleValidityCell`'s own active rule,
 * `RuleLastUsedCell` and `RuleCreatedCell` all read the same way. */
function RelativeTooltip({
  text,
  full,
  className,
}: {
  readonly text: string;
  readonly full: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{text}</span>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Until when the rule answers — relative, with the exact date in a tooltip, and the seven-day
 * warning as its own chip (S-160's own window, D-13). A revoked or expired rule says when instead,
 * and a disabled one has no validity to count.
 */
export function RuleValidityCell({
  rule,
  expiringSoon,
  now,
}: {
  readonly rule: PermissionRule;
  readonly expiringSoon: boolean;
  readonly now: number;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();

  if (rule.status === 'disabled') {
    return <span className="text-muted-foreground">{t('rules.table.notApplicable')}</span>;
  }

  if (rule.revokedAt !== null) {
    return <span>{t('rules.row.revokedOn', { at: fullDate(rule.revokedAt, i18n.language) })}</span>;
  }

  if (rule.status === 'expired') {
    return <span>{t('rules.row.expiredOn', { at: fullDate(rule.expiresAt, i18n.language) })}</span>;
  }

  const relative = untilFrom(rule.expiresAt, new Date(now), i18n.language);

  return (
    <RelativeTooltip
      text={relative}
      full={fullDate(rule.expiresAt, i18n.language)}
      className={cn(
        'inline-flex rounded-full px-2 py-0.5',
        expiringSoon && 'bg-warning/15 text-warning',
      )}
    />
  );
}

/** "14 · 90 dias" — the use count, in the retention window it was counted over (D-05's own window). */
export function RuleUsageCell({ rule }: { readonly rule: PermissionRule }): React.JSX.Element {
  const { t } = useTranslation();
  const usage = rule.usage;

  if (usage === null || usage === undefined) {
    return <span className="text-muted-foreground">{t('rules.table.notApplicable')}</span>;
  }

  return <span>{t('rules.table.useCount', { count: usage.count, days: usage.windowDays })}</span>;
}

/** When the rule last answered, relative — its own column, apart from the count (S-161). */
export function RuleLastUsedCell({ rule, now }: RuleNowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const lastUsedAt = rule.usage?.lastUsedAt;

  if (lastUsedAt === null || lastUsedAt === undefined) {
    return <span className="text-muted-foreground">{t('rules.table.never')}</span>;
  }

  return (
    <RelativeTooltip
      text={agoFrom(lastUsedAt, new Date(now), i18n.language)}
      full={fullDate(lastUsedAt, i18n.language)}
    />
  );
}

/** When the rule was granted, relative, with the exact date in a tooltip. */
export function RuleCreatedCell({ rule, now }: RuleNowProps): React.JSX.Element {
  const { i18n } = useTranslation();

  return (
    <RelativeTooltip
      text={agoFrom(rule.grantedAt, new Date(now), i18n.language)}
      full={fullDate(rule.grantedAt, i18n.language)}
    />
  );
}
