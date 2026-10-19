#!/usr/bin/env -S npx tsx
/**
 * Turns the five recordings of plan 26 (B-02, `backend/test/fakes/agent-sdk/fixtures/`) into the WS
 * events the backend actually publishes for them — live, from history, and (for the one fixture with
 * a subagent) from the subagent's own history route. These are the fixtures `packages/contracts/
 * fixtures/conversation-parity/` holds for F6, B-28: the common input the web's `conversation-reducer`
 * and the app's `session_event_mapper`/`Conversation` are both tested against, so a client that reads
 * the same events into different content fails there, not in production.
 *
 * It goes through the real `SdkMessageMapper`/`historicalEvents` — the same ones
 * `sdk-message.mapper.parity-fixtures.spec.ts` already pins — never a second, hand-written mapping
 * that could drift from what ships.
 *
 * Usage: `pnpm fixtures:conversation-parity` (from the repo root) or `tsx
 * scripts/record-conversation-parity-fixtures.ts` (from `backend/`).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { payloadRecord } from '@application/session';
import type { SessionEvent } from '@application/session';
import {
  historicalEvents,
  SdkMessageMapper,
} from '@adapter/outbound/engines/claude/sdk-message.mapper';

import { loadFixture } from '../test/fakes/agent-sdk/fixture';
import { ok, title } from '../../scripts/lib/ui.mjs';

const FIXTURES = [
  'markdown-rich-turn',
  'multi-text-block-turn',
  'explanatory-style-turn',
  'mcp-untitled-tool-turn',
  'subagent-permission-turn',
] as const;

const OUT_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'contracts',
  'fixtures',
  'conversation-parity',
);

/** [event], as plain JSON the web and the app can both read without our backend types. */
function recordOf(event: SessionEvent): { type: string; payload: Record<string, unknown> } {
  return { type: event.type, payload: payloadRecord(event) };
}

/**
 * The `message.completed` a live session publishes for the prompt itself — `handOverPrompt`'s event,
 * not `SdkMessageMapper`'s, since the CLI never streams back what was typed into it. It goes out
 * under the id history later files the same prompt under (D-19 of plan 08's F6), which is
 * [fixture]'s first history entry — so a live reducer and a reloaded one start from the same message.
 */
function promptEchoOf(fixture: ReturnType<typeof loadFixture>): {
  type: string;
  payload: Record<string, unknown>;
} {
  const [first] = fixture.history ?? [];
  const messageId = first?.uuid ?? fixture.name;

  return {
    type: 'message.completed',
    payload: {
      messageId,
      role: 'user',
      content: [{ type: 'text', blockId: `${messageId}:0`, text: fixture.prompt }],
    },
  };
}

/** The events the backend publishes, live, for every message of [name]'s recording, in order. */
function liveEventsOf(name: string): { type: string; payload: Record<string, unknown> }[] {
  const fixture = loadFixture(name);
  const mapper = new SdkMessageMapper('');

  return [
    promptEchoOf(fixture),
    ...fixture.messages.flatMap((message: SDKMessage) => mapper.read(message).events.map(recordOf)),
  ];
}

/** The same, from a reload of the history — [messages] already filed apart from one conversation. */
function historyEventsOf(
  messages: readonly SessionMessage[],
): { type: string; payload: Record<string, unknown> }[] {
  return messages.flatMap((message) => historicalEvents(message, '').map(recordOf));
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function recordFixture(name: string): void {
  const fixture = loadFixture(name);
  const dir = path.join(OUT_ROOT, name);
  mkdirSync(dir, { recursive: true });

  writeJson(path.join(dir, 'live-events.json'), liveEventsOf(name));
  writeJson(path.join(dir, 'history-events.json'), historyEventsOf(fixture.history ?? []));

  const subagents = Object.values(fixture.subagents ?? {});
  if (subagents.length > 0) {
    writeJson(path.join(dir, 'subagent-history-events.json'), historyEventsOf(subagents[0] ?? []));
  }

  ok(name);
}

function main(): void {
  title('conversation-parity fixtures — plan 26, F6, B-28');
  for (const name of FIXTURES) {
    recordFixture(name);
  }
}

main();
