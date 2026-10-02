import { FileCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useRegistry } from '@/shared/hooks/useRegistry';
import { editorAreas } from '../store/registries';
import type { FolderViewProps } from '../types/workbench';
import { ViewPlaceholder } from './ViewPlaceholder';

/**
 * Where the open files are: whatever registered itself in `editorAreas` — the editor of
 * [plan 07](../../../../../docs/plans/07-explorer-and-editor/README.md) — and, until somebody did, a
 * held place that says what will live here.
 */
export function EditorArea({ folder }: FolderViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [entry] = useRegistry(editorAreas);

  return (
    <section aria-label={t('workbench.editor.label')} className="h-full min-h-0 bg-background">
      {entry === undefined ? (
        <ViewPlaceholder
          icon={FileCode}
          title={t('workbench.editor.placeholderTitle')}
          description={t('workbench.editor.placeholderDescription')}
        />
      ) : (
        <entry.component folder={folder} />
      )}
    </section>
  );
}
