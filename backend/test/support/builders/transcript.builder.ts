import { TranscriptAudience } from '@application/transcript';
import type { LiveConversationSource, TranscriptOriginSource } from '@application/transcript';
import type { Clock } from '@domain/shared';
import { ClaudeSessionId } from '@domain/transcript';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';
import { FixedClock } from '../fakes/fixed-clock';
import { anAllowlist } from './workspace.builder';

/** A canonical UUID whose last group is `n` — nameable in an assertion, and valid. */
export function conversationId(n: number): string {
  return `6b41b192-a41b-46c2-b8d7-${n.toString(16).padStart(12, '0')}`;
}

/** A conversation as the store describes it, with defaults, so a test states only what matters. */
export function aTranscriptSession(
  overrides: Partial<Omit<TranscriptSession, 'id'>> & { readonly id?: string | number } = {},
): TranscriptSession {
  const { id = 1, ...rest } = overrides;

  return {
    id: ClaudeSessionId.create(typeof id === 'number' ? conversationId(id) : id),
    summary: 'a conversation',
    cwd: '/srv/projects/app',
    gitBranch: null,
    createdAt: null,
    lastModified: 1_758_800_000_000,
    ...rest,
  };
}

/** `count` messages, `m1`…, each with one completed-message event. */
export function someMessages(count: number, prefix = 'm'): TranscriptMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${String(index + 1)}`,
    events: [
      {
        type: 'message.completed',
        payload: { messageId: `${prefix}${String(index + 1)}`, role: 'assistant', content: [] },
      },
    ],
  }));
}

/** What an audience of the history is built with — each part a default a test can replace. */
export interface AudienceParts {
  readonly origins?: TranscriptOriginSource;
  readonly live?: LiveConversationSource;
  readonly clock?: Clock;
  readonly activeWindowMs?: number;
}

/**
 * The fence of the history over the allowlist of the builders: nothing opened here, nothing live, and
 * a clock a second after {@link aTranscriptSession} was written — so a conversation reads as active
 * elsewhere unless the test says otherwise.
 */
export function aTranscriptAudience(parts: AudienceParts = {}): TranscriptAudience {
  return new TranscriptAudience(
    { current: () => anAllowlist() },
    parts.origins ?? { openersOf: () => Promise.resolve(new Map()) },
    parts.live ?? { liveSessionOf: () => null },
    {
      clock: parts.clock ?? new FixedClock(new Date(1_758_800_000_000 + 1_000)),
      activeWindowMs: parts.activeWindowMs ?? 120_000,
    },
  );
}
