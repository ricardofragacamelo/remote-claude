import { describe, expect, it } from 'vitest';

import {
  apiRetryMessages,
  compactBoundaryMessage,
  conversationResetMessage,
  HOOK_SYSTEM_MESSAGE,
  hookSystemMessageLocation,
  rateLimitShape,
  repositoryFiles,
  spikeRows,
  strayBlocksBesideToolResult,
  systemSubtypes,
} from '../../../scripts/lib/conversation-losses-spike.mjs';

describe('the repository a hook-message probe runs in — plan 27, B-01', () => {
  it('ships a PreToolUse hook whose command answers with the marker systemMessage, single-quoted for the shell', () => {
    const files = repositoryFiles();
    const settings = JSON.parse(files['.claude/settings.json'] ?? '{}');
    const command = settings.hooks.PreToolUse[0].hooks[0].command;

    expect(settings.hooks.PreToolUse[0].matcher).toBe('*');
    expect(command).toContain(HOOK_SYSTEM_MESSAGE);
    // The B-01 run itself caught the bug this guards: a double-quoted `-e` argument lets the shell
    // swallow the JSON's own double quotes, and the hook then prints unquoted, invalid JSON.
    expect(command).toMatch(/^node -e '.*'$/);
  });
});

describe('the system subtypes of a list of messages', () => {
  it('collects every system subtype once, in first-seen order, and ignores the rest', () => {
    expect(
      systemSubtypes([
        { type: 'assistant' },
        { type: 'system', subtype: 'compact_boundary' },
        { type: 'system', subtype: 'hook_response' },
        { type: 'system', subtype: 'compact_boundary' },
        { type: 'result' },
      ]),
    ).toEqual(['compact_boundary', 'hook_response']);
  });

  it('is empty when nothing is system', () => {
    expect(systemSubtypes([{ type: 'assistant' }])).toEqual([]);
  });
});

describe('where a hook systemMessage turns up', () => {
  it('finds the message that carries the marker, with its subtype', () => {
    const messages = [
      { type: 'system', subtype: 'hook_response', output: 'nothing here' },
      { type: 'system', subtype: 'informational', content: `says ${HOOK_SYSTEM_MESSAGE}` },
    ];

    expect(hookSystemMessageLocation(messages, HOOK_SYSTEM_MESSAGE)).toEqual({
      type: 'system',
      subtype: 'informational',
    });
  });

  it('prefers the informational message over a hook_response that echoes the same marker raw', () => {
    const messages = [
      {
        type: 'system',
        subtype: 'hook_response',
        output: `{"systemMessage":"${HOOK_SYSTEM_MESSAGE}"}`,
      },
      {
        type: 'system',
        subtype: 'informational',
        content: `PreToolUse:Bash says: ${HOOK_SYSTEM_MESSAGE}`,
      },
    ];

    expect(hookSystemMessageLocation(messages, HOOK_SYSTEM_MESSAGE)).toEqual({
      type: 'system',
      subtype: 'informational',
    });
  });

  it('falls back to the hook_response when no informational message carries the marker', () => {
    const messages = [{ type: 'system', subtype: 'hook_response', output: HOOK_SYSTEM_MESSAGE }];

    expect(hookSystemMessageLocation(messages, HOOK_SYSTEM_MESSAGE)).toEqual({
      type: 'system',
      subtype: 'hook_response',
    });
  });

  it('reports no subtype as null, for a message type that has none', () => {
    const messages = [{ type: 'conversation_reset', new_conversation_id: HOOK_SYSTEM_MESSAGE }];

    expect(hookSystemMessageLocation(messages, HOOK_SYSTEM_MESSAGE)).toEqual({
      type: 'conversation_reset',
      subtype: null,
    });
  });

  it('answers null when the marker appears nowhere', () => {
    expect(hookSystemMessageLocation([{ type: 'result' }], HOOK_SYSTEM_MESSAGE)).toBeNull();
  });
});

describe('the rate_limit_info a session saw', () => {
  it('reads it off the rate_limit_event', () => {
    const info = { status: 'allowed' };
    expect(
      rateLimitShape([{ type: 'result' }, { type: 'rate_limit_event', rate_limit_info: info }]),
    ).toBe(info);
  });

  it('is null when no such event arrived', () => {
    expect(rateLimitShape([{ type: 'result' }])).toBeNull();
  });
});

describe('the api_retry messages of a session', () => {
  it('keeps only the system messages of that subtype', () => {
    const retry = { type: 'system', subtype: 'api_retry', attempt: 1 };
    expect(
      apiRetryMessages([{ type: 'system', subtype: 'hook_response' }, retry, { type: 'result' }]),
    ).toEqual([retry]);
  });

  it('is empty when the API never needed a retry', () => {
    expect(apiRetryMessages([{ type: 'result' }])).toEqual([]);
  });
});

describe('the conversation_reset message after a /clear', () => {
  it('finds it by type', () => {
    const reset = { type: 'conversation_reset', new_conversation_id: 'new-1' };
    expect(conversationResetMessage([{ type: 'assistant' }, reset])).toBe(reset);
  });

  it('is null when the CLI never sent one', () => {
    expect(conversationResetMessage([{ type: 'assistant' }])).toBeNull();
  });
});

