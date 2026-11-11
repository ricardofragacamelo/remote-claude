import { useTranslation } from 'react-i18next';

import type { AsyncRead } from '@/shared/hooks/useAsyncRead';
import { Button } from '@/shared/components/ui/button';
import { useGrantSubmit } from '../hooks/useGrantSubmit';
import { useRuleSimulation } from '../hooks/useRuleSimulation';
import { actionText, scopeText } from '../lib/rule-sentence';
import { grantInputOf, simulationInputOf } from '../lib/new-rule-grant';
import { widthGate } from '../lib/new-rule-width';
import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { PermissionRule, RulePreview, RuleSimulation } from '../types/rule';
import { RuleAlerts } from './RuleDetailPanel';
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleFailureMessage } from './RuleFailureMessage';

export interface NewRuleReviewStepProps {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedScope;
  readonly folder: string | null;
  readonly expiresAt: string;
  readonly preview: RulePreview;

  /** Whether the "broad" width has been explicitly accepted — `acknowledgeBroad` (D-09). */
  readonly acknowledgeBroad: boolean;
  onAcknowledgeBroad(value: boolean): void;
  onOpenRule(ruleId: string): void;

  /** The rule just created, pattern and all — never sent until this step's own confirm. */
  onGranted(rule: PermissionRule): void;

  /** A folder that left the allowlist since step 4 — back there, never a dead end (S-195). */
  onFolderRefused(): void;
}

/**
 * Step 6: the second step D-03 always asks for, `allow` and `deny` alike — the alcance by
 * extenso, the findings against what the caller already has (S-190: an identical rule blocks
 * Confirm outright; the rest are read, never blocking), "if this rule existed" against the last
 * 200 invocations (D-15), and the width gate above. Nothing is sent before this button (B-27).
 */
export function NewRuleReviewStep({
  pattern,
  decision,
  scope,
  folder,
  expiresAt,
  preview,
  acknowledgeBroad,
  onAcknowledgeBroad,
  onOpenRule,
  onGranted,
  onFolderRefused,
}: NewRuleReviewStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const input = grantInputOf({
    pattern,
    decision,
    scope,
    folder,
    expiresAt,
    breadthIsBroad: preview.breadth === 'broad',
  });
  const { submitting, error, confirm } = useGrantSubmit(input, onGranted, onFolderRefused);
  const simulation = useRuleSimulation(simulationInputOf({ pattern, decision, scope, folder }));

  const identical = preview.findings.some((finding) => finding.kind === 'identical');
  const width = widthGate(decision, preview.breadth, acknowledgeBroad);
  const canConfirm = !submitting && !identical && !width.blocked && !width.needsAcknowledge;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RuleDecisionChip decision={decision} />
        <code className="font-mono text-ui-sm">{pattern}</code>
      </div>

      <p className="text-ui-sm">
        {actionText(preview.reach, preview.reach.kind, t)}{' '}
        {scopeText({ scope, projectPath: folder }, t)}
      </p>

      <WidthNotice
        breadth={preview.breadth}
        blocked={width.blocked}
        acknowledgeBroad={acknowledgeBroad}
        onAcknowledgeBroad={onAcknowledgeBroad}
        pattern={pattern}
      />

      <RuleAlerts findings={preview.findings} onOpenRule={onOpenRule} />

      {identical && (
        <p className="text-ui-sm text-destructive" role="alert">
          {t('rules.wizard.identicalBlocked')}
        </p>
      )}

      <SimulationSummary simulation={simulation} />

      {error !== null && <RuleFailureMessage messageKey={error.messageKey} params={error.params} />}

      <Button type="button" disabled={!canConfirm} onClick={confirm}>
        {submitting ? t('rules.wizard.saving') : t('rules.wizard.confirm')}
      </Button>
    </div>
  );
}

function WidthNotice({
  breadth,
  blocked,
  acknowledgeBroad,
  onAcknowledgeBroad,
  pattern,
}: {
  readonly breadth: RulePreview['breadth'];
  readonly blocked: boolean;
  readonly acknowledgeBroad: boolean;
  onAcknowledgeBroad(value: boolean): void;
  readonly pattern: string;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (blocked) {
    return <RuleFailureMessage messageKey="rules.wizard.unboundedBlocked" params={{ pattern }} />;
  }

  if (breadth !== 'broad') {
    return null;
  }

  return (
    <label className="flex items-start gap-2 text-ui-sm">
      <input
        type="checkbox"
        checked={acknowledgeBroad}
        onChange={(event) => {
          onAcknowledgeBroad(event.target.checked);
        }}
      />
      {t('rules.wizard.acknowledgeBroad')}
    </label>
  );
}

function SimulationSummary({
  simulation,
}: {
  readonly simulation: AsyncRead<RuleSimulation>;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (simulation.status !== 'ready') {
    return null;
  }

  return (
    <p className="text-ui-sm text-muted-foreground">
      {t('rules.wizard.simulationSummary', {
        limit: 200,
        count: simulation.value.counts.wouldAutoAllow + simulation.value.counts.wouldAutoDeny,
      })}
    </p>
  );
}
