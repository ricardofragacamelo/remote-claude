import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { ItemResult } from '../lib/batch';
import type { Outcome } from '../hooks/useOutcome';
import { reasonKeyOf } from '../lib/reasons';
import { DialogFrame } from '@/shared/components/DialogFrame';

export interface OutcomeDialogProps {
  readonly outcome: Outcome | null;
  onClose(): void;
}

/**
 * How an operation of many entries went — what went, what did not, and why (S-182) — or why an undo
 * was refused (S-185). Shown only when something did not go: a batch that wholly went is said in the
 * live region and nowhere else.
 */
export function OutcomeDialog({ outcome, onClose }: OutcomeDialogProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <DialogFrame
      open={outcome !== null}
      onClose={onClose}
      title={outcome === null ? '' : t(outcome.titleKey)}
      description={t('explorer.outcome.description')}
      footer={<Button onClick={onClose}>{t('explorer.outcome.close')}</Button>}
    >
      <ul aria-label={t('explorer.outcome.listLabel')} className="flex flex-col gap-2">
        {outcome?.results.map((result) => (
          <ResultLine key={result.path} result={result} context={outcome.context} />
        ))}
      </ul>
    </DialogFrame>
  );
}

function ResultLine({
  result,
  context,
}: {
  readonly result: ItemResult;
  readonly context: Outcome['context'];
}): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = result.ok ? Check : X;

  return (
    <li className="flex items-start gap-2 text-ui">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="font-code text-ui-sm break-all">{result.path}</span>
        <span className={result.ok ? 'text-muted-foreground' : 'text-destructive'}>
          {result.ok
            ? t(result.noteKey ?? 'explorer.outcome.done')
            : t(reasonKeyOf(result.error, context), { path: result.path, ...result.error.params })}
        </span>
      </span>
    </li>
  );
}
