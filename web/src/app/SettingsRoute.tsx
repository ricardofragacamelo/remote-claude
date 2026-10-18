import { useCallback } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useEngines } from '@/features/session';
import { SettingsScreen } from '@/features/settings';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/settings/$section` — the app's Settings, one section at a time, with the section in the URL so
 * the link reproduces the screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * The route has already sent an unknown section to the first one. The agent's settings are never
 * here: they are the screen an engine's own extension registers at its own place in the navigation —
 * the link below leads to the default engine's (plan 28, B-38, D-27).
 */
export function SettingsRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useShellShortcuts();
  const { section } = useParams({ from: '/_frame/settings/$section' });
  const navigate = useNavigate();
  const { directory } = useEngines();

  const goTo = useCallback(
    (id: string) => {
      void navigate({ to: '/settings/$section', params: { section: id } });
    },
    [navigate],
  );

  return (
    <ScreenFrame
      title={t('settings.screen.title')}
      purpose={t('settings.screen.purpose')}
      help="settings.help"
      shortcuts={shortcuts}
    >
      <SettingsScreen section={section} onSection={goTo} />
      {/* The agent's own settings are not a section here: they have a screen (13 · D-27). */}
      {directory?.defaultEngine !== null && directory?.defaultEngine !== undefined && (
        <p className="text-ui-sm text-muted-foreground">
          <Link
            to="/settings/agents/$engine"
            params={{ engine: directory.defaultEngine }}
            // No section named: the route sends it to the first one this engine has, the same way
            // its own navigation entry's link does — never a section only one engine might have.
            search={{ section: '' }}
            className="underline underline-offset-4"
          >
            {t('settings.links.agentSettings', { engine: directory.defaultEngine })}
          </Link>
        </p>
      )}
    </ScreenFrame>
  );
}
