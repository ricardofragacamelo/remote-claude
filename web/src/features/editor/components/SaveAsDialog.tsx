import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { sensitiveSubject } from '@/shared/lib/sensitive-files';
import { saveAs } from '../hooks/saving';
import { cancelSaveAs, forgetTaken } from '../hooks/tabs';
import { useEditorState } from '../hooks/useEditor';
import type { SaveAsRequest } from '../store/editor.store';
import { EditorQuestion } from './EditorQuestion';

/**
 * "Save as" (S-233): the buffer written at another path of the folder. A path that is taken is never
 * overwritten by it: the dialog says so and offers to replace — over the version that is there, which
 * a change since would refuse. A path that changes what Claude may do says so before it is written.
 */
export function SaveAsDialog({ folder }: { readonly folder: string }): React.JSX.Element {
  const request = useEditorState(folder, (state) => state.saveAs);

  // Keyed by the file: each "Save as" starts from the path of the file it is for.
  return <SaveAsForm key={request?.path ?? ''} folder={folder} request={request} />;
}

interface SaveAsFormProps {
  readonly folder: string;
  readonly request: SaveAsRequest | null;
}

function SaveAsForm({ folder, request }: SaveAsFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [target, setTarget] = useState(request?.path ?? '');
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const path = target.trim();
  const sensitive = sensitiveSubject(path) !== null;
  const write = (replace?: string | null) => {
    if (request !== null && path !== '') {
      const confirmSensitive = sensitive;
      void saveAs(
        folder,
        request.path,
        path,
        replace === undefined ? { confirmSensitive } : { replace, confirmSensitive },
      );
    }
  };

  return (
    <EditorQuestion
      folder={folder}
      open={request !== null}
      title={t('editor.saveAs.title')}
      description={t('editor.saveAs.description')}
      start={field}
      onDismiss={() => {
        cancelSaveAs(folder);
      }}
      footer={
        <SaveAsActions
          folder={folder}
          request={request}
          empty={path === ''}
          sensitive={sensitive}
          write={write}
        />
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (request?.taken === null) write();
        }}
      >
        <label htmlFor={fieldId} className="text-ui font-ui-strong">
          {t('editor.saveAs.path')}
        </label>
        <input
          ref={field}
          id={fieldId}
          value={target}
          spellCheck={false}
          className="h-touch rounded-md border border-border bg-background px-2 font-code text-ui md:h-8"
          onChange={(event) => {
            setTarget(event.target.value);
            forgetTaken(folder);
          }}
        />
      </form>
      <SaveAsNotes request={request} sensitive={sensitive} />
    </EditorQuestion>
  );
}

interface SaveAsActionsProps extends SaveAsFormProps {
  readonly empty: boolean;
  readonly sensitive: boolean;
  write(replace?: string | null): void;
}

/** Cancel, and Save — or, once the path turned out taken, Replace, which is the one that overwrites. */
function SaveAsActions({
  folder,
  request,
  empty,
  sensitive,
  write,
}: SaveAsActionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const taken = request?.taken ?? null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          cancelSaveAs(folder);
        }}
      >
        {t('editor.saveAs.cancel')}
      </Button>
      {taken === null ? (
        <Button
          disabled={empty}
          onClick={() => {
            write();
          }}
        >
          {sensitive ? t('editor.saveAs.saveSensitive') : t('editor.saveAs.save')}
        </Button>
      ) : (
        <Button
          variant="destructive"
          onClick={() => {
            write(taken.etag);
          }}
        >
          {t('editor.saveAs.replace')}
        </Button>
      )}
    </>
  );
}

/** What the dialog says about the path: taken, sensitive, or why the last try failed. */
function SaveAsNotes({
  request,
  sensitive,
}: {
  readonly request: SaveAsRequest | null;
  readonly sensitive: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {request?.taken != null && (
        <p role="alert" className="text-ui">
          {t('editor.saveAs.taken', { path: request.taken.path })}
        </p>
      )}
      {sensitive && <p className="text-ui">{t('editor.sensitive.warning')}</p>}
      {request?.failure != null && <ErrorState error={request.failure} />}
    </>
  );
}
