import type { PermissionMode } from './permission-mode.value-object';
import { EngineCapabilityUnavailableError } from '../errors/engine-capability-unavailable.error';

/**
 * What an engine can do, declared and never supposed (ADR-025): the client hides what the engine of
 * its session does not have, and the core refuses to ask for it.
 *
 * Only what the product uses today, and each one passes the rule of plan 27 · D-10 — it makes sense
 * for more than one engine, or it is generic: Codex resumes and forks, Copilot asks questions
 * and keeps a task list, every agent of the ACP has a mode of permission. Per session, not only per
 * engine: the version of the CLI or the model can change what holds, so a session announces its own
 * in `session.started`, and `GET /engines` the engine's.
 */
export interface EngineCapabilities {
  /** A conversation can be continued where it stopped. */
  readonly resume: boolean;
  /** A conversation can be forked: at a message (edit-and-resend), whole, or not at all. */
  readonly fork: 'atMessage' | 'whole' | 'none';
  /** The conversations of a folder can be listed and read back. */
  readonly history: boolean;
  /** A prompt can carry images. */
  readonly images: boolean;
  /** A prompt sent while a turn runs is queued by the engine. */
  readonly promptWhileBusy: boolean;
  /** The agent asks the person a structured question (plan 24). */
  readonly questions: boolean;
  /** The agent asks for a plan to be approved before it acts. */
  readonly planApproval: boolean;
  /** The agent keeps a list of tasks the person can follow. */
  readonly taskList: boolean;
  /** The agent delegates to subagents, whose work nests under the call. */
  readonly subagents: boolean;
  /** The agent's reasoning streams as its own block. */
  readonly thinking: boolean;
  /** The installation offers commands the composer lists (`/…`). */
  readonly slashCommands: boolean;
  /** The model can be switched while the session lives. */
  readonly modelSwitch: boolean;
  /** The levels of effort the engine takes — empty when it takes none. */
  readonly effortLevels: readonly string[];
  /** The use of the context window can be asked, by category. */
  readonly contextUse: boolean;
  /** MCP servers can be given to the session and their status read. */
  readonly mcp: boolean;
  /** The conversation can be compacted on request. */
  readonly compaction: boolean;
  /** What a turn costs is reported, and in which unit. */
  readonly cost: 'usd' | 'none';
  /** The modes of permission the engine runs in. */
  readonly permissionModes: readonly PermissionMode[];
}

/** The name of one capability. */
export type EngineCapability = keyof EngineCapabilities;

/** Whether [capabilities] has [capability]: `true`, a fork, an effort or a unit that is not none. */
export function hasCapability(
  capabilities: EngineCapabilities,
  capability: EngineCapability,
): boolean {
  const value = capabilities[capability];
  if (typeof value === 'boolean') {
    return value;
  }
  return Array.isArray(value) ? value.length > 0 : value !== 'none';
}

/**
 * Refuses, by a domain error, what the engine does not have — never an `undefined` that leaks.
 *
 * @throws {EngineCapabilityUnavailableError}
 */
export function requireCapability(
  engine: string,
  capabilities: EngineCapabilities,
  capability: EngineCapability,
): void {
  if (!hasCapability(capabilities, capability)) {
    throw new EngineCapabilityUnavailableError(engine, capability);
  }
}