describe('the compact_boundary message of a /compact', () => {
  it('finds it by subtype alone, whatever its type', () => {
    const boundary = { type: 'system', subtype: 'compact_boundary', compact_metadata: {} };
    expect(compactBoundaryMessage([{ type: 'assistant' }, boundary])).toBe(boundary);
  });

  it('is null when no /compact ran', () => {
    expect(compactBoundaryMessage([{ type: 'assistant' }])).toBeNull();
  });
});

describe('a block beside a tool_result', () => {
  it('ignores a message that is not a user message', () => {
    expect(strayBlocksBesideToolResult([{ type: 'assistant', message: { content: [] } }])).toEqual(
      [],
    );
  });

  it('ignores a user message with no tool_result at all', () => {
    const message = { type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } };
    expect(strayBlocksBesideToolResult([message])).toEqual([]);
  });

  it('finds nothing stray in an ordinary tool_result message', () => {
    const message = {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }] },
    };
    expect(strayBlocksBesideToolResult([message])).toEqual([]);
  });

  it('reports every block type found beside the tool_result', () => {
    const message = {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1' },
          { type: 'text', text: 'surprise' },
        ],
      },
    };
    expect(strayBlocksBesideToolResult([message])).toEqual([['text']]);
  });
});

describe('the report rows of the B-01 spike', () => {
  it('builds one row per probe present, in the fixed question order, and skips the rest', () => {
    const rows = spikeRows({
      systemMessages: {
        withoutCount: 2,
        withoutMs: 10,
        withCount: 5,
        withMs: 30,
        subtypes: ['compact_boundary'],
      },
      hookMessage: { location: null },
      strayBlock: [],
      compactChain: { boundary: null, inHistory: false },
    });

    expect(rows.map((row) => row.id)).toEqual(['1', '2', '9', '10']);
    expect(rows[0]?.answer).toContain('compact_boundary');
    expect(rows[1]?.answer).toBe('não encontrado em nenhuma mensagem');
  });

  it('reads every probe’s answer function with its own shape', () => {
    const rows = spikeRows({
      hookMessage: { location: { type: 'system', subtype: 'informational' } },
      fallbackModel: { answer: 'não provocável' },
      rateLimit: { status: 'allowed' },
      apiRetry: [{ attempt: 1 }],
      conversationReset: { message: { new_conversation_id: 'new-1' }, sessionIdChanged: true },
      workerShutdown: { answer: 'não observável' },
      retraction: { answer: 'não provocável' },
      strayBlock: [['text']],
      compactChain: { boundary: { compact_metadata: { trigger: 'manual' } }, inHistory: true },
    });

    const byId = Object.fromEntries(rows.map((row) => [row.id, row.answer]));
    expect(byId['2']).toBe('system/informational');
    expect(byId['3']).toBe('não provocável');
    expect(byId['4']).toBe('{"status":"allowed"}');
    expect(byId['5']).toContain('1 mensagens');
    expect(byId['6']).toContain('mudou');
    expect(byId['7']).toBe('não observável');
    expect(byId['8']).toBe('não provocável');
    expect(byId['9']).toContain('text');
    expect(byId['10']).toContain('manual');
  });

  it('falls back to "nenhum subtipo de sistema" when includeSystemMessages added none', () => {
    const rows = spikeRows({
      systemMessages: { withoutCount: 1, withoutMs: 5, withCount: 1, withMs: 6, subtypes: [] },
    });
    expect(rows[0]?.answer).toContain('nenhum subtipo de sistema');
  });

  it('reads a found location with no subtype of its own as having none', () => {
    const rows = spikeRows({
      hookMessage: { location: { type: 'conversation_reset', subtype: null } },
    });
    expect(rows[0]?.answer).toBe('conversation_reset');
  });

  it('says 0 mensagens, with no "primeira", when api_retry never fired', () => {
    const rows = spikeRows({ apiRetry: [] });
    expect(rows[0]?.answer).toBe('0 mensagens');
  });

  it('says no conversation_reset was seen, and that the session_id did not change', () => {
    const none = spikeRows({ conversationReset: { message: null, sessionIdChanged: false } });
    expect(none[0]?.answer).toBe('nenhum conversation_reset visto');

    const unchanged = spikeRows({
      conversationReset: { message: { new_conversation_id: 'new-1' }, sessionIdChanged: false },
    });
    expect(unchanged[0]?.answer).toContain('não mudou');
  });

  it('is empty when no probe ran', () => {
    expect(spikeRows({})).toEqual([]);
  });

  it('reports a probe that threw by its error, instead of crashing on a shape its row cannot read', () => {
    const rows = spikeRows({
      conversationReset: { error: 'ReferenceError: native binary failed to launch' },
    });

    expect(rows).toEqual([
      {
        id: '6',
        question: '/clear: conversation_reset e troca de session_id',
        decides: 'D-04',
        answer: 'FALHOU: ReferenceError: native binary failed to launch',
      },
    ]);
  });
});
