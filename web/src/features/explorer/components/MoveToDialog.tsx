import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { intoItself } from '../lib/batch';
import type { Explorer } from '../hooks/useExplorer';
import { DialogFrame } from '@/shared/components/DialogFrame';

export interface MoveToDialogProps {
  readonly explorer: Explorer;
}

/**
 * "Move to…" — the way to move without dragging, since dragging cannot be the only one (S-175): the
 * folders the tree knows, the open folder first. A folder that is one of the entries, or inside one,
 * is refused here, before anything is sent (S-176, S-183).
 */
export function MoveToDialog({ explorer }: MoveToDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const moving = explorer.moving;
  const formId = useId();

  return (
    <DialogFrame
      open={moving !== null}
      onClose={explorer.cancelMove}
      title={t('explorer.move.title', { count: moving?.length ?? 0 })}
      description={t('explorer.move.description')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={explorer.cancelMove}>
            {t('explorer.move.cancel')}
          </Button>
          <Button type="submit" form={formId}>
            {t('explorer.move.confirm')}
          </Button>
        </>
      }
    >
      {moving !== null && (
        <MoveToForm
          id={formId}
          moving={moving}
          folders={explorer.knownFolders()}
          explorer={explorer}
        />
      )}
    </DialogFrame>
  );
}

function MoveToForm({
  id,
  moving,
  folders,
  explorer,
}: {
  readonly id: string;
  readonly moving: readonly string[];
  readonly folders: readonly string[];
  readonly explorer: Explorer;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [destination, setDestination] = useState('');
  const [refused, setRefused] = useState(false);
  const fieldId = useId();
  const messageId = useId();

  return (
    <form
      id={id}
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();

        if (intoItself(moving, destination)) {
          setRefused(true);
          return;
        }

        explorer.moveInto(moving, destination);
      }}
    >
      <label htmlFor={fieldId} className="text-ui font-ui-strong">
        {t('explorer.move.destination')}
      </label>
      <select
        id={fieldId}
        value={destination}
        aria-invalid={refused}
        aria-describedby={refused ? messageId : undefined}
        className="h-10 rounded-md border border-border bg-background px-2 text-ui"
        onChange={(event) => {
          setDestination(event.target.value);
          setRefused(false);
        }}
      >
        {folders.map((folder) => (
          <option key={folder} value={folder}>
            {folder === '' ? t('explorer.move.openFolder') : folder}
          </option>
        ))}
      </select>
      {refused && (
        <p id={messageId} role="alert" className="text-ui-sm text-destructive">
          {t('explorer.invalid.intoItself', { path: destination })}
        </p>
      )}
    </form>
  );
}
