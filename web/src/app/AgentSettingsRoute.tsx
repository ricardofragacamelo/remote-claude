import { useCallback } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import {
  AgentSettingsScreen,
  agentSettingsSections,
  agentSettingsShortcuts,
  sectionsForCapabilities,
  sectionsForEngine,
} from '@/features/agent-settings';
import type { AgentSettingsLocation } from '@/features/agent-settings';
import { useEngineCapabilities, useEngines } from '@/features/session';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { nameAgents } from '@/shared/i18n';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/settings/agents/$engine?section=…&folder=…` — how an engine works on this machine: its models
 * and defaults, its MCP servers, and whatever only its own extension has — the account, the
 * installation, plugins, skills and the configuration of a project, for the one engine this
 * installation drives today (plan 13; plan 28, B-36, B-38). The section and the folder are in the
 * search, so the link reproduces the screen
 * (docs/architecture/web/04-state-and-data.md#a-url-é-estado).
 *
 * Its own place in the navigation, never a section of the app's Settings (13 · D-09, D-27). The
 * route has already sent an unknown section to the first one this engine has.
 */
export function AgentSettingsRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { engine } = useParams({ from: '/_frame/settings/agents/$engine' });
  const shortcutIds = agentSettingsShortcuts
    .entries()
    .filter((shortcut) => shortcut.engine === engine)
    .map((shortcut) => shortcut.commandId);
  const shortcuts = useShellShortcuts(shortcutIds);
  const search = useSearch({ from: '/_frame/settings/agents/$engine' });
  const navigate = useNavigate();
  const capabilities = useEngineCapabilities(engine);
  // `KeepAgentNames`' own effect (plan 28, B-13) only catches the directory up a commit *after* it
  // loads — fine for an error shown after a request by then long settled, too slow for this screen's
  // own title and help, drawn straight on the render that first has it. Reading the same query here
  // keeps `{{agent}}` correct on this very render instead of the next one (plan 13, B-30).
  nameAgents(useEngines().directory);
  // The same capability filter `AgentSettingsScreen` applies to its tabs (D-82) — a section hidden
  // because the engine lacks its capability never contributes help either: a "learn more" should
  // never open for a tab that is not there (plan 13, B-30).
  const sections = sectionsForCapabilities(
    sectionsForEngine(agentSettingsSections.entries(), engine),
    capabilities,
  );
  const extra = sections.flatMap((section) => section.help?.(t, engine) ?? []);

  const go = useCallback(
    (next: AgentSettingsLocation) => {
      void navigate({ to: '/settings/agents/$engine', params: { engine }, search: next });
    },
    [navigate, engine],
  );

  return (
    <ScreenFrame
      title={t('agentSettings.screen.title', { engine })}
      purpose={t('agentSettings.screen.purpose', { engine })}
      help="agentSettings.help"
      shortcuts={shortcuts}
      extra={extra}
    >
      <AgentSettingsScreen engine={engine} location={search} onLocation={go} />
    </ScreenFrame>
  );
}
