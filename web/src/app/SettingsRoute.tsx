import { useCallback } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SettingsScreen } from '@/features/settings';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/settings/$section` — the app's Settings, one section at a time, with the section in the URL so
 * the link reproduces the screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * The route has already sent an unknown section to the first one. Claude's settings are never here:
 * they are the screen plan 11 registers at its own place in the navigation.
 */
export function SettingsRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useShellShortcuts();
  const { section } = useParams({ from: '/_frame/settings/$section' });
  const navigate = useNavigate();

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
    </ScreenFrame>
  );
}
