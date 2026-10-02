import { describe, expect, it } from 'vitest';
import { Keyboard, Terminal } from 'lucide-react';

import {
  assertAppSection,
  createSettingsSections,
  firstSectionId,
  sectionFor,
  settingsSections,
} from '@/features/settings';
import type { SettingsSectionEntry } from '@/features/settings';

/** A section a later plan registers. */
function aSection(overrides: Partial<SettingsSectionEntry> = {}): SettingsSectionEntry {
  return {
    id: 'terminal',
    position: 400,
    labelKey: 'settings.section.terminal',
    icon: Terminal,
    component: () => null,
    options: [{ id: 'shell', labelKey: 'settings.terminal.shell' }],
    ...overrides,
  };
}

describe('the sections of the app’s Settings — plan 06, B-31', () => {
  it('holds Appearance and Workspaces, in that order — D-13', () => {
    expect(settingsSections.entries().map((section) => section.id)).toEqual([
      'appearance',
      'workspaces',
    ]);
  });

  it('lists a section another plan registers, in its place, and not before — S-146', () => {
    const sections = createSettingsSections();
    expect(sections.entries().some((section) => section.id === 'editor')).toBe(false);

    const removeTerminal = sections.register(aSection());
    const removeEditor = sections.register(
      aSection({
        id: 'editor',
        position: 300,
        labelKey: 'settings.section.editor',
        icon: Keyboard,
      }),
    );

    expect(sections.entries().map((section) => section.id)).toEqual([
      'appearance',
      'workspaces',
      'editor',
      'terminal',
    ]);

    removeEditor();
    removeTerminal();
    expect(sections.entries().map((section) => section.id)).toEqual(['appearance', 'workspaces']);
  });

  it.each([
    ['its id', aSection({ id: 'claude' })],
    ['its label', aSection({ labelKey: 'claude.settings.model' })],
    ['an option', aSection({ options: [{ id: 'permissionMode', labelKey: 'settings.x.mode' }] })],
    ['an option’s label', aSection({ options: [{ id: 'servers', labelKey: 'settings.x.mcp' }] })],
  ])('refuses a section about Claude, given away by %s — S-145', (_how, section) => {
    expect(() => createSettingsSections().register(section)).toThrow(/plan 13/);
    expect(() => {
      assertAppSection(section);
    }).toThrow(/about Claude/);
  });

  it('refuses one declared at creation too', () => {
    expect(() => createSettingsSections([aSection({ id: 'model' })])).toThrow(/plan 13/);
  });

  it('declares no section about Claude itself — S-145', () => {
    for (const section of settingsSections.entries()) {
      expect(() => {
        assertAppSection(section);
      }).not.toThrow();
    }
  });

  it('refuses a second section with an id already taken', () => {
    expect(() => createSettingsSections().register(aSection({ id: 'appearance' }))).toThrow(
      /already registered/,
    );
  });
});

describe('the section an address names — S-142', () => {
  const entries = settingsSections.entries();

  it('is the one it names', () => {
    expect(sectionFor(entries, 'workspaces')?.id).toBe('workspaces');
  });

  it('is the first one when it names one this installation lacks', () => {
    expect(sectionFor(entries, 'editor')?.id).toBe('appearance');
  });

  it('is nothing with no section at all', () => {
    expect(sectionFor([], 'appearance')).toBeUndefined();
  });

  it('leads /settings alone to the first one — and to Appearance with none registered', () => {
    expect(firstSectionId(entries)).toBe('appearance');
    expect(firstSectionId([aSection()])).toBe('terminal');
    expect(firstSectionId([])).toBe('appearance');
  });
});
