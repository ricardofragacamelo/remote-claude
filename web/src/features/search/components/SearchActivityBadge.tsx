import { useTranslation } from 'react-i18next';

import type { FolderViewProps } from '@/features/workbench';
import { useSearchView } from '../hooks/useSearchView';

/** The count of results on the Search view's own place in the activity bar. */
export function SearchActivityBadge({ folder }: FolderViewProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const view = useSearchView(folder);

  return view.resultCount === 0 ? null : (
    <span
      className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-muted px-1 text-ui-xs text-muted-foreground"
      aria-label={t('search.view.badgeLabel', { count: view.resultCount })}
    >
      {view.resultCount}
    </span>
  );
}
