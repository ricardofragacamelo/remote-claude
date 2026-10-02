import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { PathList } from '@/shared/components/PathList';
import { Button } from '@/shared/components/ui/button';
import { saveAndClose } from '../hooks/saving';
import { cancelClose, discardAndClose } from '../hooks/tabs';
import { useEditorState } from '../hooks/useEditor';
import { baseName } from '../lib/paths';
import { EditorQuestion } from './EditorQuestion';

/**
 * "Save changes before closing?" — Save / Don't save / Cancel, listing the files (S-210). "Don't save"
 * is the one that loses work, and never has the focus first: an Enter pressed out of habit saves.
 */
export function CloseTabsDialog({ folder }: { readonly folder: string }): React.JSX.Element | null {
  const dirty = useEditorState(folder, (state) => state.closing?.dirty);

  return dirty === undefined ? null : <CloseQuestion folder={folder} dirty={dirty} />;
}

function CloseQuestion({
  folder,
  dirty,
}: {
  readonly folder: string;
  readonly dirty: readonly string[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const start = useRef<HTMLButtonElement>(null);

  return (
    <EditorQuestion
      folder={folder}
      open
      title={
        dirty.length === 1
          ? t('editor.close.titleOne', { name: baseName(dirty.join('')) })
          : t('editor.close.titleMany', { count: dirty.length })
      }
      description={t('editor.close.description')}
      start={start}
      onDismiss={() => {
        cancelClose(folder);
      }}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              cancelClose(folder);
            }}
          >
            {t('editor.close.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              discardAndClose(folder);
            }}
          >
            {t('editor.close.discard')}
          </Button>
          <Button ref={start} onClick={() => void saveAndClose(folder)}>
            {t('editor.close.save')}
          </Button>
        </>
      }
    >
      <PathList label={t('editor.close.listLabel')} paths={dirty} />
    </EditorQuestion>
  );
}
