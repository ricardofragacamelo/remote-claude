import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

export interface McpJsonCardProps {
  onOpenMcpSection(): void;
}

/**
 * `.mcp.json` is the core's own concern (approval, servers, status — F2), never read again here: this
 * card is only a way in, the same navigation-only precedent the Plugins section already set for its
 * own "approve the servers it suggests" shortcut (plan 13, D-91).
 */
export function McpJsonCard({ onOpenMcpSection }: McpJsonCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="project-mcp-heading" className="flex flex-col gap-2">
      <h3 id="project-mcp-heading" className="font-ui-strong text-ui">
        {t('engines.claude.project.mcpJsonTitle')}
      </h3>
      <p className="text-ui-sm text-muted-foreground">{t('engines.claude.project.mcpJsonBody')}</p>
      <Button variant="outline" onClick={onOpenMcpSection} className="self-start">
        {t('engines.claude.project.mcpJsonLink')}
      </Button>
    </section>
  );
}
