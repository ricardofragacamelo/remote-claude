import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';
import { createRegistry } from '@/shared/lib/registry';
import type { Registry, RegistryEntry } from '@/shared/lib/registry';

/**
 * A part of the rules screen's help that only one engine's own behaviour explains — what an engine
 * decides before this product's rules are ever asked (plan 15, B-26). Registered by the engine's own
 * extension, the same way `defaultsExtraFields` lets one add a field to the defaults form (plan 28,
 * D-06) — the core never imports `engines/`, so the engine brings its own topic to this registry
 * instead of the core reaching for it.
 */
export interface RulesHelpExtra extends RegistryEntry {
  readonly engine: string;
  help(t: TFunction): HelpExtra;
}

/** The engine-specific parts of the rules screen's help, each read by the engine that registered it. */
export const rulesHelpExtras: Registry<RulesHelpExtra> = createRegistry('rules help extras');
