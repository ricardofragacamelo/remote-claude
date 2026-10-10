/**
 * The pure half of the B-01 spike of plan 26 — what the throwaway repository holds, and what the
 * messages of the real Claude say about the shapes the app's conversation rests on
 * (docs/plans/26-mobile-conversation-parity/F0-spike.md#b-01).
 *
 * Three probes, each a shape the fixtures of the plan assume and the `smoke-live` checks again on
 * every version of the CLI (B-31):
 *
 * - `subagent` — a subagent of the project writes a file, asking for it: everything it says carries
 *   `parent_tool_use_id`, live and in its history, and `canUseTool` knows it is the subagent's;
 * - `mcp` — a tool of an MCP server called with no title: the name the CLI gives it;
 * - `blocks` — an answer with text, a tool and more text: how many text blocks, and under which ids.
 *
 * Nothing here talks to Claude: the entry point (`scripts/conversation-parity-spike.mjs`) runs the
 * sessions and hands their messages to these functions, which is what lets them be tested.
 */

/** The project subagent the `subagent` probe delegates to. */
export const WRITER_AGENT = 'writer';

/** The file the subagent is asked to write. */
export const WRITTEN_FILE = 'from-subagent.txt';

/** The MCP server and tool the `mcp` probe calls — the fixture server of plan 13 (D-19). */
export const MCP_SERVER = 'fixture';
export const MCP_TOOL = 'echo';

/** The prompts, one per probe. */
export const PROMPTS = Object.freeze({
  subagent:
    `Use the Agent tool with the ${WRITER_AGENT} subagent, not in the background, to create the ` +
    `file ${WRITTEN_FILE} containing the single word parity. Do not write it yourself. Then ` +
    'repeat what the subagent reported, in one line.',
  mcp:
    `Call the ${MCP_TOOL} tool of the ${MCP_SERVER} MCP server with the text parity. Then reply ` +
    'with exactly what it returned, and nothing else.',
  blocks:
    'First write one short sentence saying you will list the folder. Then run `ls` with the Bash ' +
    'tool. Then write one short sentence saying you are done. Write the sentences as text, not in ' +
    'the command.',
});

/**
 * The throwaway repository: a subagent of the project that writes, and a note to read.
 *
 * @returns {Record<string, string>} relative path → content
 */
export function repositoryFiles() {
  return {
    [`.claude/agents/${WRITER_AGENT}.md`]: [
      '---',
      `name: ${WRITER_AGENT}`,
      'description: Writes exactly one file it is told to write. Use it whenever the main agent delegates a write.',
      'tools: Write, Read',
      '---',
      '',
      'Before writing, say in one short sentence what you are about to do. Then write exactly the',
      'file you were asked for, with the Write tool. Then report the path you wrote, in one line.',
      '',
    ].join('\n'),
    'notes.md': 'A throwaway repository of the conversation-parity spike.\n',
  };
}

/** The blocks of a message, or none. @param {any} message @returns {any[]} */
function blocksOf(message) {
  const content = message?.message?.content;
  return Array.isArray(content) ? content : [];
}

