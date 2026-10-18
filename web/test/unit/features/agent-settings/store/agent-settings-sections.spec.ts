import { describe, expect, it } from 'vitest';
import { Bot } from 'lucide-react';

import {
  agentSettingsSections,
  createAgentSettingsSections,
  firstAgentSectionId,
  sectionFor,
  sectionsForEngine,
} from '@/features/agent-settings';
import type { AgentSettingsSection } from '@/features/agent-settings';
import { Nothing } from '@/features/agent-settings';

function sectionOf(id: string, engine?: string, position = 100): AgentSettingsSection {
  return {
    id,
    position,
    icon: Bot,
    titleKey: `t.${id}`,
    purposeKey: `p.${id}`,
    Body: Nothing,
    ...(engine === undefined ? {} : { engine }),
  };
}

describe('the sections every engine has — plan 28, B-36, B-38', () => {
  it("declares the core's own, with no engine of their own", () => {
    const ids = agentSettingsSections.entries().map((entry) => entry.id);

    expect(ids).toEqual(expect.arrayContaining(['models', 'mcp']));
    expect(agentSettingsSections.entries().every((entry) => entry.engine === undefined)).toBe(true);
  });

  it('refuses a second section for a place already taken', () => {
    const sections = createAgentSettingsSections();

    expect(() => sections.register(sectionOf('models', undefined, 300))).toThrow(
      /already registered/,
    );
  });
});

describe('the sections of one engine — core and its own extension together', () => {
  // Already in position order, the way `registry.entries()` always hands it out.
  const entries = [
    sectionOf('account', 'claude', 100),
    sectionOf('other-only', 'other', 150),
    sectionOf('installation', 'claude', 200),
    sectionOf('models', undefined, 300),
    sectionOf('mcp', undefined, 400),
  ];

  it("keeps the core's and the ones its own extension registered, never another engine's", () => {
    expect(sectionsForEngine(entries, 'claude').map((entry) => entry.id)).toEqual([
      'account',
      'installation',
      'models',
      'mcp',
    ]);
  });

  it("is the core's alone for an engine nobody's extension registered for", () => {
    expect(sectionsForEngine(entries, 'unknown').map((entry) => entry.id)).toEqual([
      'models',
      'mcp',
    ]);
  });

  it('finds a section by id, or falls back to the first — never an error', () => {
    const forClaude = sectionsForEngine(entries, 'claude');

    expect(sectionFor(forClaude, 'installation')?.id).toBe('installation');
    expect(sectionFor(forClaude, 'nowhere')?.id).toBe('account');
  });

  it('names the first section as where the bare address leads', () => {
    expect(firstAgentSectionId(sectionsForEngine(entries, 'claude'))).toBe('account');
    expect(firstAgentSectionId([])).toBe('models');
  });
});
