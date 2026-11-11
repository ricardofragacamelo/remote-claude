import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import type { PermissionRule } from '../types/rule';
import { batchKey, useRuleMutations } from '../hooks/useRuleMutations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { RuleFailureMessage } from './RuleFailureMessage';
import { SimulationPanel } from './SimulationPanel';

export interface RuleBatchRevokeDialogProps {
  readonly rules: readonly PermissionRule[];
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The write landed — the ids to take off the list this screen has in hand (S-173). */
  onRevoked(ruleIds: readonly string[]): void;

  /** Opens a rule a simulated change would answer with, from the preview below (S-201). */
  onOpenRule(ruleId: string): void;
}

/**
 * The preview a revocation this wide asks for first — how many, and which patterns (S-173) — before
 * one `UPDATE` takes all of them at once (D-06): accepted or refused together, never "7 of 9". A
 * second click on Confirm, before the first write settles, gets that same write back
 * (`useRuleMutations`'s own guard, keyed by the exact lot — S-174); a refusal keeps every row
 * exactly as it was, the message translated inline (S-175).
 */
export function RuleBatchRevokeDialog({
  rules,
  open,
  onOpenChange,
  onRevoked,
  onOpenRule,
}: RuleBatchRevokeDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { revokeBatch, restoreBatch, inFlight, failure } = useRuleMutations();
  const ruleIds = rules.map((rule) => rule.id);
  const batchFailureId = batchKey('revoke', ruleIds);
  const busy = inFlight.has(batchFailureId);

  const onConfirm = (): void => {
    void revokeBatch(ruleIds)
      .then((batch) => {
        onOpenChange(false);
        onRevoked(ruleIds);
        toast(t('rules.batch.revokedToast', { count: ruleIds.length }), {
          action: {
            label: t('permission.ruleExpiry.undo'),
            onClick: () => {
              void restoreBatch(batch.rules.map((rule) => rule.id)).catch(() => {});
            },
          },
        });
      })
      .catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rules.batch.revokeTitle', { count: ruleIds.length })}</DialogTitle>
          <DialogDescription>{t('rules.batch.revokeDescription')}</DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-ui-xs">
          {rules.map((rule) => (
            <li key={rule.id} className="font-mono">
              {rule.pattern}
            </li>
          ))}
        </ul>

        <section>
          <h3 className="text-ui-sm font-ui-strong">{t('rules.simulate.revokeHeadingBatch')}</h3>
          <SimulationPanel remove={ruleIds} onOpenRule={onOpenRule} />
        </section>

        {failure !== null && failure.ruleId === batchFailureId && (
          <RuleFailureMessage messageKey={failure.error.messageKey} params={failure.error.params} />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('rules.batch.cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {t('rules.batch.confirmRevoke')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