/** How many of each kind of block. @param {any[]} blocks @returns {Record<string, number>} */
function kindsOf(blocks) {
  /** @type {Record<string, number>} */
  const kinds = {};
  for (const block of blocks) {
    const kind = String(block?.type ?? 'unknown');
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return kinds;
}

/** The id of the first call of a tool named [name] in [messages], or `null`. */
function callOf(/** @type {any[]} */ messages, /** @type {(name: string) => boolean} */ named) {
  for (const message of messages) {
    for (const block of blocksOf(message)) {
      if (block.type === 'tool_use' && named(String(block.name))) {
        return block;
      }
    }
  }
  return null;
}

/** The kind of a stream message, with its subtype when it has one. @param {any} message */
function kindOfMessage(message) {
  return message.subtype === undefined
    ? String(message.type)
    : `${message.type}:${message.subtype}`;
}

/**
 * A call of the subagent somebody was asked about: whether `canUseTool` named it by the subagent's own
 * call, and named the subagent — `null` when nobody was asked.
 *
 * @param {{ toolUseId: string | null, agentId: string | null } | undefined} call
 * @param {Set<unknown>} ownedCalls the ids of the calls the subagent made
 */
function permissionOf(call, ownedCalls) {
  return call === undefined
    ? null
    : {
        toolUseIdIsTheSubagents: call.toolUseId !== null && ownedCalls.has(call.toolUseId),
        agentId: call.agentId !== null,
      };
}

/**
 * What a subagent's stream said, against the `Agent` call that opened it — the shape plan 26 F5
 * nests in the app (S-05).
 *
 * @param {any[]} messages everything the stream gave, in order
 * @param {{ canUseTool: { toolName: string, toolUseId: string | null, agentId: string | null }[] }} seen
 */
export function subagentShape(messages, seen) {
  const agent = callOf(messages, (name) => name === 'Agent' || name === 'Task');
  const parent = agent?.id ?? null;
  const owned = messages.filter(
    (message) => parent !== null && message.parent_tool_use_id === parent,
  );
  const ownedBlocks = owned.flatMap(blocksOf);
  const ownedCalls = new Set(
    ownedBlocks.filter((block) => block.type === 'tool_use').map((block) => block.id),
  );
  const write = seen.canUseTool.find((call) => call.toolName === 'Write');

  return {
    agentTool: agent?.name ?? null,
    subagentType: agent?.input?.subagent_type ?? null,
    messages: owned.length,
    byKind: kindsOf(owned.map((message) => ({ type: kindOfMessage(message) }))),
    blocks: kindsOf(ownedBlocks),
    streamEvents: owned.filter((message) => message.type === 'stream_event').length,
    toolProgress: messages
      .filter((message) => message.type === 'tool_progress')
      .map((message) => ({
        tool: message.tool_name,
        parent: message.parent_tool_use_id === parent ? 'agent' : message.parent_tool_use_id,
      })),
    tools: ownedBlocks.filter((block) => block.type === 'tool_use').map((block) => block.name),
    permission: permissionOf(write, ownedCalls),
    // Every tool the subagent called is announced under it — none of them in the main chain.
    toolsOutsideIt: messages
      .filter((message) => message.parent_tool_use_id == null)
      .flatMap(blocksOf)
      .filter((block) => block.type === 'tool_use' && block.name === 'Write').length,
  };
}

/**
 * What the history says of the same conversation: the main chain, and the subagent's own, read the
 * way the backend reads it — every subagent of the conversation, the one whose messages name the
 * `Agent` call (plan 08, B-21).
 *
 * @param {any[]} main what `getSessionMessages` gave
 * @param {any[][]} subagents what `getSubagentMessages` gave for each of `listSubagents`
 * @param {string | null} parent the id of the `Agent` call
 */
export function subagentHistoryShape(main, subagents, parent) {
  const own = subagents.find((messages) =>
    messages.some((message) => message.parent_tool_use_id === parent),
  );

  return {
    mainWithParent: main.filter((message) => message.parent_tool_use_id != null).length,
    subagents: subagents.length,
    found: own !== undefined,
    messages: own?.length ?? 0,
    withParent: (own ?? []).filter((message) => message.parent_tool_use_id === parent).length,
    blocks: kindsOf((own ?? []).flatMap(blocksOf)),
  };
}

/**
 * What the CLI calls a tool of an MCP server, and whether the call carries a title — the label the
 * app has to make of it (S-48).
 *
 * @param {any[]} messages
 * @param {{ canUseTool: { toolName: string }[] }} seen
 */
export function mcpShape(messages, seen) {
  const call = callOf(messages, (name) => name.startsWith('mcp__'));
  const input = call?.input ?? {};

  return {
    toolName: call?.name ?? null,
    inputKeys: Object.keys(input).sort(),
    hasDescription: typeof input.description === 'string',
    askedAs: seen.canUseTool.find((each) => each.toolName.startsWith('mcp__'))?.toolName ?? null,
  };
}

/**
 * How an answer of text, a tool and text again reaches the client: each block in a message of its
 * own, all under one `message.id` or not, and how many text blocks there were (S-27).
 *
 * @param {any[]} messages
 */
export function blocksShape(messages) {
  const assistant = messages.filter((message) => message.type === 'assistant');
  /** @type {Map<string, string[]>} */
  const byId = new Map();

  for (const message of assistant) {
    const id = String(message.message?.id ?? '');
    byId.set(id, [...(byId.get(id) ?? []), ...blocksOf(message).map((block) => block.type)]);
  }

  return {
    assistantMessages: assistant.length,
    blocksPerMessage: assistant.map((message) => blocksOf(message).length),
    ids: [...byId.values()],
    textBlocks: assistant.flatMap(blocksOf).filter((block) => block.type === 'text').length,
  };
}

/** Joined, or `—` for none. @param {unknown[]} values */
const listed = (values) => (values.length === 0 ? '—' : values.join(', '));

/** @param {Record<string, number>} kinds */
const counted = (kinds) =>
  listed(
    Object.entries(kinds)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, count]) => `${kind} ×${String(count)}`),
  );

