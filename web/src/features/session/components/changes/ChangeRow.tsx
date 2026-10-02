import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FileMinus,
  FilePen,
  FilePlus,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { relativeTo } from '../../lib/diff-sides';
import type { ReviewedChange } from '../../hooks/useSessionChanges';
import type { ChangeKind } from '../../types/changes';
import { ChangeHunks } from './ChangeHunks';

/** The icon of what the session did to a file — beside its word, never instead of it. */
const KIND_ICON: Readonly<Record<ChangeKind, LucideIcon>> = {
  created: FilePlus,
  modified: FilePen,
  deleted: FileMinus,
};

/** The word of each kind — named in full so the i18n check sees each key. */
const KIND_NAME: Readonly<Record<ChangeKind, string>> = {
  created: 'sessions.changeKind.created',
  modified: 'sessions.changeKind.modified',
  deleted: 'sessions.changeKind.deleted',
};

export interface ChangeRowProps {
  readonly file: ReviewedChange;
  readonly folder: string;
  readonly sessionId: string;
  readonly busy: boolean;
  onOpenDiff(path: string): void;
  onAccept(file: ReviewedChange): void;
  onUnaccept(file: ReviewedChange): void;
  onReject(file: ReviewedChange): void;
  onRejectHunk(path: string, hunkId: string, revision: string): void;
}

/**
 * One file the session changed: what it did, how much, whether somebody changed it after — and the
 * four things to do about it: see the diff, accept, reject it whole, or open its hunks to reject one.
 */
export function ChangeRow({
  file,
  folder,
  sessionId,
  busy,
  onOpenDiff,
  onAccept,
  onUnaccept,
  onReject,
  onRejectHunk,
}: ChangeRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[file.kind];
  const Chevron = open ? ChevronDown : ChevronRight;
  const shown = relativeTo(folder, file.path) ?? file.path;
  const kind = t(KIND_NAME[file.kind]);

  return (
    <li className="flex flex-col gap-1 rounded border border-border p-1.5">
      <div className="flex min-w-0 items-center gap-1">
        <IconButton
          icon={Chevron}
          label={t(open ? 'sessions.changes.hideHunks' : 'sessions.changes.showHunks', {
            path: shown,
          })}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        />
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <button
          type="button"
          className="min-w-0 truncate text-left font-code text-ui-sm hover:underline"
          title={file.path}
          aria-label={t('sessions.changes.openDiffOf', { path: shown, kind })}
          onClick={() => {
            onOpenDiff(file.path);
          }}
        >
          {shown}
        </button>
        <span className="sr-only">{kind}</span>
        {file.added !== null && file.removed !== null && (
          <span className="shrink-0 font-code text-ui-xs text-muted-foreground">
            {t('sessions.changes.counts', { added: file.added, removed: file.removed })}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center">
          <IconButton
            icon={FileDiff}
            label={t('sessions.changes.openDiff')}
            onClick={() => {
              onOpenDiff(file.path);
            }}
          />
          <IconButton
            icon={Check}
            label={t(file.reviewed ? 'sessions.changes.unaccept' : 'sessions.changes.accept')}
            aria-pressed={file.reviewed}
            onClick={() => {
              if (file.reviewed) onUnaccept(file);
              else onAccept(file);
            }}
          />
          <IconButton
            icon={Undo2}
            label={t('sessions.changes.reject')}
            disabled={busy}
            onClick={() => {
              onReject(file);
            }}
          />
        </span>
      </div>
      {file.modifiedOutside && (
        <p className="flex items-center gap-1 text-ui-xs text-warning">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {t('sessions.changes.modifiedOutside')}
        </p>
      )}
      {file.reviewed && (
        <p className="text-ui-xs text-muted-foreground">{t('sessions.changes.reviewed')}</p>
      )}
      {open && (
        <ChangeHunks
          sessionId={sessionId}
          path={file.path}
          busy={busy}
          onReject={(hunkId, revision) => {
            onRejectHunk(file.path, hunkId, revision);
          }}
        />
      )}
    </li>
  );
}
