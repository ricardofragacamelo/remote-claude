import type { EngineCapabilities } from '@domain/engine';
import { PERMISSION_MODES } from '@domain/session';

/**
 * What a session of the test engine can do (plan 28, B-43).
 *
 * Fewer than Claude's (`CLAUDE_CAPABILITIES`) on purpose — proving that a screen hides exactly what
 * `capabilities` says is missing is the whole reason this engine exists, and a fake that happened to
 * support everything would prove nothing. Each flag below says why it is on or off:
 *
 * - `resume: false` — a resume is decided by `ResumableConversationSource`
 *   (`TranscriptModuleConversationSource`), which asks the engine's own **transcript store** for the
 *   conversation before anything is spawned (`start-session.use-case.ts`'s `continueConversation`) —
 *   it is not gated by the `resume` flag at all, so claiming `resume: true` with no store behind it
 *   (`history: false`, below) would be a capability this fake cannot actually honour. A real second
 *   engine that wants `resume: true` needs a transcript store, same as Claude's; this fake's job is
 *   the session lifecycle, not transcript storage, so it declares neither (plan 28, B-43's own
 *   design note — see `docs/architecture/backend/07-testing.md`).
 * - `fork: 'none'` — a fork has to prove it never writes the conversation it forked from, and this
 *   fake keeps no conversation store at all to make that promise about. Off, rather than faked.
 * - `history: false` — no transcript store (plan 28, F7 does not build one for it); nothing to list
 *   or read back.
 * - `images: false` — no scripted turn carries one; adding an image path to a three-tool fake would
 *   test nothing the Claude-only image suite does not already cover.
 * - `promptWhileBusy: true` — needed to prove the universal "a prompt sent while a turn runs is
 *   queued, not refused" contract against a second engine (S-120).
 * - `questions: true` — `ask_user` is one of the three native tools the task names.
 * - `planApproval: false` — explicitly off (F7-e2e.md, B-43: "sem plano").
 * - `taskList: false` — none of the three native tools ever touches a task; a capability nothing
 *   exercises is better left off than faked.
 * - `subagents: false` — no `agent`-kind tool in the classification table.
 * - `thinking: false` — the scripted turns carry only tool calls and plain text.
 * - `slashCommands: false` — `EngineControl.supportedCommands` is left unimplemented.
 * - `modelSwitch: false` — `EngineControl.setModel` is left unimplemented.
 * - `effortLevels: []` — explicitly off ("sem esforço").
 * - `contextUse: false` — explicitly off ("sem contexto").
 * - `mcp: false` — no server to report, and no fixture pretends one connected.
 * - `compaction: false` — explicitly off ("sem compactação").
 * - `cost: 'none'` — explicitly off ("sem custo em US$").
 * - `permissionModes: PERMISSION_MODES` — every canonical mode. The fake never itself branches on
 *   the session's mode — that is `SessionPermissionGate`'s job, the same port Claude's adapter calls
 *   — so there is nothing engine-specific stopping any of them, and the mode scenarios of the port
 *   contract suite can run against both adapters unmodified.
 */
export const TEST_CAPABILITIES: EngineCapabilities = {
  resume: false,
  fork: 'none',
  history: false,
  images: false,
  promptWhileBusy: true,
  questions: true,
  planApproval: false,
  taskList: false,
  subagents: false,
  thinking: false,
  slashCommands: false,
  modelSwitch: false,
  effortLevels: [],
  contextUse: false,
  mcp: false,
  compaction: false,
  cost: 'none',
  permissionModes: PERMISSION_MODES,
};
