import { PanelBottom } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { panelTabs } from '../store/registries';
import { ViewPlaceholder } from './ViewPlaceholder';

export interface BottomPanelProps {
  readonly folder: string;
}

/**
 * The bottom panel: the tabs plans 08 and 10 register — the terminal, the output of a session. With
 * none registered it says what will live here, rather than showing an empty strip.
 */
export function BottomPanel({ folder }: BottomPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const tabs = useRegistry(panelTabs);
  const [first] = tabs;

  return (
    <section
      aria-label={t('workbench.panel.label')}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      {first === undefined ? (
        <ViewPlaceholder
          icon={PanelBottom}
          title={t('workbench.panel.placeholderTitle')}
          description={t('workbench.panel.placeholderDescription')}
        />
      ) : (
        <Tabs defaultValue={first.id} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-2">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="overflow-y-auto">
              <tab.component folder={folder} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
