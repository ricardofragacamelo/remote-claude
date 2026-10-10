import { describe, expect, it } from 'vitest';

import {
  blocksShape,
  mcpShape,
  PROMPTS,
  repositoryFiles,
  spikeRows,
  subagentHistoryShape,
  subagentShape,
  WRITER_AGENT,
} from '../../../scripts/lib/conversation-parity-spike.mjs';

/** A message of the stream with these blocks. */
const said = (/** @type {any[]} */ content, /** @type {Record<string, unknown>} */ extra = {}) => ({
  type: 'assistant',
  message: { id: 'msg_1', content },
  parent_tool_use_id: null,
  ...extra,
});

const AGENT_CALL = {
  type: 'tool_use',
  id: 'toolu_agent',
  name: 'Agent',
  input: { subagent_type: 'writer' },
};
const WRITE_CALL = { type: 'tool_use', id: 'toolu_write', name: 'Write', input: {} };

/** A subagent that thinks, says, writes and reports — what the real one did (S-05). */
const SUBAGENT_STREAM = [
  said([AGENT_CALL]),
  said([{ type: 'thinking', thinking: 'about to write' }], { parent_tool_use_id: 'toolu_agent' }),
  said([{ type: 'text', text: 'I will write it.' }], { parent_tool_use_id: 'toolu_agent' }),
  said([WRITE_CALL], { parent_tool_use_id: 'toolu_agent' }),
  {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_write' }] },
    parent_tool_use_id: 'toolu_agent',
  },
  { type: 'tool_progress', tool_name: 'Agent', parent_tool_use_id: null },
  { type: 'tool_progress', tool_name: 'Write', parent_tool_use_id: 'toolu_agent' },
  { type: 'system', subtype: 'task_started', parent_tool_use_id: 'toolu_agent' },
  { type: 'result' },
];

