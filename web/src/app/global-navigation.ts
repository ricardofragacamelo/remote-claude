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
 * plan that owns it registers the entry. "Usage and cost" (plan 14) and "Claude settings" (plan 11)
 * are held here and render **no link** until they do: a link with no destination is worse than none.
 */
export const NAVIGATION_POSITIONS = {
  workbench: 100,
  audit: 200,
  rules: 300,
  devices: 400,
  usage: 500,
  diagnostics: 600,
  claude: 700,
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
   * The first segment of every path it is the place of — so the item stays lit on a deep link
   * (`/rules/rule_1`, `/audit?decision=allowed`). `''` is the root.
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
 * The entries plan 06 declares: every place of the navigation but the two held for plans 11 and 14.
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
    // The app's settings — never Claude's, which is the screen plan 11 registers at its own place.
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

/** The place a path belongs to, if any — what the navigation lights (plan 06, S-90). */
export function activeEntry(
  entries: readonly NavigationEntry[],
  pathname: string,
): NavigationEntry | undefined {
  const section = sectionOf(pathname);

  return entries.find((entry) => entry.sections.includes(section));
}
