import { describe, expect, it } from 'vitest';

import { mergedWithPersistedNotices } from '@adapter/outbound/engines/claude/persisted-notice-merge';
import type { TimedTranscriptMessage } from '@adapter/outbound/engines/claude/persisted-notice-merge';
import type { SessionNoticePayload } from '@remote-claude/contracts';

const aNotice = (noticeId: string, at: string): SessionNoticePayload => ({
  noticeId,
  kind: 'agent.info',
  level: 'warning',
  origin: { engine: 'claude', native: 'system:hook_response' },
  text: 'a hook failed',
  at,
});

const aMessage = (id: string, at: string, events: TimedTranscriptMessage['events'] = []) =>
  ({ id, at, events }) satisfies TimedTranscriptMessage;

describe('mergedWithPersistedNotices — Plan 27, F7, D-15', () => {
  it('a notice with no pair in the real transcript appears once, in the right position — S-118', () => {
    const before = aMessage('before', '2026-11-03T10:00:00.000Z');
    const after = aMessage('after', '2026-11-03T10:02:00.000Z');

    const merged = mergedWithPersistedNotices(
      [before, after],
      [aNotice('n1', '2026-11-03T10:01:00.000Z')],
    );

    expect(merged.map((message) => message.id)).toEqual(['before', 'persisted-notice:n1', 'after']);
  });

  it('a noticeId the real transcript already carries is not added again — the reconstruction wins — S-119', () => {
    const reconstructed = aMessage('compaction', '2026-11-03T10:00:00.000Z', [
      { type: 'session.notice', payload: { noticeId: 'n1', kind: 'command.output' } },
    ]);

    const merged = mergedWithPersistedNotices(
      [reconstructed],
      [aNotice('n1', '2026-11-03T09:59:00.000Z')],
    );

    expect(merged).toEqual([reconstructed]);
    expect(merged.filter((message) => message.id === 'persisted-notice:n1')).toHaveLength(0);
  });

  it('merging the same notices twice is a no-op — re-reading never grows the list — S-120', () => {
    const base = [aMessage('before', '2026-11-03T10:00:00.000Z')];
    const notices = [aNotice('n1', '2026-11-03T10:01:00.000Z')];

    const once = mergedWithPersistedNotices(base, notices);
    const twice = mergedWithPersistedNotices(once, notices);

    expect(twice).toEqual(once);
    expect(twice.filter((message) => message.id === 'persisted-notice:n1')).toHaveLength(1);
  });

  it('a conversation with no persisted notice at all is untouched — S-112, boundary', () => {
    const base = [aMessage('before', '2026-11-03T10:00:00.000Z')];

    expect(mergedWithPersistedNotices(base, [])).toBe(base);
  });

  it('a notice or a message with no `at` keeps its input order instead of being misplaced — boundary', () => {
    const before = aMessage('before', '2026-11-03T10:00:00.000Z');
    const withoutAt: SessionNoticePayload = {
      noticeId: 'n1',
      kind: 'agent.info',
      level: 'info',
      origin: { engine: 'claude', native: 'system:informational' },
      text: 'no timestamp at all',
    };

    const merged = mergedWithPersistedNotices([before], [withoutAt]);

    expect(merged.map((message) => message.id)).toEqual(['before', 'persisted-notice:n1']);
  });
});