describe('the conversation-parity spike — plan 26, B-01', () => {
  it('seeds a project subagent that writes, and asks for it by name', () => {
    const files = repositoryFiles();
    const agent = files[`.claude/agents/${WRITER_AGENT}.md`] ?? '';

    expect(agent).toContain(`name: ${WRITER_AGENT}`);
    expect(agent).toContain('tools: Write, Read');
    expect(PROMPTS.subagent).toContain(WRITER_AGENT);
    expect(PROMPTS.mcp).toContain('echo');
  });

  it('reads what the subagent said under the Agent call, and whose call was asked about', () => {
    const shape = subagentShape(SUBAGENT_STREAM, {
      canUseTool: [{ toolName: 'Write', toolUseId: 'toolu_write', agentId: 'agent_1' }],
    });

    expect(shape).toEqual({
      agentTool: 'Agent',
      subagentType: 'writer',
      messages: 6,
      byKind: { assistant: 3, user: 1, tool_progress: 1, 'system:task_started': 1 },
      blocks: { thinking: 1, text: 1, tool_use: 1, tool_result: 1 },
      streamEvents: 0,
      toolProgress: [
        { tool: 'Agent', parent: null },
        { tool: 'Write', parent: 'agent' },
      ],
      tools: ['Write'],
      permission: { toolUseIdIsTheSubagents: true, agentId: true },
      toolsOutsideIt: 0,
    });
  });

  it('says so when nobody was asked, or the ask named another call and no subagent', () => {
    expect(subagentShape(SUBAGENT_STREAM, { canUseTool: [] }).permission).toBeNull();
    expect(
      subagentShape(SUBAGENT_STREAM, {
        canUseTool: [{ toolName: 'Write', toolUseId: null, agentId: null }],
      }).permission,
    ).toEqual({ toolUseIdIsTheSubagents: false, agentId: false });
  });

  it('finds no subagent in a stream without an Agent call, and counts a write left in the main chain', () => {
    const shape = subagentShape(
      [said([WRITE_CALL]), { type: 'result' }, said(/** @type {any} */ ('not blocks'))],
      {
        canUseTool: [],
      },
    );

    expect(shape.agentTool).toBeNull();
    expect(shape.subagentType).toBeNull();
    expect(shape.messages).toBe(0);
    expect(shape.toolsOutsideIt).toBe(1);
  });

  it('reads a block of no type as unknown', () => {
    const shape = subagentShape(
      [said([AGENT_CALL]), said([{}], { parent_tool_use_id: 'toolu_agent' })],
      {
        canUseTool: [],
      },
    );

    expect(shape.blocks).toEqual({ unknown: 1 });
  });

  it('finds the subagent of the Agent call in the history, the way the backend does', () => {
    const own = [
      { parent_tool_use_id: 'toolu_agent', message: { content: [{ type: 'text' }] } },
      { parent_tool_use_id: 'toolu_agent', message: { content: 'a string prompt' } },
    ];
    const other = [{ parent_tool_use_id: 'toolu_other', message: { content: [] } }];

    expect(
      subagentHistoryShape([{ parent_tool_use_id: null }], [other, own], 'toolu_agent'),
    ).toEqual({
      mainWithParent: 0,
      subagents: 2,
      found: true,
      messages: 2,
      withParent: 2,
      blocks: { text: 1 },
    });
    expect(subagentHistoryShape([], [other], 'toolu_agent')).toEqual({
      mainWithParent: 0,
      subagents: 1,
      found: false,
      messages: 0,
      withParent: 0,
      blocks: {},
    });
  });

  it('reads the name of an MCP tool and whether its call had a title', () => {
    const call = {
      type: 'tool_use',
      id: 't',
      name: 'mcp__fixture__echo',
      input: { text: 'parity' },
    };

    expect(mcpShape([said([call])], { canUseTool: [{ toolName: 'mcp__fixture__echo' }] })).toEqual({
      toolName: 'mcp__fixture__echo',
      inputKeys: ['text'],
      hasDescription: false,
      askedAs: 'mcp__fixture__echo',
    });
    expect(mcpShape([], { canUseTool: [] })).toEqual({
      toolName: null,
      inputKeys: [],
      hasDescription: false,
      askedAs: null,
    });
    expect(
      mcpShape([said([{ ...call, input: { description: 'echo it' } }])], { canUseTool: [] })
        .hasDescription,
    ).toBe(true);
  });

  it('groups the blocks of an answer by the message they were finished under', () => {
    const stream = [
      said([{ type: 'text' }]),
      said([{ type: 'tool_use' }]),
      { type: 'user', message: { content: [] } },
      { ...said([{ type: 'text' }]), message: { id: 'msg_2', content: [{ type: 'text' }] } },
      { type: 'assistant', message: { content: [] } },
    ];

    expect(blocksShape(stream)).toEqual({
      assistantMessages: 4,
      blocksPerMessage: [1, 1, 1, 0],
      ids: [['text', 'tool_use'], ['text'], []],
      textBlocks: 2,
    });
  });

  it('writes one row per measurement of the probes that ran', () => {
    const live = subagentShape(SUBAGENT_STREAM, {
      canUseTool: [{ toolName: 'Write', toolUseId: 'toolu_write', agentId: 'agent_1' }],
    });
    const rows = spikeRows({
      subagent: { live, history: subagentHistoryShape([], [], 'toolu_agent') },
      mcp: mcpShape([], { canUseTool: [] }),
      blocks: blocksShape([]),
    });

    expect(rows.map((row) => row.id)).toEqual(['1', '2', '3', '4']);
    expect(rows[0]?.answer).toContain('Agent (writer): 6 mensagens');
    expect(rows[0]?.answer).toContain('Write→agent');
    expect(rows[1]?.answer).toContain('não achado');
    expect(rows[2]?.answer).toContain('description ausente');
    expect(rows[3]?.answer).toContain('0 blocos de texto');
  });

  it('says what it measured when nothing was asked or found', () => {
    const live = subagentShape([], { canUseTool: [] });
    const [first, second] = spikeRows({
      subagent: {
        live,
        history: subagentHistoryShape([], [[{ parent_tool_use_id: 'x', message: {} }]], 'x'),
      },
      mcp: { error: 'the probe failed' },
    });

    expect(first?.answer).toContain('canUseTool do Write: não chamado');
    expect(first?.answer).toContain('tools —');
    expect(second?.answer).toContain('achado com 1 mensagens');
    expect(spikeRows({ mcp: { error: 'x' } })).toEqual([]);
    expect(
      spikeRows({
        mcp: { toolName: 'mcp__a__b', inputKeys: [], hasDescription: true, askedAs: null },
      })[0]?.answer,
    ).toContain('description presente');
  });
});
