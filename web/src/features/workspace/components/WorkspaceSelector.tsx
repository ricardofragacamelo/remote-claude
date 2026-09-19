import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useWorkspaces } from '../hooks/useWorkspaces';

/**
 * Where the session will run.
 *
 * It handles the four states every screen that loads data has to handle — loading, error, empty
 * and content. The missing one is always the one a user eventually sees, so a missing one is a
 * review failure. See docs/architecture/web/03-ui-system.md.
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
    <Panel title={t('workspace.selector.title')} description={t('workspace.selector.description')}>
      {isLoading && (
        <Skeleton className="h-24 w-full" aria-label={t('workspace.selector.loading')} />
      )}

      {!isLoading && error !== null && <ErrorState error={error} onRetry={reload} />}

      {!isLoading && error === null && workspaces.length === 0 && (
        <EmptyState
          title={t('workspace.selector.emptyTitle')}
          description={t('workspace.selector.emptyDescription')}
        />
      )}

      {!isLoading && error === null && workspaces.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('workspace.selector.title')}>
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
        </ul>
      )}
    </Panel>
  );
}
