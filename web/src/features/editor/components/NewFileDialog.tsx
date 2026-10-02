import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { sensitiveSubject } from '@/shared/lib/sensitive-files';
import { asAppError } from '../hooks/documents';
import { createAndOpen } from '../hooks/saving';
import { EditorQuestion } from './EditorQuestion';

export interface NewFileDialogProps {
  readonly folder: string;
  readonly open: boolean;
  onOpenChange(open: boolean): void;
}

/**
 * "New file" of the empty editor: a path of the folder, made empty and opened. A path that is taken
 * is refused by the server and said here — nothing is overwritten.
 */
export function NewFileDialog({
  folder,
  open,
  onOpenChange,
}: NewFileDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [path, setPath] = useState('');
  const [failure, setFailure] = useState<ErrorStateProps['error'] | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const create = () => {
    if (path.trim() === '') {
      return;
    }

    createAndOpen(folder, path.trim()).then(
      () => {
        setPath('');
        onOpenChange(false);
      },
      (error: unknown) => {
        setFailure(asAppError(error));
      },
    );
  };

  return (
    <EditorQuestion
      folder={folder}
      open={open}
      title={t('editor.newFile.title')}
      description={t('editor.newFile.description')}
      start={field}
      onDismiss={() => {
        setFailure(null);
        onOpenChange(false);
      }}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('editor.newFile.cancel')}
          </Button>
          <Button disabled={path.trim() === ''} onClick={create}>
            {t('editor.newFile.create')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <label htmlFor={fieldId} className="text-ui font-ui-strong">
          {t('editor.newFile.path')}
        </label>
        <input
          ref={field}
          id={fieldId}
          value={path}
          spellCheck={false}
          className="h-touch rounded-md border border-border bg-background px-2 font-code text-ui md:h-8"
          onChange={(event) => {
            setPath(event.target.value);
            setFailure(null);
          }}
        />
      </form>
      {sensitiveSubject(path.trim()) !== null && (
        <p className="text-ui">{t('editor.sensitive.warning')}</p>
      )}
      {failure !== null && <ErrorState error={failure} />}
    </EditorQuestion>
  );
}
