import { describe, expect, it } from 'vitest';
import { Activity, Settings2 } from 'lucide-react';

import {
  activeEntry,
  createNavigation,
  globalNavigation,
  manageMenu,
  NAVIGATION_POSITIONS,
} from '@/app/global-navigation';
import type { NavigationEntry } from '@/app/global-navigation';
// Importing the composition root registers the engines' extensions — including Claude's place in
// the navigation — onto the very singletons this spec reads (plan 28, B-38).
import '@/app/engines';

const nowhere = { workbenchFolder: null };

/** An entry a later plan registers, at the place plan 06 held for it. */
function entryOf(id: string, position: number, sections: readonly string[]): NavigationEntry {
  return {
    id,
    position,
    labelKey: `navigation.entry.${id}`,
    icon: id === 'usage' ? Activity : Settings2,
    href: () => `/${id}`,
    sections,
  };
}

describe('the global navigation — plan 06, S-89', () => {
  it("lists, in order, every screen there is, including an engine extension's own place", () => {
    expect(globalNavigation.entries().map((entry) => entry.id)).toEqual([
      'workbench',
      'audit',
      'rules',
      'devices',
      'diagnostics',
      'claude',
      'settings',
    ]);
  });

  it('holds the place of plan 16 without a link, and puts its entry there', () => {
    const navigation = createNavigation();
    expect(navigation.entries().some((entry) => entry.id === 'usage')).toBe(false);

    navigation.register(entryOf('usage', NAVIGATION_POSITIONS.usage, ['usage']));

    expect(navigation.entries().map((entry) => entry.id)).toEqual([
      'workbench',
      'audit',
      'rules',
      'devices',
      'usage',
      'diagnostics',
      'settings',
    ]);
  });

  it("keeps the order the product states for every place, the engine extension's place included", () => {
    const order = Object.entries(NAVIGATION_POSITIONS)
      .sort(([, left], [, right]) => left - right)
      .map(([id]) => id);

    expect(order).toEqual([
      'workbench',
      'audit',
      'rules',
      'devices',
      'usage',
      'diagnostics',
      'agents',
      'settings',
    ]);
  });

  it('refuses a second entry for a place already taken', () => {
    const navigation = createNavigation();

    expect(() => navigation.register(entryOf('rules', 300, ['rules']))).toThrow(
      /already registered/,
    );
  });

  it('leads "Workbench" to the active folder tab, and to the welcome screen without one — S-187', () => {
    const workbench = globalNavigation.entries().find((entry) => entry.id === 'workbench');

    expect(workbench?.href(nowhere)).toBe('/');
    expect(workbench?.href({ workbenchFolder: '/srv/projects/a b#1' })).toBe(
      '/workbench?folder=%2Fsrv%2Fprojects%2Fa+b%231',
    );
  });

  it('leads the others to their screens', () => {
    const hrefs = globalNavigation.entries().map((entry) => entry.href(nowhere));

    expect(hrefs).toEqual([
      '/',
      '/audit',
      '/rules',
      '/devices',
      '/diagnostics',
      '/settings/agents/claude',
      '/settings',
    ]);
  });

  it("gives the agent's settings a place of its own, never a section of the app's — plan 13, S-55; plan 28, B-38", () => {
    const claude = globalNavigation.entries().find((entry) => entry.id === 'claude');

    expect(claude?.position).toBe(NAVIGATION_POSITIONS.agents);
    expect(claude?.href(nowhere)).toBe('/settings/agents/claude');
    expect(claude?.sections).toEqual(['settings/agents']);
  });

  it('gives Devices a place of its own, never a section of Settings — S-138', () => {
    const devices = globalNavigation.entries().find((entry) => entry.id === 'devices');

    expect(devices?.position).toBe(NAVIGATION_POSITIONS.devices);
    expect(devices?.href(nowhere)).toBe('/devices');
  });

  it('declares Settings and About in the "manage" menu; the palette registers itself — B-32', () => {
    expect(manageMenu.entries().map((entry) => [entry.id, entry.href])).toEqual([
      ['settings', '/settings'],
      ['about', '/about'],
    ]);
  });
});

describe('the place a path belongs to — plan 06, S-90', () => {
  const entries = globalNavigation.entries();

  it.each([
    ['/', 'workbench'],
    ['/workbench', 'workbench'],
    ['/audit', 'audit'],
    ['/rules', 'rules'],
    ['/rules/rule_1', 'rules'],
    ['/devices', 'devices'],
    ['/diagnostics', 'diagnostics'],
    ['/settings/appearance', 'settings'],
  ])('lights %s as %s, deep links included', (pathname, id) => {
    expect(activeEntry(entries, pathname)?.id).toBe(id);
  });

  it.each(['/usage', '/sessions/01J0', '/history/c1', '/about'])(
    'lights nothing for %s, which no entry is the place of — S-150',
    (pathname) => {
      expect(activeEntry(entries, pathname)).toBeUndefined();
    },
  );

  it('reads an empty path as the root', () => {
    expect(activeEntry(entries, '')?.id).toBe('workbench');
  });

  it(
    "lights the engine's settings, never the app's, for /settings/agents/claude — both start with " +
      '"settings" (plan 28, B-38, S-111)',
    () => {
      expect(activeEntry(entries, '/settings/agents/claude')?.id).toBe('claude');
      expect(activeEntry(entries, '/settings/agents/claude/')?.id).toBe('claude');
    },
  );

  it("still lights the app's own Settings for every other address under /settings/…", () => {
    expect(activeEntry(entries, '/settings/appearance')?.id).toBe('settings');
    expect(activeEntry(entries, '/settings/workspaces')?.id).toBe('settings');
    expect(activeEntry(entries, '/settings')?.id).toBe('settings');
  });

  it('matches a multi-segment section regardless of which entry was declared first', () => {
    const reordered = createNavigation([
      entryOf('agents', NAVIGATION_POSITIONS.agents, ['settings/agents']),
      entryOf('settings', NAVIGATION_POSITIONS.settings, ['settings']),
    ]);

    expect(activeEntry(reordered.entries(), '/settings/agents/claude')?.id).toBe('agents');
    expect(activeEntry(reordered.entries(), '/settings/appearance')?.id).toBe('settings');
  });
});
