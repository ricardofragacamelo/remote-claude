import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';
import type { AgentSettingsSection } from '../types/section';

/**
 * Every section's own help, flattened — `help` is optional on a section (a newly registered one may
 * have none yet, the same placeholder stage `Nothing` documents), so a section without one simply
 * contributes nothing, never a gap in the drawer.
 */
export function sectionHelpExtras(
  sections: readonly AgentSettingsSection[],
  t: TFunction,
  engine: string,
): HelpExtra[] {
  return sections.flatMap((section) => section.help?.(t, engine) ?? []);
}
