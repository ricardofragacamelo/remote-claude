import { FileQuestion, FileWarning, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { FileDocument } from '../types/editor';

export interface FilePlaceholderProps {
  readonly doc: FileDocument;
  onRetry(): void;
  onReopenWithEncoding(): void;
}

/** What a placeholder says: an icon, a title, why, and what can be done. */
interface Reason {
  readonly icon: LucideIcon;
  readonly titleKey: string;
  readonly explanationKey: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly action: 'retry' | 'encoding';
}

const ENCODING = {
  icon: FileWarning,
  titleKey: 'editor.placeholder.encodingTitle',
  explanationKey: 'editor.placeholder.encoding',
  action: 'encoding',
} as const;

/** The refusals that are about who may read the file — this machine, or the allowlist. */
const DENIED = new Set(['FILE_ACCESS_DENIED', 'FORBIDDEN', 'WORKSPACE_NOT_ALLOWED']);

/** What the placeholder reads of a failure. */
type Failure = Pick<NonNullable<FileDocument['failure']>, 'code' | 'messageKey' | 'params'>;

/** A failure nobody described — never on screen in practice: a failed read always has one. */
const UNKNOWN: Failure = {
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  params: {},
};

/** A refusal, or a file not there: what the server said, and "try again". */
function refused(doc: FileDocument, failure: Failure): Reason {
  const denied = DENIED.has(failure.code);

  return {
    icon: denied ? Lock : FileQuestion,
    titleKey: denied ? 'editor.placeholder.deniedTitle' : 'editor.placeholder.unopenedTitle',
    explanationKey: failure.messageKey,
    params: { path: doc.path, ...failure.params },
    action: 'retry',
  };
}

/**
 * Why a file is not in an editor, said in words, with the one action that fits (B-38). A binary file
 * and one past the editing ceiling never come here: they open paged (B-51).
 */
function reasonOf(doc: FileDocument): Reason {
  const failure: Failure = doc.failure ?? UNKNOWN;

  return failure.code === 'FILE_NOT_TEXT'
    ? { ...ENCODING, params: { path: doc.path } }
    : refused(doc, failure);
}

/**
 * A file that is not in an editor, and why — never an empty editor (B-38): one whose encoding is not
 * known, one this machine does not let the server read, one that is not there. Each with the trace of
 * the request, and the action that fits — no button that does nothing. A binary file and one past the
 * editing ceiling open in their paged views instead (B-51).
 */
export function FilePlaceholder({
  doc,
  onRetry,
  onReopenWithEncoding,
}: FilePlaceholderProps): React.JSX.Element {
  const { t } = useTranslation();
  const reason = reasonOf(doc);

  return (
    <div
      role="alert"
      className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <reason.icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-ui font-ui-strong">{t(reason.titleKey, reason.params)}</p>
      <p className="max-w-md text-ui-sm text-muted-foreground">
        {t(reason.explanationKey, reason.params)}
      </p>
      {doc.failure !== null && (
        <p className="font-code text-ui-sm text-muted-foreground">
          {t('common.error.traceLabel', { traceId: doc.failure.traceId })}
        </p>
      )}
      {reason.action === 'retry' && (
        <Button variant="outline" size="touch" className="md:h-8" onClick={onRetry}>
          {t('common.action.retry')}
        </Button>
      )}
      {reason.action === 'encoding' && (
        <Button variant="outline" size="touch" className="md:h-8" onClick={onReopenWithEncoding}>
          {t('editor.placeholder.reopenWithEncoding')}
        </Button>
      )}
    </div>
  );
}
