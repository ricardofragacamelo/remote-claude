import type { ComponentType } from 'react';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';

import type { HelpExtra } from '@/shared/components/HelpPanel';
import type { RegistryEntry } from '@/shared/lib/registry';
import type { AgentSettingsLocation } from './location';

/** What a section of the screen draws below its heading. */
export interface SectionBodyProps {
  /** The engine whose settings are on screen — the segment of the address (`$engine`). */
  readonly engine: string;
  readonly location: AgentSettingsLocation;

  /** Goes to another place of the screen. The route's to perform: the feature never learns the router exists. */
  onLocation(next: AgentSettingsLocation): void;
}

/**
 * One section of an engine's settings screen — a registry entry: the core declares the ones every
 * engine has (its models and defaults, its MCP servers), and an engine's extension registers the
 * ones only it has (plan 28, B-38, D-06).
 */
export interface AgentSettingsSection extends RegistryEntry {
  /**
   * `undefined`: the section applies to every engine — the core's own. A specific engine's id: only
   * that engine's extension shows it, and only while its settings are on screen.
   */
  readonly engine?: string;
  readonly icon: LucideIcon;
  readonly titleKey: string;
  readonly purposeKey: string;
  readonly Body: ComponentType<SectionBodyProps>;

  /**
   * The parts of the screen's help this section adds, beyond the three every screen has — written
   * with the engine in hand, so a section with nothing engine-specific to add may leave this out.
   */
  help?(t: TFunction, engine: string): readonly HelpExtra[];
}
