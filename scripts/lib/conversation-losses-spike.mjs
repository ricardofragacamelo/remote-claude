/**
 * The pure half of the B-01 spike of plan 27 — what the messages and the history of a real Claude
 * session say about the ten questions of the D-05
 * (docs/plans/27-conversation-losses/F0-spike.md#b-01-).
 *
 * Nothing here talks to Claude: the entry point (`scripts/conversation-losses-spike.mjs`) runs the
 * sessions and hands their messages to these functions, which is what lets them be tested.
 */

/** The text the project's own `PreToolUse` hook answers with, through `.claude/settings.json`. */
export const HOOK_SYSTEM_MESSAGE = 'plan-27-hook-system-message';

/** The prompt that makes the main session's first turn call a tool, under both hooks. */
export const TOOL_PROMPT = 'Run `ls` with the Bash tool, then reply with exactly: done.';

/**
 * The project's `.claude/settings.json`: a `PreToolUse` hook that answers with a `systemMessage` —
 * through the settings file a project ships, never through the product's own `PreToolUse` callback,
 * which `spikeSession` already wires. Probe 2 is exactly the question of where this text surfaces.
 *
 * @returns {Record<string, string>} relative path → content
 */
export function repositoryFiles() {
  // Single-quoted for the shell the hook command runs under, so the JSON `JSON.stringify` prints —
  // all double quotes — survives: a double-quoted `-e` argument would have the shell swallow them,
  // the quoting bug the B-01 run itself caught (the hook then printed unquoted JSON and errored).
  const script = `console.log(JSON.stringify({systemMessage:"${HOOK_SYSTEM_MESSAGE}"}))`;
  return {
    '.claude/settings.json': `${JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            { matcher: '*', hooks: [{ type: 'command', command: `node -e '${script}'` }] },
          ],
        },
      },
      null,
      2,
    )}\n`,
  };
}

/** Every `type: 'system'` subtype a list of messages carries, in first-seen order. @param {readonly any[]} messages */
export function systemSubtypes(messages) {
  const seen = new Set();
  for (const message of messages) {
    if (message?.type === 'system' && typeof message.subtype === 'string') {
      seen.add(message.subtype);
    }
  }
  return [...seen];
}

/**
 * Where a hook's `systemMessage` turns up, if anywhere — found by the marker text itself, since the
 * probe exists to find the field, not to assume one of `hook_response` or `informational` carries it.
 * A `hook_response` echoes the hook's raw stdout (the marker turns up there too, serialised inside
 * `output`/`stdout`) — not the field itself, so the `informational` message the CLI builds from it is
 * reported first when both carry the marker.
 *
 * @param {readonly any[]} messages @param {string} marker
 */
export function hookSystemMessageLocation(messages, marker) {
  const carries = (/** @type {any} */ message) => JSON.stringify(message).includes(marker);
  const carrier =
    messages.find((message) => message?.subtype === 'informational' && carries(message)) ??
    messages.find(carries);
  return carrier === undefined ? null : { type: carrier.type, subtype: carrier.subtype ?? null };
}

/**
 * The `rate_limit_event` a session saw, if any — the account may not be a claude.ai subscription, in
 * which case none ever arrives, and that absence is itself the measurement.
 *
 * @param {readonly any[]} messages
 */
export function rateLimitShape(messages) {
  const event = messages.find((message) => message?.type === 'rate_limit_event');
  return event === undefined ? null : event.rate_limit_info;
}

/**
 * Every `api_retry` message a session saw — expected only when the API is unreachable, since a
 * healthy call never retries.
 *
 * @param {readonly any[]} messages
 */
export function apiRetryMessages(messages) {
  return messages.filter(
    (message) => message?.type === 'system' && message.subtype === 'api_retry',
  );
}

/** The `conversation_reset` message after a `/clear`, if the CLI sent one. @param {readonly any[]} messages */
export function conversationResetMessage(messages) {
  return messages.find((message) => message?.type === 'conversation_reset') ?? null;
}

/** The `compact_boundary` message of a `/compact`, if the CLI sent one. @param {readonly any[]} messages */
export function compactBoundaryMessage(messages) {
  return messages.find((message) => message?.subtype === 'compact_boundary') ?? null;
}

/**
 * Every block type that rode alongside a `tool_result` inside the same `user` message — the stray
 * block probe 9 asks about. An ordinary turn carries only the one `tool_result`; anything else found
 * beside it is the finding.
 *
 * @param {readonly any[]} messages
 */
