import type { ReactNode } from 'react';

export interface SecondarySideBarProps {
  /** What the host puts beside the editor: the chat with the agent, for the folder of the tab. */
  readonly children: ReactNode;

  /**
   * How this chrome names the agent — the active tab's engine's `displayName`, as `GET /engines`
   * gives it, the installation's default with nothing active to name yet (plan 28, B-44): the host
   * already resolves it, reactively, off the same query every chip already reads — never this
   * chrome's own `t()` call, which would read a name no later render is guaranteed to refresh. A
   * proper noun, never translated, so this never names the wrong engine for a conversation of
   * another one (S-124).
   */
  readonly agentName: string;
}

/**
 * The chat with the agent, beside the editor — **never** a screen or a route of its own: the files
 * and the conversation about them are in the same folder tab, at the same time
 * (docs/architecture/web/03-ui-system.md#anatomia-do-workbench).
 */
export function SecondarySideBar({
  children,
  agentName,
}: SecondarySideBarProps): React.JSX.Element {
  return (
    <aside
      aria-label={agentName}
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <h2 className="flex h-header shrink-0 items-center px-3 text-ui-sm font-ui-strong tracking-wide uppercase">
        {agentName}
      </h2>
      {/* No scroll here: the child is given a height and scrolls what is its own (plan 09, B-04). */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
