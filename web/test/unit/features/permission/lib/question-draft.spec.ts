import { describe, expect, it } from 'vitest';

import {
  EMPTY_DRAFT,
  allAnswered,
  answersOf,
  choose,
  isAnswered,
  isRecommended,
  onStep,
  otherOf,
  toggleOther,
  writeOther,
} from '@/features/permission/lib/question-draft';
import type { Question, QuestionInteraction } from '@/features/permission/types/permission';

const single: Question = {
  id: 'q1',
  header: 'Library',
  prompt: 'Which library?',
  multiSelect: false,
  options: [
    { label: 'date-fns', description: '', preview: null },
    { label: 'luxon', description: '', preview: null },
  ],
};

const multiple: Question = { ...single, id: 'q2', multiSelect: true };
const both: QuestionInteraction = { malformed: false, questions: [single, multiple] };

describe('the draft of a question card — plan 24, B-13', () => {
  it('takes one label on a single choice, instead of the one before and of the free answer — S-64', () => {
    const withOther = writeOther(toggleOther(EMPTY_DRAFT, single), single, 'mine');
    const chosen = choose(choose(withOther, single, 'date-fns'), single, 'luxon');

    expect(chosen.selected['q1']).toEqual(['luxon']);
    expect(otherOf(chosen, single)).toBeNull();
  });

  it('toggles labels on a multiple choice, beside each other and beside the free answer — S-65', () => {
    const marked = choose(
      choose(toggleOther(EMPTY_DRAFT, multiple), multiple, 'date-fns'),
      multiple,
      'luxon',
    );

    expect(marked.selected['q2']).toEqual(['date-fns', 'luxon']);
    expect(otherOf(marked, multiple)).toBe('');
    expect(choose(marked, multiple, 'date-fns').selected['q2']).toEqual(['luxon']);
  });

  it('makes the free answer the choice on a single choice, and unmarks it when asked — S-66', () => {
    const marked = toggleOther(choose(EMPTY_DRAFT, single, 'luxon'), single);

    expect(marked.selected['q1']).toEqual([]);
    expect(otherOf(marked, single)).toBe('');
    expect(otherOf(toggleOther(marked, single), single)).toBeNull();
  });

  it('counts no empty free answer as an answer, and a filled one as one — S-66, S-69', () => {
    const empty = toggleOther(EMPTY_DRAFT, single);

    expect(isAnswered(empty, single)).toBe(false);
    expect(isAnswered(writeOther(empty, single, '  '), single)).toBe(false);
    expect(isAnswered(writeOther(empty, single, 'x'), single)).toBe(true);
    expect(allAnswered(both, writeOther(empty, single, 'x'))).toBe(false);
    expect(allAnswered(both, choose(writeOther(empty, single, 'x'), multiple, 'luxon'))).toBe(true);
  });

  it('gives every answer in the order of the questions, the free answer trimmed or absent', () => {
    const draft = choose(
      writeOther(toggleOther(onStep(EMPTY_DRAFT, 1), single), single, '  my own  '),
      multiple,
      'date-fns',
    );

    expect(answersOf(both, draft)).toEqual([
      { questionId: 'q1', selected: [], other: 'my own' },
      { questionId: 'q2', selected: ['date-fns'], other: null },
    ]);
    expect(draft.step).toBe(1);
  });

  it('tells the recommended option by the end of its label — S-71', () => {
    expect(isRecommended('Fast (Recommended)')).toBe(true);
    expect(isRecommended('Fast (recommended) ')).toBe(true);
    expect(isRecommended('Recommended reading')).toBe(false);
  });
});
