import { useEffect, useMemo } from 'react';
import { AlertTriangle, Feather, FileX2, History, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import {
  askConflict,
  compareWithDisk,
  discardAndReload,
  dismissHistoryNotice,
  dismissSaveError,
  keepMine,
} from '../hooks/answers';
import { ensureLoaded } from '../hooks/documents';
import { encodingChoices, offerChoice } from '../hooks/choices';
import { useCodeEditorEngine } from '../hooks/useCodeEditorEngine';
import { useCodeView } from '../hooks/useCodeView';
import { useDocument, usePreferences } from '../hooks/useEditor';
import { baseName } from '../lib/paths';
import { viewOptionsOf } from '../lib/view-options';
import type { CodeEditorEngine } from '../types/code-editor';
import type { FileDocument } from '../types/editor';
import { pagedModeOf } from '../lib/paged';
import { FilePlaceholder } from './FilePlaceholder';
import { PagedFile } from './PagedFile';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';

export interface FilePaneProps {
  readonly folder: string;
  readonly group: string;
  readonly path: string;
}

/**
 * The editor of one file in one group: loading, the reason it does not open (B-38), or the editor —
 * with what is true about the file said above it: the light mode, a change on disk, a deletion, a
 * conflict put off, a save that failed.
 */
export function FilePane({ folder, group, path }: FilePaneProps): React.JSX.Element {
  const doc = useDocument(folder, path);
  const { engine, error, retry } = useCodeEditorEngine();

  // A tab restored by a reload, or opened from a link, is read when it shows.
  useEffect(() => {
    void ensureLoaded(folder, path);
  }, [folder, path]);

  if (doc?.status === 'failed') {
    return <UnopenedFile folder={folder} doc={doc} />;
  }

  if (error !== null) {
    return <PaneError error={error} onRetry={retry} />;
  }

  if (doc?.status !== 'ready' || engine === null) {
    return <PaneLoading />;
  }

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col">
      <FileNotices folder={folder} doc={doc} />
      <CodeEditorHost folder={folder} group={group} doc={doc} engine={engine} />
    </div>
  );
}

/**
 * A file the editor did not open: binary, or past the editing ceiling — read anyway, page by page
 * and read-only (B-51) — or the reason it is not shown, with what can be done (B-38).
 */
function UnopenedFile({
  folder,
  doc,
}: {
  readonly folder: string;
  readonly doc: FileDocument;
}): React.JSX.Element {
  const path = doc.path;
  const paged = pagedModeOf(doc.failure);

  if (paged !== null) {
    return <PagedFile folder={folder} path={path} mode={paged} failure={doc.failure} />;
  }

  return (
    <FilePlaceholder
      doc={doc}
      onRetry={() => {
        void ensureLoaded(folder, path, true);
      }}
      onReopenWithEncoding={() => {
        offerChoice('editor.choice.reopenEncoding', encodingChoices(folder, path, 'reopen'));
      }}
    />
  );
}

interface CodeEditorHostProps {
  readonly folder: string;
  readonly group: string;
  readonly doc: FileDocument;
  readonly engine: CodeEditorEngine;
}

/** The element the editor is made in. */
function CodeEditorHost({ folder, group, doc, engine }: CodeEditorHostProps): React.JSX.Element {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const label = t('editor.view.label', { name: baseName(doc.path) });
  const options = useMemo(
    () =>
      viewOptionsOf(preferences, {
        label,
        light: doc.light,
        readOnly: false,
        indentation: doc.indentation,
      }),
    [preferences, label, doc.light, doc.indentation],
  );
  const ref = useCodeView({ folder, group, path: doc.path, engine, options });

  return <div ref={ref} className="min-h-0 min-w-0 flex-1 overflow-hidden" />;
}

interface NoticeProps {
  readonly icon: LucideIcon;
  readonly tone: 'info' | 'warning';
  readonly children: ReactNode;
}

/** One line said above the editor, with what can be done about it. */
function Notice({ icon: Icon, tone, children }: NoticeProps): React.JSX.Element {
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-ui-sm',
        tone === 'warning' && 'bg-accent text-accent-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}

/** A button of a notice: 44 px under `md`, compact above it. */
function NoticeAction({
  label,
  onClick,
}: {
  readonly label: string;
  onClick(): void;
}): React.JSX.Element {
  return (
    <Button variant="outline" className="h-touch px-3 md:h-6" onClick={onClick}>
      {label}
    </Button>
  );
}

/** Why the version a save replaced stayed out of the local history — named in full (S-336). */
const HISTORY_NOT_KEPT: Readonly<Record<'tooLarge' | 'unavailable', string>> = {
  tooLarge: 'editor.history.tooLarge',
  unavailable: 'editor.history.unavailable',
};

/** What is true about a file that the editor alone does not show. */
function FileNotices({
  folder,
  doc,
}: {
  readonly folder: string;
  readonly doc: FileDocument;
}): React.JSX.Element {
  const { t } = useTranslation();
  const path = doc.path;
  const changedBy =
    doc.external?.origin === 'claude' ? 'editor.external.claude' : 'editor.external.other';

  return (
    <>
      {doc.light && (
        <Notice icon={Feather} tone="info">
          <p>{t('editor.light.notice')}</p>
        </Notice>
      )}
      {doc.deleted && (
        <Notice icon={FileX2} tone="warning">
          <p>{t('editor.deleted.notice', { path })}</p>
        </Notice>
      )}
      {doc.external !== null && (
        <Notice icon={Info} tone="warning">
          <p>{t(changedBy, { path })}</p>
          <NoticeAction
            label={t('editor.external.compare')}
            onClick={() => {
              compareWithDisk(folder, path);
            }}
          />
          <NoticeAction
            label={t('editor.external.reload')}
            onClick={() => void discardAndReload(folder, path)}
          />
          <NoticeAction
            label={t('editor.external.keep')}
            onClick={() => {
              keepMine(folder, path);
            }}
          />
        </Notice>
      )}
      {doc.conflict !== null && !doc.conflict.asking && (
        <Notice icon={AlertTriangle} tone="warning">
          <p>{t('files.error.changed', { path })}</p>
          <NoticeAction
            label={t('editor.conflict.resolve')}
            onClick={() => {
              askConflict(folder, path);
            }}
          />
        </Notice>
      )}
      {doc.historyNotKept !== null && (
        <Notice icon={History} tone="info">
          <p>{t(HISTORY_NOT_KEPT[doc.historyNotKept], { path })}</p>
          <NoticeAction
            label={t('editor.history.dismiss')}
            onClick={() => {
              dismissHistoryNotice(folder, path);
            }}
          />
        </Notice>
      )}
      {doc.saveError !== null && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-destructive px-3 py-1 text-ui-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <p>{t(doc.saveError.messageKey, { path, ...doc.saveError.params })}</p>
          <p className="font-code">
            {t('common.error.traceLabel', { traceId: doc.saveError.traceId })}
          </p>
          <NoticeAction
            label={t('editor.saveError.dismiss')}
            onClick={() => {
              dismissSaveError(folder, path);
            }}
          />
        </div>
      )}
    </>
  );
}
