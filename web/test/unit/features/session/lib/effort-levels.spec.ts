import { describe, expect, it } from 'vitest';

import { effortToStart, levelName, offeredEfforts } from '@/features/session/lib/effort-levels';
import type { InstallationModel } from '@/features/session/types/insight';
import { createI18n } from '@/shared/i18n';
import { CAPABILITIES, FEWER_CAPABILITIES } from '../../../../support/engines';

const OPUS: InstallationModel = {
  value: 'opus',
  resolvedModel: 'model-opus-5',
  displayName: 'Opus',
  description: '',
  supportsEffort: true,
  supportedEffortLevels: ['max', 'low', 'high'],
};

describe('the levels of effort a conversation offers — plan 28, B-28', () => {
  it('offers the engine`s levels the model takes too, in the engine`s order — S-83', () => {
    expect(offeredEfforts(CAPABILITIES, OPUS)).toEqual(['low', 'high', 'max']);
    expect(offeredEfforts({ ...CAPABILITIES, effortLevels: ['high'] }, OPUS)).toEqual(['high']);
  });

  it('offers none from an engine that announces none: there is no choice to show — S-83', () => {
    expect(offeredEfforts(FEWER_CAPABILITIES, OPUS)).toEqual([]);
  });

  it('offers none for a model that takes none, or one not known — plan 08, S-171', () => {
    expect(offeredEfforts(CAPABILITIES, { ...OPUS, supportsEffort: false })).toEqual([]);
    expect(offeredEfforts(CAPABILITIES, undefined)).toEqual([]);
  });

  it('offers the model`s own while the engine is not known', () => {
    expect(offeredEfforts(null, OPUS)).toEqual(['max', 'low', 'high']);
  });

  it('starts with the effort chosen while the engine announces it, or nobody knows yet', () => {
    expect(effortToStart(CAPABILITIES, 'high')).toBe('high');
    expect(effortToStart(null, 'high')).toBe('high');
  });

  it('starts with the model`s default for a level the engine does not announce, or none chosen', () => {
    expect(effortToStart(FEWER_CAPABILITIES, 'high')).toBeNull();
    expect(effortToStart({ ...CAPABILITIES, effortLevels: ['low'] }, 'max')).toBeNull();
    expect(effortToStart(CAPABILITIES, null)).toBeNull();
  });
});

describe('what a level of effort is called', () => {
  const { t } = createI18n('en');
  const names = new Map([['high', 'sessions.effort.high']]);

  it('names a canonical level by its key, and one this build does not know as the engine does', () => {
    expect(levelName(names, 'high', t)).toBe(t('sessions.effort.high'));
    expect(levelName(names, 'turbo', t)).toBe('turbo');
  });
});
