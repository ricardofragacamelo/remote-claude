import { useState } from 'react';
import { FilePlus, Files, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useFolderTab } from '@/features/workbench';
import { Button } from '@/shared/components/ui/button';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { openFile } from '../hooks/tabs';
import { useEditorState } from '../hooks/useEditor';
import { baseName } from '../lib/paths';
import { NewFileDialog } from './NewFileDialog';

/** How many of the files opened last the empty editor offers. */
const SHOWN_RECENT = 5;

/**
 * The editor area with nothing open — never a blank: it says what to do next (S-266). Open a file of
 * the tree (the Explorer comes on screen), make a new one, or open one of the files opened last here.
 */
export function EmptyEditor({ folder }: { readonly folder: string }): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const tab = useFolderTab(folder);
  const recent = useEditorState(folder, (state) => state.recent).slice(0, SHOWN_RECENT);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
      <FileText className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-ui font-ui-strong">{t('editor.empty.title')}</p>
      <p className="max-w-sm text-ui-sm text-muted-foreground">{t('editor.empty.description')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          size="touch"
          className="md:h-8"
          onClick={() => {
            if (desktop) {
              tab.showView('explorer');
            } else {
              tab.showMobile('explorer');
            }
          }}
        >
          <Files className="size-4" aria-hidden />
          {t('editor.empty.openFromTree')}
        </Button>
        <Button
          variant="outline"
          size="touch"
          className="md:h-8"
          onClick={() => {
            setCreating(true);
          }}
        >
          <FilePlus className="size-4" aria-hidden />
          {t('editor.empty.newFile')}
        </Button>
      </div>
      {recent.length > 0 && (
        <section aria-label={t('editor.empty.recent')} className="flex flex-col items-center gap-1">
          <h2 className="text-ui-sm font-ui-strong">{t('editor.empty.recent')}</h2>
          <ul className="flex flex-col items-center gap-1">
            {recent.map((path) => (
              <li key={path}>
                <Button
                  variant="outline"
                  size="touch"
                  className="md:h-7"
                  title={path}
                  onClick={() => {
                    openFile(folder, path);
                  }}
                >
                  {baseName(path)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <NewFileDialog folder={folder} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
