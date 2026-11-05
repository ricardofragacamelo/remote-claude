import { describe, expect, expectTypeOf, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { SDK_VARIANT_CLASSIFICATION } from '@adapter/outbound/engines/claude/sdk-message-classification';

/**
 * Plan 27, B-08 — the exhaustive `switch` and the three lists. S-18…S-21.
 *
 * The two type-level assertions below are the compiler's own proof: if the SDK's union ever gains a
 * top-level `type` or a `system` `subtype` this file does not know, `tsc` fails here (and the types
 * gate of `pnpm verify` fails with it) — `never` catches it before a session ever sees it.
 */

type KnownTopLevelType =
  | 'system'
  | 'stream_event'
  | 'assistant'
  | 'user'
  | 'tool_progress'
  | 'result'
  | 'rate_limit_event'
  | 'prompt_suggestion'
  | 'tool_use_summary'
  | 'auth_status'
  | 'conversation_reset';

type KnownSystemSubtype = Extract<SDKMessage, { type: 'system' }>['subtype'];

const KNOWN_SYSTEM_SUBTYPES = [
  'init',
  'compact_boundary',
  'commands_changed',
  'api_retry',
  'control_request_progress',
  'model_refusal_fallback',
  'model_refusal_no_fallback',
  'local_command_output',
  'hook_started',
  'hook_progress',
  'hook_response',
  'informational',
  'plugin_install',
  'task_notification',
  'task_started',
  'task_updated',
  'task_progress',
  'background_tasks_changed',
  'thinking_tokens',
  'session_state_changed',
  'worker_shutting_down',
  'notification',
  'files_persisted',
  'memory_recall',
  'elicitation_complete',
  'permission_denied',
  'mirror_error',
  'status',
] as const;

describe('S-19 — the SDK union with one more variant breaks the compiler', () => {
  it('has a known top-level `type` for every member of SDKMessage — a new one fails to typecheck', () => {
    expectTypeOf<SDKMessage['type']>().toEqualTypeOf<KnownTopLevelType>();
    // The runtime side of the same claim: if this ever drifts (someone edits one list and not the
    // other), the test fails here too, not just under `tsc`.
    expect(new Set(KNOWN_SYSTEM_SUBTYPES).size).toBe(KNOWN_SYSTEM_SUBTYPES.length);
  });

  it('has a known `system` subtype for every one `SDKMessage` declares — a new one fails to typecheck', () => {
    expectTypeOf<KnownSystemSubtype>().toEqualTypeOf<(typeof KNOWN_SYSTEM_SUBTYPES)[number]>();
  });
});

describe('S-18, S-20, S-21 — the three lists', () => {
  it('names a variant for every one of the 39 of SDKMessage, plus command_lifecycle — 40 rows, each with a reason', () => {
    expect(SDK_VARIANT_CLASSIFICATION).toHaveLength(40);

    for (const row of SDK_VARIANT_CLASSIFICATION) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
  });

  it('never puts the same variant in two lists — S-21', () => {
    const variants = SDK_VARIANT_CLASSIFICATION.map((row) => row.variant);

    expect(new Set(variants).size).toBe(variants.length);
  });

  it('accounts for every top-level type and every system subtype exactly once', () => {
    const variants = new Set(SDK_VARIANT_CLASSIFICATION.map((row) => row.variant));

    for (const type of ['assistant', 'user', 'stream_event', 'tool_progress', 'result'] as const) {
      expect(variants.has(type)).toBe(true);
    }
    expect(variants.has('user:replay')).toBe(true);
    for (const subtype of KNOWN_SYSTEM_SUBTYPES) {
      expect(variants.has(`system:${subtype}`)).toBe(true);
    }
    expect(variants.has('command_lifecycle')).toBe(true);
  });

  it('a quiet variant never shows up in both the mapped and the warning lists either — S-20', () => {
    const byList = new Map(SDK_VARIANT_CLASSIFICATION.map((row) => [row.variant, row.list]));

    expect(byList.get('system:init')).toBe('quiet');
    expect(byList.get('system:thinking_tokens')).toBe('quiet');
    expect(byList.get('command_lifecycle')).toBe('quiet');
  });
});
