import {
  Activity,
  Info,
  LayoutPanelLeft,
  ListChecks,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

import { createRegistry } from '@/shared/lib/registry';
import type { Registry, RegistryEntry } from '@/shared/lib/registry';

/**
 * The places of the global navigation, in order — one screen per subject
 * (docs/architecture/web/03-ui-system.md#a-moldura-do-app). A place is reserved by its position; the
 * plan that owns it registers the entry. "Usage and cost" (plan 16) is held here and renders **no
 * link** until it does: a link with no destination is worse than none.
 */
export const NAVIGATION_POSITIONS = {
  workbench: 100,
  audit: 200,
  rules: 300,
  devices: 400,
  usage: 500,
  diagnostics: 600,
  agents: 700,
  settings: 800,
} as const;

/** What a link of the navigation is resolved against. */
export interface NavigationContext {
  /** The folder of the active tab, when a tab is open — where "Workbench" leads. */
  readonly workbenchFolder: string | null;
}

/** One place of the global navigation. */
export interface NavigationEntry extends RegistryEntry {
  /** A translation key, named in full where the entry is declared. */
  readonly labelKey: string;
  readonly icon: LucideIcon;

  /** Where it leads. */
  href(context: NavigationContext): string;

  /**
   * Every path it is the place of, so the item stays lit on a deep link (`/rules/rule_1`,
   * `/audit?decision=allowed`). `''` is the root. Most of the time one segment is enough and is
   * matched against the first alone (`'rules'`); an entry whose first segment another entry also
   * answers to (the engine's settings under `/settings/…`, same as the app's own) names a full
   * prefix instead (`'settings/agents'`), matched against that many leading segments of the path —
   * whichever matching prefix is the **longest** wins, so the more specific entry is the one lit
   * (plan 28, B-38, S-111).
   */
  readonly sections: readonly string[];

  /** A count beside the label, when the plan that owns the place has one to show. */
  readonly Badge?: ComponentType;
}

/** An entry of the "manage" menu at the foot of the navigation — the palette, Settings, About. */
export interface ManageEntry extends RegistryEntry {
  readonly labelKey: string;
  readonly icon: LucideIcon;

  /** A screen to go to, or something to do. */
  readonly href?: string;
  run?(): void;
}

/**
 * The entries of the navigation plan 06 declares — every place but the one held for plan 16, and the
 * agent's settings, which the engine's own extension registers at its place (plan 28, B-38, D-06).
 */
const DECLARED: readonly NavigationEntry[] = [
  {
    id: 'workbench',
    position: NAVIGATION_POSITIONS.workbench,
    labelKey: 'navigation.entry.workbench',
    icon: LayoutPanelLeft,
    href: ({ workbenchFolder }) =>
      workbenchFolder === null
        ? '/'
        : `/workbench?${new URLSearchParams({ folder: workbenchFolder }).toString()}`,
    sections: ['', 'workbench'],
  },
  {
    id: 'audit',
    position: NAVIGATION_POSITIONS.audit,
    labelKey: 'navigation.entry.audit',
    icon: ListChecks,
    href: () => '/audit',
    sections: ['audit'],
  },
  {
    id: 'rules',
    position: NAVIGATION_POSITIONS.rules,
    labelKey: 'navigation.entry.rules',
    icon: ShieldCheck,
    href: () => '/rules',
    sections: ['rules'],
  },
  {
    // A screen of its own and not a section of Settings: approving a phone is a security decision,
    // and it lives beside the others (plan 06, B-29).
    id: 'devices',
    position: NAVIGATION_POSITIONS.devices,
    labelKey: 'navigation.entry.devices',
    icon: Smartphone,
    href: () => '/devices',
    sections: ['devices'],
  },
  {
    id: 'diagnostics',
    position: NAVIGATION_POSITIONS.diagnostics,
    labelKey: 'navigation.entry.diagnostics',
    icon: Activity,
    href: () => '/diagnostics',
    sections: ['diagnostics'],
  },
  {
    // The app's settings — never the agent's, which is the screen an engine's own extension
    // registers at its own place (`NAVIGATION_POSITIONS.agents`).
    id: 'settings',
    position: NAVIGATION_POSITIONS.settings,
    labelKey: 'navigation.entry.settings',
    icon: SlidersHorizontal,
    href: () => '/settings',
    sections: ['settings'],
  },
];

/** A navigation of its own — the app has one; a test builds another. */
export function createNavigation(
  declared: readonly NavigationEntry[] = DECLARED,
): Registry<NavigationEntry> {
  return createRegistry('navigation', declared);
}

/** The global navigation of the app. */
export const globalNavigation = createNavigation();

/**
 * The "manage" menu of the app: Settings and About are declared here; the palette registers itself
 * while the shell that runs it is mounted.
 */
export const manageMenu = createRegistry<ManageEntry>('manage menu', [
  {
    id: 'settings',
    position: 200,
    labelKey: 'navigation.entry.settings',
    icon: Settings,
    href: '/settings',
  },
  { id: 'about', position: 300, labelKey: 'navigation.entry.about', icon: Info, href: '/about' },
]);

/** The first segment of a path: `/rules/rule_1` is `rules`, `/` is `''`. */
function sectionOf(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}

/**
 * Whether `section` is the place `pathname` belongs to: its first segment alone for every entry
 * that only ever needs that (`'rules'`, `''`), or the full prefix for one that needs more of the
 * path to tell it apart from another entry at the same first segment (`'settings/agents'`).
 */
function matches(section: string, pathname: string): boolean {
  if (!section.includes('/')) {
    return sectionOf(pathname) === section;
  }

  const prefix = `/${section}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The place a path belongs to, if any — what the navigation lights (plan 06, S-90). Two entries can
 * both claim the same first segment (the app's own Settings and the engine's, both under
 * `/settings/…`): the **longest** matching prefix wins, so the more specific entry is the one lit,
 * whichever order the two were declared in (plan 28, B-38, S-111).
 */
export function activeEntry(
  entries: readonly NavigationEntry[],
  pathname: string,
): NavigationEntry | undefined {
  let best: NavigationEntry | undefined;
  let bestLength = -1;

  for (const entry of entries) {
    for (const section of entry.sections) {
      if (section.length > bestLength && matches(section, pathname)) {
        best = entry;
        bestLength = section.length;
      }
    }
  }

  return best;
}
