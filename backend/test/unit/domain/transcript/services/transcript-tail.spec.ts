import { describe, expect, it } from 'vitest';

import { transcriptTail } from '@domain/transcript';
import { someMessages } from '../../../../support/builders/transcript.builder';

const ids = (tail: ReturnType<typeof transcriptTail>): string[] =>
  tail.kind === 'tail' ? tail.entries.map((entry) => entry.id) : [];

describe('transcriptTail — plan 22, B-14', () => {
  const entries = someMessages(4);

  it('answers the entries after the one given, in order — S-40', () => {
    expect(ids(transcriptTail(entries, 'm2'))).toEqual(['m3', 'm4']);
  });

  it('answers nothing after the last entry — S-41', () => {
    expect(transcriptTail(entries, 'm4')).toEqual({ kind: 'tail', entries: [] });
  });

  it('answers everything when the reader had nothing — S-42', () => {
    expect(ids(transcriptTail(entries, null))).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('says the entry is outside the chain when a rewind or a compaction took it — S-43', () => {
    expect(transcriptTail(entries, 'gone')).toEqual({ kind: 'outside' });
    expect(transcriptTail([], 'm1')).toEqual({ kind: 'outside' });
  });

  it('is pure: the same entries and id give the same tail — S-44', () => {
    expect(transcriptTail(entries, 'm1')).toEqual(transcriptTail(entries, 'm1'));
    expect(entries.map((entry) => entry.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});
