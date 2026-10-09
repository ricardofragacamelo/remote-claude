import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ClaudeSettingsScreen, claudeSettingsHelp } from '@/features/claude-settings';
import type { ClaudeSettingsLocation } from '@/features/claude-settings';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/claude-settings?section=…&folder=…` — how Claude works on this machine: the account, the
 * installation, models and defaults, MCP servers, plugins, skills and the configuration of a
 * project (plan 13). The section and the folder are in the search, so the link reproduces the screen
 * (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * Its own place in the navigation, never a section of the app's Settings (13 · D-09, D-27).
 */
export function ClaudeSettingsRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const shortcuts = useShellShortcuts(['claude.defaultModel', 'claude.testConnection']);
  const location = useSearch({ from: '/_frame/claude-settings' });
  const navigate = useNavigate();

  const go = useCallback(
    (next: ClaudeSettingsLocation) => {
      void navigate({ to: '/claude-settings', search: next });
    },
    [navigate],
  );

  return (
    <ScreenFrame
      title={t('claudeSettings.screen.title')}
      purpose={t('claudeSettings.screen.purpose')}
      help="claudeSettings.help"
      shortcuts={shortcuts}
      extra={claudeSettingsHelp(t)}
    >
      <ClaudeSettingsScreen location={location} onLocation={go} />
    </ScreenFrame>
  );
}
