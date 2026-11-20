import { useTranslation } from 'react-i18next';

import { fileIsDirty } from '@/features/editor';
import { ConfirmFooterButtons } from '@/shared/components/ConfirmFooterButtons';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { ReplaceView } from '../hooks/useReplaceView';

/** What asked to be replaced — every file the preview found, or one of them by itself (S-128). */
export type ReplaceTarget =
  { readonly kind: 'all' } | { readonly kind: 'file'; readonly path: string };

export interface ReplaceConfirmProps {
  readonly folder: string;
  readonly replace: ReplaceView;

  /** `null` asks nothing — the dialog shows only while something is pending. */
  readonly target: ReplaceTarget | null;
  onClose(): void;
}

/**
 * Before the replace runs (plan 11, B-16): "replace all" always shows its own scope first — how
 * many matches, in how many files (S-124) — never a plain "are you sure?". Either way, a file open
 * dirty in an editor is named before it is overwritten (S-126); the editor's own warning of a
 * change from outside comes after, once the write lands — this dialog is not that one.
 */
export function ReplaceConfirm({
  folder,
  replace,
  target,
  onClose,
}: ReplaceConfirmProps): React.JSX.Element {
  const { t } = useTranslation();

  if (target === null) {
    return <></>;
  }

  const files =
    target.kind === 'all'
      ? replace.files
      : replace.files.filter((file) => file.path === target.path);
  const dirtyCount = files.filter((file) => fileIsDirty(folder, file.path)).length;

  // Never awaited: the report, or the refusal, is read back reactively off `replace` itself
  // (`report`/`applyError`) — not from this promise, which a `mutateAsync` still rejects on a
  // real refusal, and a `catch` here keeps that from ever surfacing as unhandled.
  const confirm = (): void => {
    const applied = target.kind === 'all' ? replace.replaceAll() : replace.replaceFile(target.path);
    applied.catch(() => undefined);
    onClose();
  };

  const description =
    target.kind === 'all'
      ? t('search.view.replaceScopeBody', { count: replace.resultCount, files: replace.fileCount })
      : t('search.view.replaceDirtyBody', { count: 1 });

  return (
    <DialogFrame
      open
      onClose={onClose}
      title={t(
        target.kind === 'all' ? 'search.view.replaceScopeTitle' : 'search.view.replaceDirtyTitle',
      )}
      description={description}
      footer={
        <ConfirmFooterButtons
          keys={{
            cancel: 'search.view.replaceScopeCancel',
            confirm:
              target.kind === 'all'
                ? 'search.view.replaceScopeConfirm'
                : 'search.view.replaceDirtyConfirm',
            busy: 'search.view.replaceScopeConfirm',
          }}
          busy={replace.isApplying}
          onCancel={onClose}
          onConfirm={confirm}
        />
      }
    >
      {target.kind === 'all' && dirtyCount > 0 && (
        <p className="text-ui">{t('search.view.replaceDirtyBody', { count: dirtyCount })}</p>
      )}
    </DialogFrame>
  );
}
