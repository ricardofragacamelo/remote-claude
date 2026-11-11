import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { PermissionDecision } from '../types/permission';
import { RuleWizardOption } from './RuleWizardOption';

const OPTION_CLASS = 'flex items-start gap-3 rounded-md border p-3 text-left';

export interface NewRuleDecisionStepProps {
  readonly decision: PermissionDecision | null;
  onPick(decision: PermissionDecision): void;
}

/** Step 3: Allow without asking, or Block always — each with what it means, never a bare word
 * (plan 15, B-27, step 3). D-03: both ask for the second step at `review`, with the same weight —
 * a `deny` surprises just as much as a wide `allow`, the other way round. */
export function NewRuleDecisionStep({
  decision,
  onPick,
}: NewRuleDecisionStepProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col gap-3"
      role="radiogroup"
      aria-label={t('rules.wizard.decisionStepLabel')}
    >
      <RuleWizardOption
        className={OPTION_CLASS}
        pressed={decision === 'allow'}
        onClick={() => {
          onPick('allow');
        }}
      >
        <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span className="flex flex-col gap-0.5">
          <span className="text-ui font-ui-strong">{t('rules.decision.allow')}</span>
          <span className="text-ui-sm text-muted-foreground">
            {t('rules.wizard.decisionAllowBody')}
          </span>
        </span>
      </RuleWizardOption>
      <RuleWizardOption
        className={OPTION_CLASS}
        pressed={decision === 'deny'}
        onClick={() => {
          onPick('deny');
        }}
      >
        <Ban className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span className="flex flex-col gap-0.5">
          <span className="text-ui font-ui-strong">{t('rules.decision.deny')}</span>
          <span className="text-ui-sm text-muted-foreground">
            {t('rules.wizard.decisionDenyBody')}
          </span>
        </span>
      </RuleWizardOption>
    </div>
  );
}
