import { useTranslation } from 'react-i18next';

import { DiffHunks } from '@/shared/components/DiffHunks';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useEditPreview } from '../hooks/useEditPreview';
import type { PermissionRequest } from '../types/permission';

export interface EditPreviewViewProps {
  readonly request: PermissionRequest;

  /** The real path of the folder of the tab — what the file is read under. */
  readonly folder: string | null;
}

/** Why an edit will not match — named in full so the i18n check sees each key. */
const NO_MATCH: Readonly<Record<'missing' | 'ambiguous', string>> = {
  missing: 'permission.preview.noMatch',
  ambiguous: 'permission.preview.ambiguous',
};

/**
 * What the change would do to the file, **before** it is approved (plan 08, B-29): the hunks against
 * the disk now, and when that was. What cannot be previewed says why — and the exact input stays on
 * the card either way, which is the rule of this screen (S-130).
 */
export function EditPreviewView({
  request,
  folder,
}: EditPreviewViewProps): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const state = useEditPreview(request, folder);

  switch (state.kind) {
    case 'none':
      return null;
    case 'loading':
      return <Skeleton className="h-10" aria-label={t('permission.preview.loading')} />;
    case 'outside':
      return <p className="text-xs opacity-70">{t('permission.preview.outside')}</p>;
    case 'unavailable':
      return (
        <p className="text-xs opacity-70" role="note">
          {t('permission.preview.unavailable', {
            reason: t(state.error.messageKey, state.error.params),
          })}
        </p>
      );
    case 'ready': {
      const when = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(
        new Date(state.at),
      );

      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs opacity-70">{t('permission.preview.at', { when })}</p>
          {state.preview.kind === 'noMatch' ? (
            <p className="text-xs text-warning" role="note">
              {t(NO_MATCH[state.preview.reason], { edit: state.preview.edit + 1 })}
            </p>
          ) : state.preview.hunks.length === 0 ? (
            <p className="text-xs opacity-70">{t('permission.preview.unchanged')}</p>
          ) : (
            <DiffHunks
              hunks={state.preview.hunks}
              label={t('permission.preview.label')}
              foldAfter={20}
            />
          )}
        </div>
      );
    }
  }
}
