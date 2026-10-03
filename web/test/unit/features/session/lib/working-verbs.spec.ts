import { describe, expect, it } from 'vitest';

import { verbOf, WORKING_VERBS } from '@/features/session/lib/working-verbs';
import en from '@/shared/i18n/locales/en.json';
import ptBR from '@/shared/i18n/locales/pt-BR.json';

/** The verb of a turn — plan 09, D-16, S-53. */
describe('the verb of a turn', () => {
  it('is the same for the same turn, however often it is drawn', () => {
    const turn = '01J0ABCDEFGHJKMNPQRSTVWXYZ:3';

    expect(new Set(Array.from({ length: 50 }, () => verbOf(turn))).size).toBe(1);
  });

  it('is drawn from the whole list across turns — the next turn may draw another', () => {
    const drawn = new Set(
      Array.from({ length: 400 }, (_, index) => verbOf(`session:${String(index)}`)),
    );

    expect(drawn.size).toBeGreaterThan(WORKING_VERBS.length / 2);
    for (const verb of drawn) {
      expect(WORKING_VERBS).toContain(verb);
    }
  });

  it('draws a verb for a turn named by nothing', () => {
    expect(WORKING_VERBS).toContain(verbOf(''));
  });

  it('has about twenty verbs, each in both languages of the catalogue', () => {
    expect(WORKING_VERBS.length).toBe(20);
    expect(Object.keys(en.sessions.workingVerb).sort()).toEqual([...WORKING_VERBS].sort());
    expect(Object.keys(ptBR.sessions.workingVerb).sort()).toEqual([...WORKING_VERBS].sort());
  });
});
