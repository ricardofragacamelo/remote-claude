import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { Button } from '@/shared/components/ui/button';
import { useRoots } from '../hooks/useRoots';
import type { Workspace } from '../types/workspace';
import { AllowlistHint } from './AllowlistHint';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'workspace.roots.title',
  description: 'workspace.roots.description',
  loading: 'workspace.roots.loading',
  emptyTitle: 'workspace.roots.emptyTitle',
  emptyDescription: 'workspace.roots.emptyDescription',
};

export interface RootListProps {
  /**
   * Opens the dialog already inside this root. Absent, the list is only read — Settings shows the
   * roots without a control: changing them takes the disk of the machine (plan 06, S-144).
   */
  onBrowse?(root: Workspace): void;
}

/**
 * The roots this installation lets this user open — and how to add one.
 *
 * The way to add one is always under the list, whatever state it is in: the case that started
 * plan 06 was a machine whose only root was the scratch one, and a screen that does not say how to
 * let the real project in leaves the person where they were.
 */
export function RootList({ onBrowse }: RootListProps): React.JSX.Element {
  const { t } = useTranslation();
  const { roots, isLoading, error, reload } = useRoots();

  return (
    <LoadedList
      keys={KEYS}
      isLoading={isLoading}
      error={error}
      isEmpty={roots.length === 0}
      onRetry={reload}
      footer={
        <AllowlistHint learnMore {...(onBrowse === undefined ? { id: 'setting-allowlist' } : {})} />
      }
    >
      {roots.map((root) => (
        <li key={root.path}>
          {onBrowse === undefined ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <RootSummary root={root} />
            </div>
          ) : (
            <Button
              variant="outline"
              size="touch"
              className="h-auto w-full justify-start py-2"
              aria-label={t('workspace.roots.browse', { label: root.label })}
              onClick={() => {
                onBrowse(root);
              }}
            >
              <RootSummary root={root} />
            </Button>
          )}
        </li>
      ))}
    </LoadedList>
  );
}

/** A root's label and path. */
function RootSummary({ root }: { readonly root: Workspace }): React.JSX.Element {
  return (
    <>
      <FolderOpen className="size-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="text-sm font-medium">{root.label}</span>
        <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
          {root.path}
        </span>
      </span>
    </>
  );
}
