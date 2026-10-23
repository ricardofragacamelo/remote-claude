import type { LucideIcon } from 'lucide-react';

import type { CommandDeclaration } from '../hooks/useCommands';

/** The minimal shape a screen's own action needs to become a palette "go" command. */
export interface GoActionLike {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  available(): boolean;
  run(): void;
}

/**
 * Turns [action] into a `category: 'go'` command, [labelParams] resolving whatever the label
 * names (`{{agent}}`) — the same shape every screen's own action list builds its palette entries
 * from (`mcp`'s own `mcp-server-actions.ts`, an engine extension's own `plugin-actions.ts`, plan 13,
 * B-28, B-29), so a palette entry never drifts from the toolbar button it mirrors.
 */
export function goCommandOf(
  action: GoActionLike,
  labelParams: Readonly<Record<string, string>>,
): CommandDeclaration {
  return {
    id: action.id,
    labelKey: action.labelKey,
    labelParams,
    category: 'go',
    icon: action.icon,
    when: action.available,
    run: action.run,
  };
}
