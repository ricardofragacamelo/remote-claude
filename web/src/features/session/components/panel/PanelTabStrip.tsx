import { Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { cn } from '@/shared/lib/utils';
import type { PanelTabs } from '../../hooks/usePanelTabs';
import { liveSessionStoreOf } from '../../store/live-session.store';
import type { PanelTab } from '../../store/claude-panel.store';
import { PanelTabMenu } from './PanelTabMenu';

/** How long a tab's name may be before it is cut — the whole of it is in the tooltip. */
const NAME_LENGTH = 32;

/** What a session's tab is called: what was first asked in it, cut — or that it is a session. */
function useSessionName(sessionId: string): string {
  const { t } = useTranslation();
  const asked = useStore(
    liveSessionStoreOf(sessionId),
    (state) =>
      state.messages.find((message) => message.role === 'user' && message.text !== '')?.text,
  );

  return asked === undefined ? t('sessions.tabs.session') : asked.slice(0, NAME_LENGTH);
}

/** The names of the tabs that are not sessions — named in full so the i18n check sees each key. */
const OTHER_NAMES = {
  draft: 'sessions.tabs.draft',
  conversation: 'sessions.tabs.history',
} as const;

/**
 * The conversations of the folder tab, as tabs of the panel (plan 08, B-32): open one, switch,
 * reorder, close — and closing never ends the session, which lives in the backend and goes on (S-150).
 */
export function PanelTabStrip({ tabs }: { readonly tabs: PanelTabs }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-center gap-1 border-b border-border pb-1">
      <ul
        aria-label={t('sessions.tabs.label')}
        className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto"
      >
        {tabs.tabs.map((tab) => (
          <TabItem key={tab.key} tab={tab} tabs={tabs} />
        ))}
      </ul>
      <IconButton icon={Plus} label={t('sessions.tabs.new')} onClick={tabs.newConversation} />
    </div>
  );
}

function TabItem({
  tab,
  tabs,
}: {
  readonly tab: PanelTab;
  readonly tabs: PanelTabs;
}): React.JSX.Element {
  const { t } = useTranslation();

  return tab.kind === 'session' ? (
    <NamedTab tab={tab} tabs={tabs} name={<SessionName sessionId={tab.sessionId} />} />
  ) : (
    <NamedTab tab={tab} tabs={tabs} name={t(OTHER_NAMES[tab.kind])} />
  );
}

function SessionName({ sessionId }: { readonly sessionId: string }): React.JSX.Element {
  return <>{useSessionName(sessionId)}</>;
}

function NamedTab({
  tab,
  tabs,
  name,
}: {
  readonly tab: PanelTab;
  readonly tabs: PanelTabs;
  readonly name: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const active = tabs.active?.key === tab.key;

  return (
    <li className={cn('flex shrink-0 items-center rounded', active && 'bg-accent')}>
      <PanelTabMenu tab={tab} tabs={tabs}>
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          title={typeof name === 'string' ? name : undefined}
          className="max-w-40 truncate px-2 py-0.5 text-left text-ui-sm"
          onClick={() => {
            tabs.activate(tab.key);
          }}
        >
          {name}
        </button>
      </PanelTabMenu>
      <IconButton
        icon={X}
        label={
          tab.kind === 'session'
            ? t('sessions.tabs.closeKeepsSession')
            : t('sessions.tabs.closeTab')
        }
        onClick={() => {
          tabs.close(tab.key);
        }}
      />
    </li>
  );
}
