import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { Transfer } from '../hooks/useTransfer';
import { choicesOf } from '../lib/upload-plan';
import type { Conflict } from '../lib/upload-plan';
import type { ConflictChoice } from '../types/transfer';
import { DialogFrame } from '@/shared/components/DialogFrame';

export interface UploadDialogProps {
  readonly transfer: Transfer;
}

/** What each answer is called — named in full, for the i18n check to see. */
const CHOICE_KEYS: Readonly<Record<ConflictChoice, string>> = {
  replace: 'explorer.upload.replace',
  keepBoth: 'explorer.upload.keepBoth',
  skip: 'explorer.upload.skip',
};

/** One file whose path is taken, and its three answers as a group of radio buttons. */
function ConflictLine({
  conflict,
  onChoose,
}: {
  readonly conflict: Conflict;
  onChoose(choice: ConflictChoice): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const name = useId();

  return (
    <li>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-code text-ui-sm break-all">{conflict.path}</legend>
        <div className="flex flex-wrap gap-3 text-ui">
          {choicesOf(conflict.existing).map((choice) => (
            <label key={choice} className="inline-flex min-h-touch items-center gap-1.5 md:min-h-0">
              <input
                type="radio"
                name={name}
                value={choice}
                checked={conflict.choice === choice}
                onChange={() => {
                  onChoose(choice);
                }}
              />
              {t(CHOICE_KEYS[choice])}
            </label>
          ))}
        </div>
      </fieldset>
    </li>
  );
}

/**
 * The files of an upload whose path is already taken, asked about **before** anything is sent
 * (S-319) — the preview before the wide effect: each with Replace / Keep both / Skip, "Skip" chosen
 * at first, so nothing is replaced that the person did not pick. "Replace" overwrites only the
 * version that was there when it was asked; a folder in the way can only be kept beside.
 */
export function UploadDialog({ transfer }: UploadDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const asking = transfer.upload.step === 'conflicts' ? transfer.upload : null;
  const answers = (
    <>
      <Button variant="outline" onClick={transfer.cancel}>
        {t('explorer.upload.cancel')}
      </Button>
      <Button onClick={transfer.send}>{t('explorer.upload.send')}</Button>
    </>
  );

  return (
    <DialogFrame
      open={asking !== null}
      onClose={transfer.cancel}
      title={t('explorer.upload.conflictsTitle', { count: asking?.conflicts.length ?? 0 })}
      description={t('explorer.upload.conflictsDescription', {
        count: asking?.candidates.length ?? 0,
      })}
      footer={answers}
    >
      <ul
        aria-label={t('explorer.upload.conflictsLabel')}
        className="flex max-h-80 flex-col gap-3 overflow-y-auto"
      >
        {asking?.conflicts.map((conflict) => (
          <ConflictLine
            key={conflict.path}
            conflict={conflict}
            onChoose={(choice) => {
              transfer.choose(conflict.path, choice);
            }}
          />
        ))}
      </ul>
    </DialogFrame>
  );
}
