import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { SECTION_VIEWS } from './section-views';
import { CLAUDE_SETTINGS_SECTIONS } from '../types/claude-settings';
import type { ClaudeSettingsLocation, ClaudeSettingsSection } from '../types/claude-settings';

export interface ClaudeSettingsScreenProps {
  readonly location: ClaudeSettingsLocation;

  /** Goes to another place of the screen. The route's to perform: the feature never learns the router exists. */
  onLocation(next: ClaudeSettingsLocation): void;
}

/**
 * "Configuração do Claude": the sections at the left — above, under `md` —, one at a time
 * (plan 13, B-09, B-16). A screen of its own, outside the app's Settings: those are the app's;
 * these are how Claude works on this machine (D-09).
 */
export function ClaudeSettingsScreen({
  location,
  onLocation,
}: ClaudeSettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const view = SECTION_VIEWS[location.section];

  const go = (section: ClaudeSettingsSection): void => {
    onLocation({ ...location, section });
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <nav aria-label={t('claudeSettings.sections.label')} className="md:w-56">
        <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
          {CLAUDE_SETTINGS_SECTIONS.map((section) => {
            const entry = SECTION_VIEWS[section];

            return (
              <li key={section}>
                <button
                  type="button"
                  aria-current={section === location.section ? 'page' : undefined}
                  className={cn(
                    'flex min-h-touch w-full items-center gap-2 rounded-md px-3 text-ui hover:bg-accent md:min-h-8',
                    section === location.section && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => {
                    go(section);
                  }}
                >
                  <entry.icon className="size-4" aria-hidden />
                  {t(entry.titleKey)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        aria-labelledby="claude-settings-section-heading"
        className="flex min-w-0 flex-1 flex-col gap-4"
      >
        <header className="flex flex-col gap-1">
          <h2 id="claude-settings-section-heading" className="text-ui font-ui-strong">
            {t(view.titleKey)}
          </h2>
          <p className="text-ui-sm text-muted-foreground">{t(view.purposeKey)}</p>
        </header>
        <view.Body location={location} onLocation={onLocation} />
      </section>
    </div>
  );
}
