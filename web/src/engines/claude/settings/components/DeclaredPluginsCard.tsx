import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import type { ProjectPluginsDeclaration } from '../types/project-config';

export interface DeclaredPluginsCardProps {
  readonly plugins: ProjectPluginsDeclaration;
}

/**
 * `enabledPlugins`/`enableAllProjectMcpServers` of the project's own `settings.json`, read-only (plan
 * 13, B-38, D-17): the first depends on the plugin being installed on this machine (the Plugins
 * section says which are); the second does not count here at all — `.mcp.json` approval (B-24, F2)
 * decides every server one at a time regardless of this flag.
 */
export function DeclaredPluginsCard({ plugins }: DeclaredPluginsCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const declared = plugins.enabled.length > 0 || plugins.disabled.length > 0;

  return (
    <section aria-labelledby="project-plugins-heading" className="flex flex-col gap-2">
      <h3 id="project-plugins-heading" className="font-ui-strong text-ui">
        {t('engines.claude.project.declaredPluginsTitle')}
      </h3>

      {!declared ? (
        <EmptyState
          title={t('engines.claude.project.declaredPluginsEmptyTitle')}
          description={t('engines.claude.project.declaredPluginsEmptyBody')}
        />
      ) : (
        <ul className="flex flex-col gap-1 text-ui-sm">
          {plugins.enabled.map((name) => (
            <li key={name}>{t('engines.claude.project.declaredPluginsEnabled', { name })}</li>
          ))}
          {plugins.disabled.map((name) => (
            <li key={name}>{t('engines.claude.project.declaredPluginsDisabled', { name })}</li>
          ))}
        </ul>
      )}

      {plugins.enableAllProjectMcpServers && (
        <p className="text-ui-xs text-muted-foreground">
          {t('engines.claude.project.declaredPluginsEnableAllMcp')}
        </p>
      )}
    </section>
  );
}
