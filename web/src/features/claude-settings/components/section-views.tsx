import { Blocks, Bot, FolderCog, Puzzle, Server, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { ClaudeSettingsLocation, ClaudeSettingsSection } from '../types/claude-settings';
import { AccountSection } from './AccountSection';
import { InstallationSection } from './InstallationSection';
import { ModelsSection } from './ModelsSection';

/** What a section draws below its heading. */
export interface SectionBodyProps {
  readonly location: ClaudeSettingsLocation;
  onLocation(next: ClaudeSettingsLocation): void;
}

/** One section of the screen: its icon, its two texts, and what it draws. */
export interface SectionView {
  readonly icon: LucideIcon;
  readonly titleKey: string;
  readonly purposeKey: string;
  readonly Body: (props: SectionBodyProps) => React.JSX.Element | null;
}

/** A section whose body arrives with a later phase of the plan: the heading and purpose only. */
function Nothing(): null {
  return null;
}

/**
 * The seven sections, each with its keys named in full — a key built from a template is one the
 * i18n check cannot see (docs/architecture/shared/02-i18n.md).
 */
export const SECTION_VIEWS: Readonly<Record<ClaudeSettingsSection, SectionView>> = {
  account: {
    icon: Bot,
    titleKey: 'claudeSettings.account.title',
    purposeKey: 'claudeSettings.account.purpose',
    Body: AccountSection,
  },
  installation: {
    icon: Wrench,
    titleKey: 'claudeSettings.installation.title',
    purposeKey: 'claudeSettings.installation.purpose',
    Body: InstallationSection,
  },
  models: {
    icon: Sparkles,
    titleKey: 'claudeSettings.models.title',
    purposeKey: 'claudeSettings.models.purpose',
    Body: ModelsSection,
  },
  mcp: {
    icon: Server,
    titleKey: 'claudeSettings.mcp.title',
    purposeKey: 'claudeSettings.mcp.purpose',
    Body: Nothing,
  },
  plugins: {
    icon: Puzzle,
    titleKey: 'claudeSettings.plugins.title',
    purposeKey: 'claudeSettings.plugins.purpose',
    Body: Nothing,
  },
  skills: {
    icon: Blocks,
    titleKey: 'claudeSettings.skills.title',
    purposeKey: 'claudeSettings.skills.purpose',
    Body: Nothing,
  },
  project: {
    icon: FolderCog,
    titleKey: 'claudeSettings.project.title',
    purposeKey: 'claudeSettings.project.purpose',
    Body: Nothing,
  },
};
