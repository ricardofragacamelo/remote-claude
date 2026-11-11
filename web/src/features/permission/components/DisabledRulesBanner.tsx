import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { useRules } from '../hooks/useRules';

export interface DisabledRulesBannerProps {
  readonly count: number;

  /** Opens the rule-authoring wizard with the decision, scope and folder prefilled — never the
   * pattern (S-225): the old pattern is the engine's own grammar, not the canonical one the wizard
   * writes. The wizard itself is a later task's (plan 15, B-27); until it exists, this opens nothing
   * — the banner and its list are real today, the hand-off is not. */
  onRecreate(rule: {
    readonly decision: string;
    readonly scope: string;
    readonly folder: string | null;
  }): void;
}

/**
 * How many rules the plan 28 migration could not translate to the canonical grammar, with the way
 * to see them and to start one again (S-225). Nothing here reactivates or deletes a disabled rule —
 * it has nothing left to answer with, only a reason to show and a pattern to read, never reparse.
 */
export function DisabledRulesBanner({
  count,
  onRecreate,
}: DisabledRulesBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (count === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        {t('rules.disabled.banner', { count })}
        <LearnMore section="rules-disabled" topic={t('rules.disabled.title')} />
      </span>
      <Button
        variant="outline"
        size="touch"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('rules.disabled.open')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rules.disabled.title')}</DialogTitle>
            <DialogDescription>{t('rules.disabled.description')}</DialogDescription>
          </DialogHeader>
          {open && <DisabledRulesList onRecreate={onRecreate} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DisabledRulesList({
  onRecreate,
}: Pick<DisabledRulesBannerProps, 'onRecreate'>): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoading, error, rules, reload } = useRules({ status: ['disabled'] });

  if (isLoading) {
    return <p role="status">{t('rules.disabled.loading')}</p>;
  }

  if (error !== null) {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p>{t(error.messageKey, error.params)}</p>
        <Button variant="outline" size="touch" onClick={reload}>
          {t('rules.disabled.retry')}
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label={t('rules.disabled.title')}>
      {rules.map((rule) => (
        <li key={rule.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
          <code className="font-mono text-xs">{rule.legacyPattern ?? rule.pattern}</code>
          {rule.disabledReason != null && (
            <p className="text-xs text-muted-foreground">
              {t(rule.disabledReason.messageKey, rule.disabledReason.params)}
            </p>
          )}
          <span className="text-xs">
            {t('rules.disabled.scopeDecision', {
              scope: t(`rules.scope.${rule.scope}`),
              decision: t(`rules.decision.${rule.decision}`),
            })}
          </span>
          <Button
            variant="outline"
            size="touch"
            onClick={() => {
              onRecreate({ decision: rule.decision, scope: rule.scope, folder: rule.projectPath });
            }}
          >
            {t('rules.disabled.recreate')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
