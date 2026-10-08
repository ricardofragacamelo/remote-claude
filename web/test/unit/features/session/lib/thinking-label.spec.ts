import { describe, expect, it } from 'vitest';

import { thinkingLabel } from '@/features/session/lib/thinking-label';
import type { MessageBlock } from '@/features/session/types/live-session';
import { translator } from '../../../../support/render';

const t = translator('en');
const tPt = translator('pt-BR');

const SAID: MessageBlock = { kind: 'thinking', text: 'Weighing it' };
const OMITTED: MessageBlock = { kind: 'thinking', text: '' };

function read(block: MessageBlock, thinkingMs: number | null, streaming = false): string {
  const label = thinkingLabel(block, thinkingMs, streaming);
  return t(label.key, label.params);
}

/** The summary line of a thinking — plan 22, B-27 (D-14, D-15). */
describe('what a thinking says of itself', () => {
  it('says it is thinking while it arrives', () => {
    expect(read(SAID, 3_000, true)).toBe(t('sessions.thinking.live'));
  });

  it('says only "Thought" for one the model omitted — never a notice of absence — S-101', () => {
    expect(read(OMITTED, null)).toBe(t('sessions.thinking.done'));
    expect(read(OMITTED, null)).not.toBe(t('sessions.thinking.hidden'));
  });

  it('says a redacted one was hidden, with no duration — S-103', () => {
    expect(read({ kind: 'redactedThinking', text: '', atMostMs: 4_000 }, 2_000)).toBe(
      t('sessions.thinking.hidden'),
    );
  });

  it('says how long the stream measured, with no "up to" — S-107', () => {
    expect(read(SAID, 3_000)).toBe('Thought for 3 s');
  });

  it('says how long at most, from the history — S-104', () => {
    expect(read({ ...SAID, atMostMs: 7_000 }, null)).toBe('Thought for up to 7 s');
    expect(tPt(thinkingLabel({ ...SAID, atMostMs: 7_000 }, null, false).key, { seconds: 7 })).toBe(
      'Pensou por até 7 s',
    );
  });

  it('prefers what the stream measured to what the history bounds', () => {
    expect(read({ ...SAID, atMostMs: 9_000 }, 2_000)).toBe('Thought for 2 s');
  });

  it('says no duration without the instants — S-106', () => {
    expect(read(SAID, null)).toBe(t('sessions.thinking.done'));
  });

  it.each([
    [0, 'Thought for up to 0 s'],
    [499, 'Thought for up to 0 s'],
    [500, 'Thought for up to 1 s'],
    [59_499, 'Thought for up to 59 s'],
    [59_500, 'Thought for up to 1 min 00 s'],
    [60_000, 'Thought for up to 1 min 00 s'],
    [125_000, 'Thought for up to 2 min 05 s'],
  ])('rounds %i ms of the history, and changes unit at a minute — S-105', (atMostMs, said) => {
    expect(read({ ...SAID, atMostMs }, null)).toBe(said);
  });

  it.each([
    [400, 'Thought for 0 s'],
    [59_000, 'Thought for 59 s'],
    [61_000, 'Thought for 1 min 01 s'],
  ])('rounds %i ms of the stream the same way — S-105', (thinkingMs, said) => {
    expect(read(SAID, thinkingMs)).toBe(said);
  });
});
