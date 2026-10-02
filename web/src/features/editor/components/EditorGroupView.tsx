import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { focusGroup } from '../hooks/tabs';
import { activeTabOf } from '../lib/layout';
import type { EditorGroup, EditorTab } from '../types/editor';
import { Breadcrumb } from './Breadcrumb';
import { DiffPane } from './DiffPane';
import { EditorTabStrip } from './EditorTabStrip';
import { FilePane } from './FilePane';
import { PreviewPane } from './PreviewPane';

export interface EditorGroupViewProps {
  readonly folder: string;
  readonly group: EditorGroup;

  /** Its place among the groups, from 1 — what it is called on screen. */
  readonly place: number;
  readonly focused: boolean;
}

/**
 * One group of tabs (B-33): its strip, the way to its file, and the tab on screen — a file, its
 * preview (B-50) or a diff.
 * Pressing anywhere in it gives it the focus, which is where "open" and the commands act.
 */
export function EditorGroupView({
  folder,
  group,
  place,
  focused,
}: EditorGroupViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const tab = activeTabOf(group);
  const label = t('editor.group.label', { place });

  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col border-l border-border first:border-l-0',
        focused && 'bg-background',
      )}
      onFocusCapture={() => {
        focusGroup(folder, group.id);
      }}
      onPointerDownCapture={() => {
        focusGroup(folder, group.id);
      }}
    >
      <EditorTabStrip folder={folder} group={group} label={t('editor.strip.label', { place })} />
      {tab !== undefined && tab.kind !== 'diff' && (
        <Breadcrumb folder={folder} path={tab.path} place={place} />
      )}
      <div className="min-h-0 min-w-0 flex-1">
        <TabBody folder={folder} group={group.id} tab={tab} />
      </div>
    </section>
  );
}

/** What the tab on screen shows: a file's editor, its preview, a diff — or that there is none. */
function TabBody({
  folder,
  group,
  tab,
}: {
  readonly folder: string;
  readonly group: string;
  readonly tab: EditorTab | undefined;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (tab === undefined) {
    return <p className="p-6 text-ui-sm text-muted-foreground">{t('editor.group.empty')}</p>;
  }

  if (tab.kind === 'diff') {
    return <DiffPane key={tab.id} folder={folder} left={tab.left} right={tab.right} />;
  }

  return tab.kind === 'preview' ? (
    <PreviewPane key={tab.id} folder={folder} path={tab.path} />
  ) : (
    <FilePane key={tab.path} folder={folder} group={group} path={tab.path} />
  );
}
