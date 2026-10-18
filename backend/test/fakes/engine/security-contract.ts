import { SECURITY_CLAUSES } from '@application/session';
import type {
  EngineSecurityContract,
  SecurityAssertion,
  SecurityClause,
} from '@application/session';

/**
 * The one file that would change what this engine may do, if it ever read one — it reads none; this
 * exists only so `configSensitive` has something concrete to name, the same shape Claude's own
 * `.claude/settings.json` is (`CLAUDE_CONFIG_FILES`, plan 28, B-35).
 */
export const TEST_ENGINE_CONFIG_FILES = ['.test-engine/config.json'] as const;

/**
 * How the engine `test` keeps the security contract (plan 28, B-43; ADR-011).
 *
 * Claude's own contract (`security-contract.ts`) is elaborate because the SDK offers real footguns —
 * `allowDangerouslySkipPermissions`, a `settingSources` that loads a user's personal `allow` rules, an
 * environment that could leak a credential — and proving each clause means building the real options
 * object and running it through the guard that would catch a weakened one. This fake has none of
 * that surface: `TestEngineSession` (`test-engine-session.ts`) has exactly one way to run a tool —
 * `runToolStep` — and that path always awaits `SessionPermissionGate.ask()` and
 * `ToolInvocationRecorder.record()` first. There is no parameter, flag or branch that takes a
 * different one. So each clause holds structurally, by construction, and the comment on every one
 * below says what would have to change in this file for it to stop holding — exactly what
 * `test/unit/fakes/engine/test-engine-session.spec.ts` exercises behaviourally, the way
 * `session-runner.spec.ts` exercises Claude's own.
 */
const CHECKS: Readonly<Record<SecurityClause, () => boolean>> = {
  // `runToolStep` calls `permissions.ask()` for every one of the three native tools, unconditionally
  // — there is no "allow everything" switch this adapter understands, and nothing short-circuits it.
  blockingGate: () => true,
  // `runToolStep` calls `recorder.record()` before it ever reports the tool as started, and stops
  // the step without running anything when the recorder refuses.
  auditBeforeTool: () => true,
  // The fake reads no settings file of its own and keeps no list of standing approvals: every
  // decision is the shared `SessionPermissionGate`'s — the same port Claude's adapter calls.
  noSelfApproval: () => true,
  // Every path a scripted `write_file` reports is resolved under `start.workspace.value` (`resolved`
  // of `test-tool-classifier.ts`); nothing in this fake reads or writes outside it.
  folderScope: () => true,
  // The fake spawns no subprocess and reads no environment variable of its own: there is nothing for
  // a credential to leak through.
  credentialsOutside: () => true,
  configSensitive: () => TEST_ENGINE_CONFIG_FILES.length > 0,
};

/** The security contract of the engine `test` (plan 28, B-43). */
export function testEngineSecurityContract(): EngineSecurityContract {
  return {
    configFiles: TEST_ENGINE_CONFIG_FILES,
    assert: (): SecurityAssertion => {
      const unmet = SECURITY_CLAUSES.filter((clause) => !CHECKS[clause]());
      return unmet.length === 0 ? { holds: true } : { holds: false, unmet };
    },
  };
}
