import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { EditAndResend } from '../../hooks/useEditAndResend';

/**
 * What editing a prompt means, said before it is sent (plan 08, B-35): a new conversation from
 * before it, the original kept — and the files **not** going back on their own, with the undo of
 * that turn offered beside it, off by default (S-162).
 */
export function EditBanner({ edit }: { readonly edit: EditAndResend }): React.JSX.Element | null {
  const { t } = useTranslation();

  if (edit.editing === null) {
    return null;
  }

  const canUndo = edit.editing.undoPoint !== null;

  return (
    <div
      role="note"
      className="flex flex-col gap-1 rounded border border-border bg-muted p-2 text-ui-sm"
    >
      <p>{t('sessions.edit.explain')}</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={edit.undoFiles}
          disabled={!canUndo}
          onChange={(event) => {
            edit.setUndoFiles(event.target.checked);
          }}
        />
        {t('sessions.edit.undoFiles')}
      </label>
      {!canUndo && <p className="text-ui-xs text-muted-foreground">{t('sessions.edit.noUndo')}</p>}
      <Button variant="outline" className="self-start" onClick={edit.cancel}>
        {t('sessions.edit.cancel')}
      </Button>
    </div>
  );
}
