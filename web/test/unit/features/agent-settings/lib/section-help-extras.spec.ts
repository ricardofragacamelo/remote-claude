import { Bot } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { sectionHelpExtras } from '@/features/agent-settings/lib/section-help-extras';
import type { AgentSettingsSection } from '@/features/agent-settings/types/section';
import { createI18n } from '@/shared/i18n';

const t = createI18n('en').t as TFunction;

function aSection(overrides: Partial<AgentSettingsSection> = {}): AgentSettingsSection {
  return {
    id: 'a',
    position: 100,
    icon: Bot,
    titleKey: 't.a',
    purposeKey: 'p.a',
    Body: () => null,
    ...overrides,
  };
}

describe('sectionHelpExtras — plan 13, B-39, B-40', () => {
  it('collects the help of every section that has one', () => {
    const withHelp = aSection({
      id: 'with-help',
      help: () => [{ id: 'x', heading: 'H', body: 'B' }],
    });

    expect(sectionHelpExtras([withHelp], t, 'claude')).toEqual([
      { id: 'x', heading: 'H', body: 'B' },
    ]);
  });

  it('contributes nothing for a section with no help yet — a newly registered one, say', () => {
    const noHelp = aSection({ id: 'no-help' });
    const withHelp = aSection({
      id: 'with-help',
      help: () => [{ id: 'x', heading: 'H', body: 'B' }],
    });

    expect(sectionHelpExtras([noHelp, withHelp], t, 'claude')).toEqual([
      { id: 'x', heading: 'H', body: 'B' },
    ]);
  });

  it('is empty with no section at all', () => {
    expect(sectionHelpExtras([], t, 'claude')).toEqual([]);
  });
});
