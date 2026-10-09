import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Inject, Injectable } from '@nestjs/common';

import type { ModelCheck, ModelCheckOutcome, ModelCheckResult } from '@application/claude-config';
import { ClaudeUnavailableError } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { EphemeralClaude } from './ephemeral-claude';

/** The fixed, minimal prompt of the test — nothing of anybody's work goes to the model. */
export const MODEL_CHECK_PROMPT = 'Reply with the single word: ready. Use no tool.';

/** How long the whole turn may take — a model answering one word, plus a cold start. */
export const MODEL_CHECK_TIMEOUT_MS = 60_000;

/** The configuration of the test: its spending ceiling, from configuration, and its deadline. */
export interface ModelCheckSettings {
  readonly maxBudgetUsd: number;
  readonly cwd: string;
  readonly timeoutMs: number;
}

export const MODEL_CHECK_SETTINGS = Symbol('ModelCheckSettings');

/** How the CLI says an API call failed, on the assistant message (`SDKAssistantMessageError`). */
const RESULT_OF_ERROR: Readonly<Record<string, ModelCheckResult>> = {
  authentication_failed: 'notLoggedIn',
  oauth_org_not_allowed: 'notLoggedIn',
  verification_required: 'notLoggedIn',
  rate_limit: 'rateLimited',
};

type Turn = Omit<ModelCheckOutcome, 'at' | 'latencyMs'>;

/** What an assistant message says: the model that answered, and the API error it carries, if any. */
function foldAssistant(known: Turn, message: Extract<SDKMessage, { type: 'assistant' }>): Turn {
  const error = message.error;
  return {
    ...known,
    model: message.message.model ?? known.model,
    ...(error === undefined ? {} : { result: RESULT_OF_ERROR[error] ?? 'failed', reason: error }),
  };
}

/** What the result says: the cost, and a failure when nothing before named one. */
function foldResult(known: Turn, message: Extract<SDKMessage, { type: 'result' }>): Turn {
  const failed = message.subtype !== 'success' || message.is_error;
  return {
    ...known,
    costUsd: message.total_cost_usd,
    result: failed && known.result === 'ok' ? 'failed' : known.result,
    reason: failed ? (known.reason ?? message.subtype) : known.reason,
  };
}

/** What one message of the turn says about the outcome, folded into what was known before. */
function fold(known: Turn, message: SDKMessage): Turn {
  if (message.type === 'assistant') return foldAssistant(known, message);
  if (message.type === 'result') return foldResult(known, message);
  return known;
}

/**
 * The test of the connection to the model (plan 13, B-12, D-08): one turn, a fixed minimal prompt,
 * no tool, `maxTurns: 1`, a spending ceiling from configuration. What it finds — `ok`,
 * `notLoggedIn`, `rateLimited`, `failed` — is data of the answer; a CLI that died is
 * `CLAUDE_UNAVAILABLE`, and one that did not answer in time `CLAUDE_TIMEOUT`, with its subprocess
 * ended (S-31, S-32). It takes a slot of the capacity while it runs, and writes no transcript.
 */
@Injectable()
export class AgentSdkModelCheck implements ModelCheck {
  constructor(
    @Inject(EphemeralClaude) private readonly claude: EphemeralClaude,
    @Inject(MODEL_CHECK_SETTINGS) private readonly settings: ModelCheckSettings,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async run(model: string | null): Promise<Omit<ModelCheckOutcome, 'at'>> {
    const startedAt = Date.now();
    const turn = await this.claude.ask(
      {
        cwd: this.settings.cwd,
        prompt: MODEL_CHECK_PROMPT,
        model,
        maxTurns: 1,
        maxBudgetUsd: this.settings.maxBudgetUsd,
        op: 'claude.modelCheck',
        subject: 'model-check',
        what: 'answer the test',
        timeoutMs: this.settings.timeoutMs,
      },
      (query) => consume(query),
    );
    const outcome = { ...turn, latencyMs: Date.now() - startedAt };

    this.logger.debug(
      { op: 'claude.modelCheck', layer: 'adapter', ...outcome },
      'the test of the connection ran',
    );
    return outcome;
  }
}

/** Reads the turn to its `result`; a stream that ends without one is a CLI that died. */
async function consume(query: AsyncIterable<SDKMessage>): Promise<Turn> {
  let turn: Turn = { result: 'ok', model: null, costUsd: null, reason: null };

  for await (const message of query) {
    turn = fold(turn, message);
    if (message.type === 'result') {
      return turn;
    }
  }

  throw new ClaudeUnavailableError('model-check');
}
