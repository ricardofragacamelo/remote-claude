import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useRuleSimulation } from '../hooks/useRuleSimulation';
import { ruleInvocationLabel } from '../lib/rule-invocation-label';
import type { SimulationLimit } from '../lib/simulation-input';
import { SIMULATION_LIMITS, isEmptyTrail, simulationRequestOf } from '../lib/simulation-input';
import type { PermissionDecision } from '../types/permission';
import type { RuleSimulation } from '../types/rule';
import { RadioOptionGroup } from './RadioOptionGroup';
import { RuleFailureMessage } from './RuleFailureMessage';

export interface SimulationPanelProps {
  /** "Se esta regra existisse" — the draft being authored, never sent until it is granted. */
  readonly add?: readonly { pattern: string; decision: PermissionDecision; engine?: string }[];

  /** "Se eu revogar esta" — one rule, or a whole batch, by id. */
  readonly remove?: readonly string[];

  readonly folder?: string;
  onOpenRule(ruleId: string): void;
}

/**
 * "Se esta regra existisse" / "se eu revogar esta" (plan 15, B-29, D-15): read against the last
 * N invocations of the caller (the selector S-202 asks for), counts and the list of what would
 * change — never both `add` and `remove` from the same caller at once. Reused as-is in the
 * wizard's own review (replacing its one-line `simulationSummary`), the rule detail's own
 * "simulate revoking this", and the batch-revoke dialog's own "simulate revoking these".
 */
export function SimulationPanel({
  add,
  remove,
  folder,
  onOpenRule,
}: SimulationPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [limit, setLimit] = useState<SimulationLimit>(200);
  const simulation = useRuleSimulation(
    simulationRequestOf({
      ...(add === undefined ? {} : { add }),
      ...(remove === undefined ? {} : { remove }),
      ...(folder === undefined ? {} : { folder }),
      limit,
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <RadioOptionGroup
        label={t('rules.simulate.limitLabel')}
        options={SIMULATION_LIMITS}
        value={limit}
        onPick={(candidate) => {
          setLimit(candidate);
        }}
        labelOf={(candidate) => String(candidate)}
        outerClassName="flex flex-wrap gap-2"
        optionClassName="flex min-h-touch items-center rounded-md border px-3 text-ui-sm"
      />

      {simulation.status === 'loading' && <p role="status">{t('rules.simulate.loading')}</p>}

      {simulation.status === 'failed' && (
        <RuleFailureMessage
          messageKey={simulation.error.messageKey}
          params={simulation.error.params}
        />
      )}

      {simulation.status === 'ready' && (
        <SimulationBody
          simulation={simulation.value}
          limit={limit}
          locale={i18n.language}
          onOpenRule={onOpenRule}
        />
      )}
    </div>
  );
}

const OUTCOME_KEY: Readonly<Record<'allow' | 'deny' | 'ask', string>> = {
  allow: 'rules.simulate.outcomeAllow',
  deny: 'rules.simulate.outcomeDeny',
  ask: 'rules.simulate.outcomeAsk',
};

function SimulationBody({
  simulation,
  limit,
  locale,
  onOpenRule,
}: {
  readonly simulation: RuleSimulation;
  readonly limit: SimulationLimit;
  readonly locale: string;
  onOpenRule(ruleId: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (isEmptyTrail(simulation)) {
    return <p className="text-ui-sm text-muted-foreground">{t('rules.simulate.emptyTrail')}</p>;
  }

  const { counts, changes, withoutFolder } = simulation;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ui-sm">
        {t('rules.simulate.countsSummary', {
          limit,
          wouldAutoAllow: counts.wouldAutoAllow,
          wouldAutoDeny: counts.wouldAutoDeny,
          wouldAsk: counts.wouldAsk,
          unchanged: counts.unchanged,
        })}
      </p>

      {withoutFolder > 0 && (
        <p className="text-ui-xs text-muted-foreground">
          {t('rules.simulate.withoutFolder', { count: withoutFolder })}
        </p>
      )}

      <p className="text-ui-xs text-muted-foreground">{t('rules.simulate.assumedMode')}</p>

      {changes.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">{t('rules.simulate.noChanges')}</p>
      ) : (
        <section>
          <h3 className="text-ui-sm font-ui-strong">{t('rules.simulate.changesHeading')}</h3>
          <ul className="flex flex-col gap-1">
            {changes.map((change) => {
              const rule = change.answeringRule;

              return (
                <li
                  key={change.entry.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-ui-xs"
                >
                  <span>{ruleInvocationLabel(change.entry, locale, t)}</span>
                  <span>
                    {t('rules.simulate.changeLine', {
                      before: t(OUTCOME_KEY[change.before]),
                      after: t(OUTCOME_KEY[change.after]),
                    })}
                  </span>
                  {rule !== null && (
                    <Button
                      variant="outline"
                      size="touch"
                      onClick={() => {
                        onOpenRule(rule.id);
                      }}
                    >
                      {t('permission.ruleDetail.openInvolvedRule')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
