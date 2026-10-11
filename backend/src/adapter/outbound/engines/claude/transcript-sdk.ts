import {
  getSessionInfo,
  getSessionMessages,
  getSubagentMessages,
  listSessions,
  listSubagents,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  GetSubagentMessagesOptions,
  ListSessionsOptions,
  ListSubagentsOptions,
  SDKSessionInfo,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * The functions of the Agent SDK that read Claude's store of conversations — the conversation, and
 * the subagents it delegated to (plan 08, B-21).
 *
 * Behind an interface for the same reason as {@link import('./query.factory').QueryFactory}: so a
 * test hands the adapter a store built from runs captured of the real SDK, and nobody mocks a
 * module. They are the **only** way this backend reads a transcript — the JSONL they parse is
 * internal to Claude Code, and a parser of ours would break on the next release without a word
 * (docs/architecture/backend/03-modules.md#transcript).
 */
export interface TranscriptSdk {
  listSessions(options: ListSessionsOptions): Promise<SDKSessionInfo[]>;
  getSessionInfo(
    sessionId: string,
    options?: GetSessionInfoOptions,
  ): Promise<SDKSessionInfo | undefined>;
  getSessionMessages(
    sessionId: string,
    options?: GetSessionMessagesOptions,
  ): Promise<SessionMessage[]>;
  listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<string[]>;
  getSubagentMessages(
    sessionId: string,
    agentId: string,
    options?: GetSubagentMessagesOptions,
  ): Promise<SessionMessage[]>;
}

/** The Agent SDK itself. Reads `~/.claude/projects/` — or `CLAUDE_CONFIG_DIR`, when it is set. */
export const realTranscriptSdk: TranscriptSdk = {
  listSessions: (options) => listSessions(options),
  getSessionInfo: (sessionId, options) => getSessionInfo(sessionId, options),
  getSessionMessages: (sessionId, options) => getSessionMessages(sessionId, options),
  listSubagents: (sessionId, options) => listSubagents(sessionId, options),
  getSubagentMessages: (sessionId, agentId, options) =>
    getSubagentMessages(sessionId, agentId, options),
};

export const TRANSCRIPT_SDK = Symbol('TranscriptSdk');
