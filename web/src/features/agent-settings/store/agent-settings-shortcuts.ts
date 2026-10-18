import { createRegistry } from '@/shared/lib/registry';
import type { Registry, RegistryEntry } from '@/shared/lib/registry';

/**
 * One shortcut an engine's extension wants listed in the help of its own settings screen — beyond
 * the shell's own (the palette, the screen's help). The core reads the ids generically, by engine,
 * never naming one itself (plan 28, B-38, D-06).
 */
export interface AgentSettingsShortcut extends RegistryEntry {
  readonly engine: string;
  readonly commandId: string;
}

export const agentSettingsShortcuts: Registry<AgentSettingsShortcut> = createRegistry(
  'agent settings shortcuts',
);
