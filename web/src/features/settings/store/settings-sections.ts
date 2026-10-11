import { FolderTree, Palette } from 'lucide-react';

import { WorkspaceSettings } from '@/features/workspace';
import { createRegistry } from '@/shared/lib/registry';
import type { Registry } from '@/shared/lib/registry';
import { AppearanceSection } from '../components/AppearanceSection';
import type { SettingsSectionEntry } from '../types/settings';

/**
 * What a section of the **app's** settings may never be about: the coding agent — its engine, its
 * model, its permission mode and its MCP servers — is the screen of plan 13, and a section here would
 * put the two in one screen — which the navigation promises they never share (plan 06, S-145). Said
 * by what the agent's settings are, never by the name of one engine (plan 28, B-39).
 */
const AGENT_SUBJECT = /agent|engine|model|permission|mcp/i;

/**
 * Refuses a section about the agent — at load, where two plans disagreeing is a bug to see.
 *
 * @throws {Error} naming the section and the word that gave it away
 */
export function assertAppSection(entry: SettingsSectionEntry): void {
  const named = [entry.id, entry.labelKey, ...entry.options.flatMap((o) => [o.id, o.labelKey])];
  const word = named.find((name) => AGENT_SUBJECT.test(name));

  if (word !== undefined) {
    throw new Error(
      `settings sections: "${entry.id}" is about the agent ("${word}") — that is plan 13's screen`,
    );
  }
}

/**
 * The sections plan 06 declares. Declared, not registered from an effect: the route decides whether
 * the section of the address is one it knows before anything renders, and a section that arrived a
 * render later would send `/settings/workspaces` to the first one.
 */
const DECLARED: readonly SettingsSectionEntry[] = [
  {
    id: 'appearance',
    position: 100,
    labelKey: 'settings.section.appearance',
    icon: Palette,
    component: AppearanceSection,
    options: [
      { id: 'theme', labelKey: 'settings.appearance.theme' },
      { id: 'language', labelKey: 'settings.appearance.language' },
      { id: 'density', labelKey: 'settings.appearance.density' },
    ],
  },
  {
    id: 'workspaces',
    position: 200,
    labelKey: 'settings.section.workspaces',
    icon: FolderTree,
    component: WorkspaceSettings,
    options: [
      { id: 'roots', labelKey: 'workspace.roots.title' },
      { id: 'allowlist', labelKey: 'workspace.allowlist.title' },
      { id: 'recent', labelKey: 'workspace.recent.title' },
    ],
  },
];

/** Sections of their own — the app has one list; a test builds another. */
export function createSettingsSections(
  declared: readonly SettingsSectionEntry[] = DECLARED,
): Registry<SettingsSectionEntry> {
  declared.forEach(assertAppSection);
  const registry = createRegistry('settings sections', declared);

  return {
    ...registry,
    register(entry) {
      assertAppSection(entry);
      return registry.register(entry);
    },
  };
}

/** The sections of the app's Settings — where plans 07 and 12 register theirs. */
export const settingsSections = createSettingsSections();

/**
 * The section an address names, or the first one when it names none this installation has — an old
 * link, a section of a plan not installed. Never an error: the settings are still there (S-142).
 */
export function sectionFor(
  entries: readonly SettingsSectionEntry[],
  id: string,
): SettingsSectionEntry | undefined {
  return entries.find((entry) => entry.id === id) ?? entries[0];
}

/**
 * Where `/settings` alone leads: the first section registered — Appearance, in this plan. With none
 * registered at all (a test's empty list), the id the first one has here, so a link still names a
 * section and the route has somewhere to stop.
 */
export function firstSectionId(entries: readonly SettingsSectionEntry[]): string {
  return entries[0]?.id ?? 'appearance';
}
