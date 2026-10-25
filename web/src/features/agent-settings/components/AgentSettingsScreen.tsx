import { useTranslation } from 'react-i18next';

import { useEngineCapabilities } from '@/features/session';
import { SectionSelector } from '@/shared/components/SectionSelector';
import { SectionTabs } from '@/shared/components/SectionTabs';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { useRegistry } from '@/shared/hooks/useRegistry';
import {
  agentSettingsSections,
  sectionFor,
  sectionsForCapabilities,
  sectionsForEngine,
} from '../store/agent-settings-sections';
import type { AgentSettingsLocation } from '../types/location';
import type { AgentSettingsSection } from '../types/section';

export interface AgentSettingsScreenProps {
  /** The engine whose settings these are — the segment of the address (`$engine`). */
  readonly engine: string;
  readonly location: AgentSettingsLocation;

  /** Goes to another place of the screen. The route's to perform: the feature never learns the router exists. */
  onLocation(next: AgentSettingsLocation): void;
}

/**
 * "Configuração do agente": the sections at the left — above, under `md` —, one at a time (plan 13,
 * B-09, B-16; plan 28, B-38). A screen of its own, outside the app's Settings: those are the app's;
 * these are how the agent works on this machine (D-09).
 *
 * The sections are a registry: the core's own, every engine's, and whatever the engine's extension
 * registered for itself alone — what nobody registered for this engine is not here (D-06).
 */
export function AgentSettingsScreen({
  engine,
  location,
  onLocation,
}: AgentSettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const capabilities = useEngineCapabilities(engine);
  const entries = sectionsForCapabilities(
    sectionsForEngine(useRegistry(agentSettingsSections), engine),
    capabilities,
  );
  const active = sectionFor(entries, location.section);
  const label = (entry: AgentSettingsSection): string => t(entry.titleKey, { engine });

  const go = (section: string): void => {
    onLocation({ ...location, section });
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <div className="md:w-56">
        {desktop ? (
          <nav aria-label={t('agentSettings.sections.label', { engine })}>
            <SectionTabs
              entries={entries}
              active={active}
              label={label}
              onSelect={(entry) => {
                go(entry.id);
              }}
            />
          </nav>
        ) : (
          <SectionSelector
            entries={entries}
            active={active}
            pickLabel={(section) => t('agentSettings.sections.pick', { section })}
            label={label}
            onSelect={go}
          />
        )}
      </div>

      {active !== undefined && (
        <section
          aria-labelledby="agent-settings-section-heading"
          className="flex min-w-0 flex-1 flex-col gap-4"
        >
          <header className="flex flex-col gap-1">
            <h2 id="agent-settings-section-heading" className="text-ui font-ui-strong">
              {t(active.titleKey, { engine })}
            </h2>
            <p className="text-ui-sm text-muted-foreground">{t(active.purposeKey, { engine })}</p>
          </header>
          <active.Body engine={engine} location={location} onLocation={onLocation} />
        </section>
      )}
    </div>
  );
}
