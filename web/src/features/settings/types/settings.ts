import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { RegistryEntry } from '@/shared/lib/registry';

/**
 * One option of a section, as the search of Settings finds it: by its label, in the language on
 * screen. The section renders the option with the id `setting-<id>`, so the search can take the
 * person to it.
 */
export interface SettingOption {
  readonly id: string;

  /** A translation key, named in full where the option is declared. */
  readonly labelKey: string;
}

/**
 * One section of the app's Settings — a registry entry: plan 06 declares Appearance and Workspaces,
 * plan 07 registers "Editor" and plan 12 "Terminal". **Never** Claude's settings, which are the
 * screen of plan 13 (docs/architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam).
 */
export interface SettingsSectionEntry extends RegistryEntry {
  /** The last segment of `/settings/$section`. */
  readonly id: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly component: ComponentType;
  readonly options: readonly SettingOption[];
}

/** One option the search found, with the section it lives in. */
export interface SettingMatch {
  readonly section: SettingsSectionEntry;
  readonly option: SettingOption;
}
