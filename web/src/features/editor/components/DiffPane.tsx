import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { useCodeEditorEngine } from '../hooks/useCodeEditorEngine';
import { useDiffContent } from '../hooks/useDiffContent';
import { useDiffView } from '../hooks/useDiffView';
import { usePreferences } from '../hooks/useEditor';
import { baseName } from '../lib/paths';
import { viewOptionsOf } from '../lib/view-options';
import type { CodeEditorEngine, DiffContent } from '../types/code-editor';
import type { DiffSide } from '../types/editor';
import { PaneError } from './PaneError';
import { PaneLoading } from './PaneLoading';

export interface DiffPaneProps {
  readonly folder: string;
  readonly left: DiffSide;
  readonly right: DiffSide;
}

/** What a side of a diff is called — named in full so the i18n check sees each key. */
const SIDE_LABELS: Readonly<Record<Exclude<DiffSide['source'], 'provided'>, string>> = {
  disk: 'editor.diff.disk',
  buffer: 'editor.diff.buffer',
  history: 'editor.diff.history',
};

/** What a side is called: its file's name, and — a version of the history — when it was kept. */
function sideLabel(side: DiffSide, t: TFunction, language: string): string {
  const when =
    side.version === undefined
      ? ''
      : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(side.version.at),
        );

  // A provided side is named by whoever provides it (plan 08: "before Claude's changes").
  const key =
    side.source === 'provided'
      ? (side.provided?.labelKey ?? 'editor.diff.disk')
      : SIDE_LABELS[side.source];

  return t(key, { name: baseName(side.path), when });
}

/**
 * A read-only diff tab (B-38): the conflict's "Compare", "Compare with saved" (buffer × disk),
 * "Compare selected" of the explorer, a version of the local history (07 · B-59) — and later
 * Claude's changes (plan 08) and the preview of a replace (plan 11). Nothing in it can be edited
 * (S-256).
 */
export function DiffPane({ folder, left, right }: DiffPaneProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const content = useDiffContent(folder, left, right);
  const { engine, error, retry } = useCodeEditorEngine();
  const originalLabel = sideLabel(left, t, i18n.language);
  const modifiedLabel = sideLabel(right, t, i18n.language);
  const diff = useMemo<DiffContent | null>(
    () =>
      content.status === 'ready'
        ? {
            original: content.original,
            modified: content.modified,
            language: content.language,
            originalLabel,
            modifiedLabel,
          }
        : null,
    [content, originalLabel, modifiedLabel],
  );
  const failure = error ?? (content.status === 'failed' ? content.error : null);

  if (failure !== null) {
    return <PaneError error={failure} onRetry={retry} />;
  }

  if (diff === null || engine === null) {
    return <PaneLoading />;
  }

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col">
      <p className="flex shrink-0 flex-wrap gap-x-2 border-b border-border px-3 py-1 text-ui-sm">
        <span>{originalLabel}</span>
        <span aria-hidden>{t('editor.diff.versus')}</span>
        <span>{modifiedLabel}</span>
        <span className="text-muted-foreground">{t('editor.diff.readOnly')}</span>
      </p>
      <DiffHost
        engine={engine}
        content={diff}
        label={t('editor.diff.label', { left: originalLabel, right: modifiedLabel })}
      />
    </div>
  );
}

interface DiffHostProps {
  readonly engine: CodeEditorEngine;
  readonly content: DiffContent;
  readonly label: string;
}

function DiffHost({ engine, content, label }: DiffHostProps): React.JSX.Element {
  const { preferences } = usePreferences();
  const options = useMemo(
    () => viewOptionsOf(preferences, { label, light: false, readOnly: true, indentation: null }),
    [preferences, label],
  );
  const ref = useDiffView(engine, content, options);

  return <div ref={ref} className="min-h-0 min-w-0 flex-1 overflow-hidden" />;
}