export function strayBlocksBesideToolResult(messages) {
  const found = [];
  for (const message of messages) {
    const content = message?.type === 'user' ? message.message?.content : undefined;
    if (!Array.isArray(content) || !content.some((block) => block?.type === 'tool_result')) {
      continue;
    }
    const others = content
      .filter((block) => block?.type !== 'tool_result')
      .map((block) => block.type);
    if (others.length > 0) {
      found.push(others);
    }
  }
  return found;
}

/** One row of the report, per probe name — the question, what decides it, and how to read the result. */
const ROWS = {
  systemMessages: {
    id: '1',
    question: 'includeSystemMessages: subtipos e custo',
    decides: 'D-05, R-03',
    /** @param {any} r */
    answer: (r) =>
      `sem a opção: ${String(r.withoutCount)} msgs em ${String(r.withoutMs)}ms; com: ` +
      `${String(r.withCount)} msgs (${r.subtypes.join(', ') || 'nenhum subtipo de sistema'}) em ` +
      `${String(r.withMs)}ms`,
  },
  hookMessage: {
    id: '2',
    question: 'onde chega o systemMessage de um hook de settings',
    decides: 'D-04',
    /** @param {{ location: { type: string, subtype: string | null } | null }} r */
    answer: (r) =>
      r.location === null
        ? 'não encontrado em nenhuma mensagem'
        : `${r.location.type}${r.location.subtype === null ? '' : `/${r.location.subtype}`}`,
  },
  fallbackModel: {
    id: '3',
    question: 'troca de modelo por sobrecarga: aviso próprio?',
    decides: 'D-04',
    /** @param {{ answer: string }} r */
    answer: (r) => r.answer,
  },
  rateLimit: {
    id: '4',
    question: 'campos do rate_limit_info observados',
    decides: 'D-04',
    /** @param {unknown} r */
    answer: (r) => (r === null ? 'nenhum rate_limit_event nesta conta/sessão' : JSON.stringify(r)),
  },
  apiRetry: {
    id: '5',
    question: 'volume do api_retry sob falha de conexão forçada',
    decides: 'D-04',
    /** @param {any[]} r */
    answer: (r) =>
      `${String(r.length)} mensagens` +
      (r[0] === undefined ? '' : `; primeira: ${JSON.stringify(r[0])}`),
  },
  conversationReset: {
    id: '6',
    question: '/clear: conversation_reset e troca de session_id',
    decides: 'D-04',
    /** @param {{ message: any, sessionIdChanged: boolean }} r */
    answer: (r) =>
      r.message === null
        ? 'nenhum conversation_reset visto'
        : `visto; session_id ${r.sessionIdChanged ? 'mudou' : 'não mudou'}; ` +
          `new_conversation_id=${String(r.message.new_conversation_id)}`,
  },
  workerShutdown: {
    id: '7',
    question: 'worker_shutting_down frente ao session.closed',
    decides: 'D-04',
    /** @param {{ answer: string }} r */
    answer: (r) => r.answer,
  },
  retraction: {
    id: '8',
    question: 'uuid da retirada bate com blockId/messageId',
    decides: 'D-06',
    /** @param {{ answer: string }} r */
    answer: (r) => r.answer,
  },
  strayBlock: {
    id: '9',
    question: 'bloco que não é tool_result numa mensagem de tool_result',
    decides: 'discovery §5',
    /** @param {unknown[]} r */
    answer: (r) => (r.length === 0 ? 'nenhum visto' : JSON.stringify(r)),
  },
  compactChain: {
    id: '10',
    question: 'onde ficam o compact_boundary e o resumo após /compact',
    decides: 'D-05',
    /** @param {{ boundary: any, inHistory: boolean }} r */
    answer: (r) =>
      r.boundary === null
        ? 'nenhum compact_boundary visto'
        : `compact_boundary visto (trigger=${String(r.boundary.compact_metadata?.trigger)}); ` +
          `no histórico: ${r.inHistory ? 'presente' : 'ausente'}`,
  },
};

/** Whether a probe's result is `runProbes`' own failure shape, rather than that probe's own answer. @param {unknown} result */
function isProbeFailure(result) {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (/** @type {any} */ (result).error) === 'string'
  );
}

/**
 * The report's rows, one per probe that ran — a name given on the command line excludes the rest. A
 * probe that threw reports its error as the answer, rather than crashing the whole report on a shape
 * its row was never built to read.
 *
 * @param {Record<string, any>} results
 */
export function spikeRows(results) {
  return Object.entries(ROWS)
    .filter(([name]) => results[name] !== undefined)
    .map(([name, row]) => ({
      id: row.id,
      question: row.question,
      decides: row.decides,
      answer: isProbeFailure(results[name])
        ? `FALHOU: ${results[name].error}`
        : row.answer(results[name]),
    }));
}