/**
 * The rows of the report, from the raw results of the probes that ran — a probe that did not run,
 * or failed, has no row.
 *
 * @param {Record<string, any>} results
 * @returns {{ id: string, question: string, answer: string, decides: string }[]}
 */
export function spikeRows(results) {
  /** @type {{ id: string, question: string, answer: string, decides: string }[]} */
  const rows = [];
  const ran = (/** @type {string} */ name) =>
    results[name] !== undefined && results[name].error === undefined;

  if (ran('subagent')) {
    const { live, history } = results['subagent'];
    rows.push({
      id: '1',
      question: 'subagent de projeto com Write que pede permissão — ao vivo',
      answer:
        `${String(live.agentTool)} (${String(live.subagentType)}): ${String(live.messages)} mensagens com parent_tool_use_id ` +
        `(${counted(live.byKind)}); blocos ${counted(live.blocks)}; ${String(live.streamEvents)} stream_event; ` +
        `tools ${listed(live.tools)}; tool_progress ${listed(live.toolProgress.map((/** @type {any} */ each) => `${String(each.tool)}→${String(each.parent)}`))}; ` +
        `canUseTool do Write: ${live.permission === null ? 'não chamado' : `toolUseID do subagent ${String(live.permission.toolUseIdIsTheSubagents)}, agentID ${String(live.permission.agentId)}`}`,
      decides: 'B-18: o mapper do app guarda o dono; B-21: a permissão sabe de quem é',
    });
    rows.push({
      id: '2',
      question: 'o mesmo subagent pelo histórico',
      answer:
        `cadeia principal com parent_tool_use_id: ${String(history.mainWithParent)}; ` +
        `${String(history.subagents)} subagent(s) listados, o do Agent ${history.found ? 'achado' : 'não achado'} ` +
        `com ${String(history.messages)} mensagens (${String(history.withParent)} com o parent); blocos ${counted(history.blocks)}`,
      decides: 'B-20: o app lê a rota de subagents ao abrir o card',
    });
  }

  if (ran('mcp')) {
    const mcp = results['mcp'];
    rows.push({
      id: '3',
      question: 'nome de tool MCP chamada sem título',
      answer: `${String(mcp.toolName)}; entrada ${listed(mcp.inputKeys)}; description ${mcp.hasDescription ? 'presente' : 'ausente'}; canUseTool como ${String(mcp.askedAs)}`,
      decides: 'B-13: o rótulo `servidor · tool` sem título',
    });
  }

  if (ran('blocks')) {
    const blocks = results['blocks'];
    rows.push({
      id: '4',
      question: 'texto, tool e texto numa resposta',
      answer: `${String(blocks.assistantMessages)} mensagens assistant, blocos por mensagem ${listed(blocks.blocksPerMessage)}; por message.id ${listed(blocks.ids.map((/** @type {string[]} */ kinds) => `[${kinds.join(' ')}]`))}; ${String(blocks.textBlocks)} blocos de texto`,
      decides: 'B-09: a mensagem do app guarda os blocos em ordem',
    });
  }

  return rows;
}
