import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

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
