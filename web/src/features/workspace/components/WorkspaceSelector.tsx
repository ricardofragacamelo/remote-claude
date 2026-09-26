import { useTranslation } from 'react-i18next';

import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { Button } from '@/shared/components/ui/button';
import { useWorkspaces } from '../hooks/useWorkspaces';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'workspace.selector.title',
  description: 'workspace.selector.description',
  loading: 'workspace.selector.loading',
  emptyTitle: 'workspace.selector.emptyTitle',
  emptyDescription: 'workspace.selector.emptyDescription',
};

/**
 * Where the session will run.
 *
 * The empty state is the interesting one here: it is not a bug, it is an installation whose
 * allowlist does not mention this person — and the text has to say that, because "no workspaces"
 * on its own reads as something broken.
 *
 * It imports a hook, and nothing else: no service, no `api.ts`.
 */
export function WorkspaceSelector(): React.JSX.Element {
  const { t } = useTranslation();
  const { isLoading, error, workspaces, selected, select, reload } = useWorkspaces();

  return (
    <LoadedList
      keys={KEYS}
      isLoading={isLoading}
      error={error}
      isEmpty={workspaces.length === 0}
      onRetry={reload}
    >
      {workspaces.map((workspace) => (
        <li key={workspace.path}>
          <Button
            variant={workspace.path === selected ? 'primary' : 'outline'}
            size="touch"
            className="w-full justify-start"
            aria-pressed={workspace.path === selected}
            onClick={() => {
              select(workspace.path);
            }}
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">{workspace.label}</span>
              <span className="font-mono text-xs opacity-70">{workspace.path}</span>
              <span className="text-xs opacity-70">
                {workspace.lastUsedAt === null
                  ? t('workspace.selector.neverUsed')
                  : t('workspace.selector.lastUsed', { at: workspace.lastUsedAt })}
              </span>
            </span>
          </Button>
        </li>
      ))}
    </LoadedList>
  );
}
