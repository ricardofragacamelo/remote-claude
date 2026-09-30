import { FileCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ViewPlaceholder } from './ViewPlaceholder';

/**
 * Where the open files will be — a held place until the editor of plan 07 arrives
 * ([07](../../../../../docs/plans/07-explorer-and-editor/README.md)).
 */
export function EditorArea(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section aria-label={t('workbench.editor.label')} className="h-full min-h-0 bg-background">
      <ViewPlaceholder
        icon={FileCode}
        title={t('workbench.editor.placeholderTitle')}
        description={t('workbench.editor.placeholderDescription')}
      />
    </section>
  );
}
