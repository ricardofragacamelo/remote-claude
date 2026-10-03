import { Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import type { EditAndResend } from '../../hooks/useEditAndResend';

/**
 * What editing a prompt means, said before it is sent (plan 08, B-35): a new conversation from
 * before it, the original kept — and the files **not** going back on their own, with the undo of
 * that turn offered beside it, off by default (S-162). A strip above the box, with the way out of
 * editing in its corner (plan 09, B-14).
 */
export function EditBanner({ edit }: { readonly edit: EditAndResend }): React.JSX.Element | null {
  const { t } = useTranslation();

  if (edit.editing === null) {
    return null;
  }

  const canUndo = edit.editing.undoPoint !== null;

  return (
    <div role="note" className="flex flex-col gap-1 rounded bg-muted px-2 py-1 text-ui-xs">
      <div className="flex items-center gap-2">
        <Pencil className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-ui-strong">{t('sessions.edit.editing')}</span>
        <IconButton
          icon={X}
          label={t('sessions.edit.cancel')}
          className="md:size-6"
          onClick={edit.cancel}
        />
      </div>
      <p className="text-muted-foreground">{t('sessions.edit.explain')}</p>
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
      {!canUndo && <p className="text-muted-foreground">{t('sessions.edit.noUndo')}</p>}
    </div>
  );
}
