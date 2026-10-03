import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { NotKept } from '../hooks/kept-delete';
import type { CountedFolder, DeleteFlow, DeleteStep } from '../hooks/useDeleteFlow';
import { DialogFrame } from '@/shared/components/DialogFrame';

export interface DeleteDialogProps {
  readonly flow: DeleteFlow;
}

/** The title of each step, for one entry or many — nothing while there is no question. */
function titleOf(current: DeleteStep | null, t: TFunction): string {
  if (current === null) {
    return '';
  }

  if (current.step === 'count') {
    return t('explorer.delete.countTitle');
  }

  return current.paths.length === 1
    ? t('explorer.delete.titleOne', { path: current.paths[0] })
    : t('explorer.delete.titleMany', { count: current.paths.length });
}

/**
 * "Delete for good?" — only for what the local history could not keep: there is no way back for it,
 * and the dialog says so plainly, with why (07 · D-06, S-337). A folder with something in it asks
 * again, with how much goes with it, as the server counted it (S-173). The way out is the first button and takes the focus: an `Enter` pressed
 * out of habit deletes nothing (web/03). Pressing the destructive one twice sends one request (S-174).
 */
export function DeleteDialog({ flow }: DeleteDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const current = flow.current;
  const keep = useRef<HTMLButtonElement>(null);
  const step = current?.step;

  // The second step starts where the first did: on the way out, never on the destructive answer the
  // person just pressed (S-173).
  useEffect(() => {
    if (step === 'count') {
      keep.current?.focus();
    }
  }, [step]);

  return (
    <DialogFrame
      open={current !== null}
      onClose={flow.cancel}
      title={titleOf(current, t)}
      description={t('explorer.delete.forGood')}
      footer={
        <>
          <Button ref={keep} variant="outline" disabled={flow.pending} onClick={flow.cancel}>
            {t('explorer.delete.keep')}
          </Button>
          <Button
            variant="destructive"
            disabled={flow.pending}
            onClick={() => {
              void flow.confirm();
            }}
          >
            {flow.pending ? t('explorer.delete.pending') : t('explorer.delete.confirm')}
          </Button>
        </>
      }
    >
      {current?.step === 'confirm' && <NotKeptList notKept={current.notKept} />}
      {current?.step === 'count' && (
        <CountStep counted={current.counted} sensitive={current.sensitive} />
      )}
    </DialogFrame>
  );
}

/** Why each entry has no undo this time — named in full so the i18n check sees each key (S-337). */
const WHY_NOT_KEPT: Readonly<Record<string, string>> = {
  tooLarge: 'explorer.delete.whyTooLarge',
  tooMany: 'explorer.delete.whyTooMany',
  unavailable: 'explorer.delete.whyUnavailable',
};

/** What is about to go for good, each with why the local history could not keep it. */
function NotKeptList({ notKept }: { readonly notKept: readonly NotKept[] }): React.JSX.Element {
  const { t } = useTranslation();

  const lines = notKept.map((each) => ({
    path: each.path,
    text: t(WHY_NOT_KEPT[each.why] ?? 'explorer.delete.whyUnavailable', { path: each.path }),
  }));

  return (
    <ul
      className="flex flex-col gap-1 text-ui break-all"
      aria-label={t('explorer.delete.listLabel')}
    >
      {lines.map((line) => (
        <li key={line.path}>{line.text}</li>
      ))}
    </ul>
  );
}

/** The second step: what each folder holds, and what changes what Claude may do. */
function CountStep({
  counted,
  sensitive,
}: {
  readonly counted: readonly CountedFolder[];
  readonly sensitive: readonly string[];
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ul aria-label={t('explorer.delete.countLabel')} className="flex flex-col gap-1 text-ui">
      {counted.map((folder) => (
        <li key={folder.path}>
          {t(folder.capped ? 'explorer.delete.holdsAtLeast' : 'explorer.delete.holds', {
            path: folder.path,
            count: folder.entryCount,
          })}
        </li>
      ))}
      {sensitive.map((path) => (
        <li key={path}>{t('explorer.delete.sensitive', { path })}</li>
      ))}
    </ul>
  );
}
