import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  AccountInfo,
  AgentInfo,
  McpServerStatus,
  SDKControlInitializeResponse,
  ModelInfo,
  SDKControlGetContextUsageResponse,
  SDKMessage,
  SessionMessage,
  SlashCommand,
} from '@anthropic-ai/claude-agent-sdk';

/** One recorded run of the real Agent SDK. */
export interface AgentSdkFixture {
  readonly name: string;
  readonly why: string;
  readonly prompt: string;
  readonly recordedAt: string;
  readonly sdkVersion: string;
  readonly counts: {
    readonly messages: number;
    readonly preToolUse: number;
    readonly canUseTool: number;
  };
  /** Every tool the `PreToolUse` hook fired for, in order. */
  readonly preToolUse: readonly { readonly toolName: string; readonly toolUseId?: string }[];
  /** The subset of those that `canUseTool` was consulted about. */
  readonly canUseTool: readonly { readonly toolName: string; readonly input: unknown }[];
  readonly stderr: readonly string[];
  /** What `getSessionMessages` read back of the run — present on the recordings that kept it. */
  readonly history?: readonly SessionMessage[];
  readonly messages: readonly SDKMessage[];
}

const DIRECTORY = path.join(import.meta.dirname, 'fixtures');

/**
 * A recorded run, by name.
 *
 * These files are **captured**, not written: `pnpm fixtures:record` runs the real SDK against a
 * throwaway workspace and saves what came back. A stream somebody typed from memory would make
 * the whole suite prove that the fake works, which is the risk this arrangement exists to close
 * ([D-04](../../../../docs/plans/01-live-session/decisions.md)).
 */
export function loadFixture(name: string): AgentSdkFixture {
  return JSON.parse(readFileSync(path.join(DIRECTORY, `${name}.json`), 'utf8')) as AgentSdkFixture;
}

/** What `supportedCommands()` answered on a real installation, dead and internal entries included. */
export interface CommandCatalogueFixture {
  readonly name: string;
  readonly recordedAt: string;
  readonly sdkVersion: string;
  readonly commands: readonly SlashCommand[];
}

/** The recorded catalogue — `pnpm fixtures:record commands`, which says nothing to the model. */
export function loadCommands(): CommandCatalogueFixture {
  return JSON.parse(
    readFileSync(path.join(DIRECTORY, 'commands.json'), 'utf8'),
  ) as CommandCatalogueFixture;
}

/** What the installation said about itself before a first prompt (plan 08, B-36…B-38). */
export interface InstallationFixture {
  readonly models: ModelInfo[];
  readonly mcpServers: McpServerStatus[];
  readonly contextUsage: SDKControlGetContextUsageResponse;
}

/** The recorded installation — `pnpm fixtures:record installation`, which says nothing to the model. */
export function loadInstallation(): InstallationFixture {
  return JSON.parse(
    readFileSync(path.join(DIRECTORY, 'installation.json'), 'utf8'),
  ) as InstallationFixture;
}

/** What the installation said at initialisation (plan 13, B-10) — the account replaced by an example. */
export interface InitializationFixture {
  readonly initialization: SDKControlInitializeResponse;
  readonly account: AccountInfo;
  readonly agents: AgentInfo[];
  readonly skills: SlashCommand[];
}

/** The recorded initialisation — `pnpm fixtures:record initialization`, which says nothing to the model. */
export function loadInitialization(): InitializationFixture {
  return JSON.parse(
    readFileSync(path.join(DIRECTORY, 'initialization.json'), 'utf8'),
  ) as InitializationFixture;
}
