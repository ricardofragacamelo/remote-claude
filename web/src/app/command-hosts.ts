import type { ComponentType } from 'react';

import { createRegistry } from '@/shared/lib/registry';
import type { Registry, RegistryEntry } from '@/shared/lib/registry';

/**
 * A component with nothing to draw, mounted once for somebody signed in, whose only job is to
 * declare commands with `useCommands` — the hook a plan needs when a shortcut navigates, since only
 * a mounted component resolves `useNavigate()` against the router actually on screen (production's
 * singleton, or a test's own memory history), never a module-level reference to either (plan 28,
 * B-38, S-111).
 */
export interface CommandHostEntry extends RegistryEntry {
  readonly component: ComponentType;
}

/** The hosts `ShellHosts` renders, each registered by the plan whose shortcuts they declare. */
export const commandHosts: Registry<CommandHostEntry> = createRegistry('command hosts');
