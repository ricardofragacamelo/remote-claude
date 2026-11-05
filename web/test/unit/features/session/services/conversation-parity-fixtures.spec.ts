import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ToolLabelKey } from '@/shared/lib/tool-call';

import { conversationFrom } from '@/features/session/services/conversation-reducer';
import type { HistoryEvent } from '@/features/session/types/history';
import type { Conversation, StreamMessage } from '@/features/session/types/live-session';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const FIXTURES_ROOT = path.join(
  repoRoot,
  'packages',
  'contracts',
  'fixtures',
  'conversation-parity',
);

/**
 * One thing the neutral content of a fixture names — the shape `expected.json` holds (F6, B-28).
 *
 * `neverInHistory` (plan 13, B-46/D-31) marks an entry the CLI's own transcript never persists
 * although the live stream carries it — measured on `user-skill-plugin-turn`'s skill-loading
 * message. Never set on a `turn`, already dropped from history for its own reason.
 */
type Entry =
  | {
      readonly kind: 'message';
      readonly owner: string | null;
      readonly author: string;
      readonly blocks: readonly Block[];
      readonly neverInHistory?: true;
    }
  | {
      readonly kind: 'thinking';
      readonly owner: string | null;
      readonly text: string;
      readonly redacted: boolean;
      readonly neverInHistory?: true;
    }
  | {
      readonly kind: 'tool';
      readonly owner: string | null;
      readonly toolKind: string;
      readonly label: ToolLabelKey;
      readonly status: string;
      readonly media: readonly Attachment[];
      readonly neverInHistory?: true;
    }
  | {
      readonly kind: 'turn';
      readonly owner: null;
      readonly usage: unknown;
      readonly costUsd: string | null;
    }
  | {
      readonly kind: 'injected';
      readonly owner: string | null;
      readonly injectedKind: 'instructions' | 'other';
      readonly name: string | null;
      readonly neverInHistory?: true;
    };

type Block = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'image' };

/** A tool result's own media (plan 27, F6 · B-22) — the contract's `ToolAttachment`, read as-is. */
type Attachment =
  | {
      readonly kind: 'image';
      readonly blockId?: string;
      readonly mediaType?: string;
      readonly size?: number;
    }
  | { readonly kind: 'link'; readonly uri?: string; readonly title?: string }
  | { readonly kind: 'unknown'; readonly type?: string };

const FIXTURES = [
  'markdown-rich-turn',
  'multi-text-block-turn',
  'explanatory-style-turn',
  'mcp-untitled-tool-turn',
  'mcp-composed-tool-turn',
  'user-skill-plugin-turn',
  'subagent-permission-turn',
  'mcp-media-result-turn',
] as const;

function readJson<T>(fixture: string, file: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_ROOT, fixture, file), 'utf8')) as T;
}

/** [fixture]'s events of [file], or `[]` when that fixture recorded none (no subagent, say). */
function eventsOf(fixture: string, file: string): readonly HistoryEvent[] {
  const target = path.join(FIXTURES_ROOT, fixture, file);
  return fs.existsSync(target) ? (readJson<HistoryEvent[]>(fixture, file) ?? []) : [];
}

/**
 * [message]'s blocks, split into the neutral entries they are (F6, B-28): thinking a block of its
 * own, and the text/image around it folded into as few message entries as the blocks allow — a
 * message with none of either (only thinking, or only what opened a tool) names no entry here, the
 * same as a client's own "nothing to show" (S-84 of the mobile side).
 */
function entriesOfMessage(message: StreamMessage): Entry[] {
  const entries: Entry[] = [];
  let pending: Block[] = [];

  const flush = (): void => {
    if (pending.length > 0) {
      entries.push({
        kind: 'message',
        owner: message.parentToolUseId,
        author: message.role,
        blocks: pending,
      });
      pending = [];
    }
  };

  for (const block of message.blocks) {
    if (block.kind === 'thinking' || block.kind === 'redactedThinking') {
      flush();
      entries.push({
        kind: 'thinking',
        owner: message.parentToolUseId,
        text: block.text,
        redacted: block.kind === 'redactedThinking',
      });
    } else if (block.kind === 'text') {
      pending.push({ kind: 'text', text: block.text });
    } else {
      // `image`: none of the five fixtures of plan 26 (B-02) carries one — the marker is enough.
      pending.push({ kind: 'image' });
    }
  }
  flush();

  return entries;
}

/**
 * [state], as the neutral content both clients are measured against: the timeline, unpacked —
 * `origin`, `subject`, `rawInput`, timestamps and every other field the F6 doc does not list stay out
 * (never part of what a client is allowed to disagree about, since nothing checks them here).
 */
function neutralEntriesOf(state: Conversation): Entry[] {
  const entries: Entry[] = [];

  for (const item of state.timeline) {
    if (item.kind === 'message') {
      const message = state.messages.find((each) => each.messageId === item.id);
      if (message) {
        entries.push(...entriesOfMessage(message));
      }
    } else if (item.kind === 'tool') {
      const tool = state.tools.find((each) => each.toolUseId === item.id);
      if (tool) {
        entries.push({
          kind: 'tool',
          owner: tool.parentToolUseId,
          toolKind: tool.kind,
          label: tool.label,
          status: tool.status,
          media: (tool.attachments ?? []) as readonly Attachment[],
        });
      }
    } else if (item.kind === 'turn') {
      const turn = state.turns.find((each) => each.turnId === item.id);
      if (turn) {
        entries.push({ kind: 'turn', owner: null, usage: turn.usage, costUsd: turn.costUsd });
      }
    } else if (item.kind === 'injected') {
      entries.push({
        kind: 'injected',
        owner: item.parentToolUseId,
        injectedKind: item.injectedKind,
        name: item.name,
      });
    }
  }

  return entries;
}

/**
 * The recordings of plan 26 (B-02), read by the web's own reducer: the content it projects from the
 * same events the app is measured against, so a client that reads one into less — or more — than the
 * other fails here, before a screenshot or an e2e run notices (F6, B-28). Cenários S-82, S-83.
 */
/** [entry], with the `neverInHistory` marker gone — the reducer's own output never carries it. */
function withoutHistoryMarker(entry: Entry): Entry {
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => key !== 'neverInHistory'),
  ) as Entry;
}

describe('conversation-parity fixtures — plan 26, F6, B-28', () => {
  describe.each(FIXTURES)('%s', (fixture) => {
    const expected = readJson<{ entries: Entry[] }>(fixture, 'expected.json').entries;

    it('projects the live events into the same content — S-82', () => {
      const live = eventsOf(fixture, 'live-events.json');

      expect(neutralEntriesOf(conversationFrom(live))).toEqual(expected.map(withoutHistoryMarker));
    });

    it('projects the history into the same content, minus what history never carries — S-83', () => {
      const history = eventsOf(fixture, 'history-events.json');
      const want = expected
        .filter((entry) => entry.kind !== 'turn' && entry.owner === null && !entry.neverInHistory)
        .map(withoutHistoryMarker);

      expect(neutralEntriesOf(conversationFrom(history))).toEqual(want);
    });

    it('projects a subagent’s own history into its own slice of the same content — S-83', () => {
      const subagentHistory = eventsOf(fixture, 'subagent-history-events.json');
      // `owner` on an `injected` entry (B-21) names the *owning tool*, never a subagent — reused
      // field, different meaning — so it never belongs to this slice even when it is set.
      const want = expected.filter((entry) => entry.owner !== null && entry.kind !== 'injected');

      expect(neutralEntriesOf(conversationFrom(subagentHistory))).toEqual(want);
    });
  });
});
