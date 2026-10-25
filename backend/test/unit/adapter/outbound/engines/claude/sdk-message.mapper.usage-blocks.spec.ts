import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  historicalEvents,
  SdkMessageMapper,
} from '@adapter/outbound/engines/claude/sdk-message.mapper';
import { isMessageCompletedPayload, isTurnCompletedPayload } from '@remote-claude/contracts';
import { payloadOf } from '../../../../../support/builders/session.builder';

/** A `result` of the SDK carrying [usage] — the end of a turn. */
function result(usage: unknown, extra: Record<string, unknown> = {}): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    uuid: 'r-1',
    duration_ms: 1_000,
    total_cost_usd: 0.5,
    usage,
    ...extra,
  } as unknown as SDKMessage;
}

/** The usage of the `turn.completed` the mapper made of [usage]. */
function usageOf(usage: unknown): unknown {
  return payloadOf(new SdkMessageMapper('').read(result(usage)).events[0])['usage'];
}

/** An assistant message holding [content], live. */
function assistant(content: readonly Record<string, unknown>[]): SDKMessage {
  return {
    type: 'assistant',
    uuid: 'u-1',
    message: { id: 'msg-1', content },
  } as unknown as SDKMessage;
}

/** The same message, read back from a transcript. */
function entry(content: readonly Record<string, unknown>[]): SessionMessage {
  return {
    type: 'assistant',
    uuid: 'u-1',
    session_id: 's-1',
    parent_tool_use_id: null,
    parent_agent_id: null,
    message: { id: 'msg-1', content },
  } as unknown as SessionMessage;
}

/** The block kinds of the `message.completed` among [events]. */
function kindsOf(events: readonly { type: string; payload: unknown }[]): unknown[] {
  const completed = events.find((event) => event.type === 'message.completed');
  const content = (completed?.payload as { content?: { type: unknown }[] } | undefined)?.content;
  return (content ?? []).map((block) => block.type);
}

describe('the usage of a turn, in canonical names — plan 28, S-85', () => {
  it('carries every count the API gave, under our names, with the same numbers', () => {
    expect(
      usageOf({
        input_tokens: 1_200,
        output_tokens: 340,
        cache_read_input_tokens: 9_000,
        cache_creation_input_tokens: 512,
        server_tool_use: { web_search_requests: 3, web_fetch_requests: 1 },
        service_tier: 'standard',
      }),
    ).toEqual({
      inputTokens: 1_200,
      outputTokens: 340,
      cacheReadTokens: 9_000,
      cacheWriteTokens: 512,
      webSearches: 3,
    });
  });

  it('keeps a zero, which is a count and not an absence', () => {
    expect(
      usageOf({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        server_tool_use: { web_search_requests: 0 },
      }),
    ).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      webSearches: 0,
    });
  });

  it.each([
    ['a fraction', 1.5],
    ['a negative', -1],
    ['a string', '10'],
    ['null', null],
    ['not a number', Number.NaN],
    ['an infinity', Number.POSITIVE_INFINITY],
  ])('drops a count that is %s', (_name, value) => {
    expect(
      usageOf({
        input_tokens: value,
        output_tokens: 7,
        cache_read_input_tokens: value,
        cache_creation_input_tokens: value,
        server_tool_use: { web_search_requests: value },
      }),
    ).toEqual({ outputTokens: 7 });
  });

  it.each([
    ['no usage at all', undefined],
    ['a usage that is not an object', 'lots'],
    ['an empty usage', {}],
    ['a usage of names it does not know', { reasoning_tokens: 5 }],
  ])('carries an empty usage for %s', (_name, usage) => {
    expect(usageOf(usage)).toEqual({});
  });

  it('reads no web searches from a tool use that is not an object', () => {
    expect(usageOf({ input_tokens: 1, server_tool_use: 'many' })).toEqual({ inputTokens: 1 });
  });

  it('makes a `turn.completed` the contract accepts', () => {
    const [event] = new SdkMessageMapper('').read(
      result({ input_tokens: 1, cache_read_input_tokens: 2 }),
    ).events;

    expect(event?.type).toBe('turn.completed');
    expect(isTurnCompletedPayload(event?.payload)).toBe(true);
  });
});

describe('the turn guard of the contract — plan 28, S-86', () => {
  const turn = { turnId: 'r-1', durationMs: 1_000, outcome: 'completed' };

  it('accepts a turn with no cost, as an engine that reports none sends it', () => {
    expect(isTurnCompletedPayload({ ...turn, usage: { inputTokens: 1 } })).toBe(true);
  });

  it('accepts an empty usage', () => {
    expect(isTurnCompletedPayload({ ...turn, usage: {} })).toBe(true);
  });

  it('accepts a cost of zero, which is not an absence', () => {
    expect(isTurnCompletedPayload({ ...turn, usage: {}, costUsd: '0.000000' })).toBe(true);
  });

  it('refuses a turn without a usage, or with a negative count', () => {
    expect(isTurnCompletedPayload(turn)).toBe(false);
    expect(isTurnCompletedPayload({ ...turn, usage: { outputTokens: -1 } })).toBe(false);
  });

  it('refuses a turn without an outcome — S-32…S-34', () => {
    expect(isTurnCompletedPayload({ turnId: 'r-1', durationMs: 1_000, usage: {} })).toBe(false);
  });
});

describe('the block kinds of a message, in canonical names — plan 28, S-88 / S-90', () => {
  const blocks = [
    { type: 'text', text: 'hi' },
    { type: 'thinking', thinking: 'why', signature: 's' },
    { type: 'redacted_thinking', data: 'opaque' },
    { type: 'tool_use', id: 't-1', name: 'Read', input: { file_path: '/a' } },
    { type: 'tool_result', tool_use_id: 't-0', content: 'ok' },
  ];
  const canonical = ['text', 'thinking', 'redactedThinking', 'toolUse', 'toolResult'];

  it('renames the API`s kinds live', () => {
    const events = new SdkMessageMapper('').read(assistant(blocks)).events;

    expect(kindsOf(events)).toEqual(canonical);
  });

  it('renames them the same read back from history', () => {
    expect(kindsOf(historicalEvents(entry(blocks), ''))).toEqual(canonical);
  });

  it('leaves no name of the API in the blocks', () => {
    const events = new SdkMessageMapper('').read(assistant(blocks)).events;
    const content = JSON.stringify(
      events.filter((event) => event.type === 'message.completed').map((event) => event.payload),
    );

    expect(content).not.toMatch(/redacted_thinking|"tool_use"|"tool_result"/);
  });

  it.each(['server_tool_use', 'web_search_tool_result', 'constructor', 'toString', 'unknown'])(
    'passes a kind it does not know through unchanged — %s',
    (type) => {
      const live = new SdkMessageMapper('').read(assistant([{ type, extra: 1 }])).events;

      expect(kindsOf(live)).toEqual([type]);
      expect(kindsOf(historicalEvents(entry([{ type }]), ''))).toEqual([type]);
    },
  );

  it('names a block that says no kind `unknown`', () => {
    const live = new SdkMessageMapper('').read(assistant([{ text: 'no type' }])).events;

    expect(kindsOf(live)).toEqual(['unknown']);
  });

  it('makes a `message.completed` the contract accepts, whatever the kinds', () => {
    const events = new SdkMessageMapper('').read(
      assistant([...blocks, { type: 'brand_new' }]),
    ).events;
    const completed = events.find((event) => event.type === 'message.completed');

    expect(isMessageCompletedPayload(completed?.payload)).toBe(true);
  });
});
