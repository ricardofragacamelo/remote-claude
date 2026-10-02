import { Circle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { cn } from '@/shared/lib/utils';
import { activateTab, closeTabs } from '../hooks/tabs';
import { useEditorState } from '../hooks/useEditor';
import { isDirty } from '../store/editor.store';
import { tabName } from './EditorTab';

/**
 * "Open editors", the section the Explorer view shows above its tree (S-218): the tabs of every group,
 * with the dirty ones marked; a press puts a tab on screen, and its × closes it — asking first when
 * that would lose changes.
 */
export function OpenEditors({ folder }: { readonly folder: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const groups = useEditorState(folder, (state) => state.groups);
  const docs = useEditorState(folder, (state) => state.docs);
  const activeGroup = useEditorState(folder, (state) => state.activeGroup);

  if (groups.every((group) => group.tabs.length === 0)) {
    return null;
  }

  return (
    <section
      aria-label={t('editor.openEditors.label')}
      className="flex flex-col border-b border-border py-1"
    >
      <h2 className="px-3 text-ui-sm font-ui-strong uppercase">{t('editor.openEditors.label')}</h2>
      {groups.map((group, index) => (
        <div key={group.id}>
          {groups.length > 1 && (
            <h3 className="px-3 text-ui-sm text-muted-foreground">
              {t('editor.group.label', { place: index + 1 })}
            </h3>
          )}
          <ul>
            {group.tabs.map((tab) => {
              const dirty = tab.kind === 'file' && isDirty(docs[tab.path]);
              const name = tabName(tab, t);
              const current = group.id === activeGroup && tab.id === group.active;

              return (
                <li key={tab.id} className="flex items-center">
                  <button
                    type="button"
                    aria-label={dirty ? `${name}, ${t('editor.tab.dirty')}` : name}
                    aria-current={current ? 'true' : undefined}
                    className={cn(
                      'flex min-h-touch min-w-0 flex-1 items-center gap-1 px-3 text-left text-ui md:h-row md:min-h-0',
                      tab.preview && 'italic',
                      current && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => {
                      activateTab(folder, group.id, tab.id);
                    }}
                  >
                    {dirty && <Circle className="size-2.5 shrink-0 fill-current" aria-hidden />}
                    <span className="truncate">{name}</span>
                  </button>
                  <IconButton
                    icon={X}
                    label={
                      dirty ? t('editor.tab.closeDirty', { name }) : t('editor.tab.close', { name })
                    }
                    onClick={() => {
                      closeTabs(folder, group.id, [tab.id]);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
