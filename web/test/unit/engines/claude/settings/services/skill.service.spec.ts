import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import {
  fetchSkillPreferences,
  fetchSkills,
  saveSkillPreferences,
} from '@/engines/claude/settings/services/skill.service';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSkills — plan 13, B-34', () => {
  it('asks the folder, encoded, and unwraps the envelope', async () => {
    const skill = { name: 'review', origin: 'project' as const };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ skills: [skill] });

    expect(await fetchSkills('/srv/a b')).toEqual([skill]);
    expect(get).toHaveBeenCalledWith('/engines/claude/skills?folder=%2Fsrv%2Fa%20b');
  });
});

describe('fetchSkillPreferences — D-109', () => {
  it('asks the raw preferences of a folder, encoded', async () => {
    const view = {
      effective: { value: { sources: {}, disabledSkills: [] }, from: 'installation' as const },
      user: null,
      folder: null,
    };
    const get = vi.spyOn(api, 'get').mockResolvedValue(view);

    expect(await fetchSkillPreferences('/srv/app')).toEqual(view);
    expect(get).toHaveBeenCalledWith('/engines/claude/skills/preferences?folder=%2Fsrv%2Fapp');
  });
});

describe('saveSkillPreferences — D-108', () => {
  it('puts the folder and the whole value together, never a partial toggle', async () => {
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ sources: { user: true }, disabledSkills: [] });

    await saveSkillPreferences('/srv/app', { sources: { user: true }, disabledSkills: [] });

    expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
      folder: '/srv/app',
      sources: { user: true },
      disabledSkills: [],
    });
  });
});
