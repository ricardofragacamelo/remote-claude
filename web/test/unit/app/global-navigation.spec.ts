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
  it('lists, in order, every screen plan 06 has — and no link for the places it holds — B-29…B-31', () => {
    expect(globalNavigation.entries().map((entry) => entry.id)).toEqual([
      'workbench',
      'audit',
      'rules',
      'devices',
      'diagnostics',
      'settings',
    ]);
  });

  it('holds the places of plans 13 and 16 without a link, and puts their entries there', () => {
    const navigation = createNavigation();
    expect(navigation.entries().some((entry) => entry.id === 'usage')).toBe(false);

    navigation.register(entryOf('claude', NAVIGATION_POSITIONS.claude, ['claude']));
    navigation.register(entryOf('usage', NAVIGATION_POSITIONS.usage, ['usage']));

    expect(navigation.entries().map((entry) => entry.id)).toEqual([
      'workbench',
      'audit',
      'rules',
      'devices',
      'usage',
      'diagnostics',
      'claude',
      'settings',
    ]);
  });

  it('keeps the order the product states for every place', () => {
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
      'claude',
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

    expect(hrefs).toEqual(['/', '/audit', '/rules', '/devices', '/diagnostics', '/settings']);
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
});
