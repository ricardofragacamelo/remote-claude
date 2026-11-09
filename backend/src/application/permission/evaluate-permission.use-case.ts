import type { PermissionRule as Rule, RuleQuestion } from '@domain/permission';
import type { PermissionMode, ToolKind, ToolSubject } from '@domain/engine';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { SessionId } from '@domain/session';
import { SessionRegistry } from '@application/session';
import type { DecisionReason } from './decide-outcome';
import { decideOutcome } from './decide-outcome';
import type { RuleDraft } from './draft-permission-rule';
import { draftPermissionRule } from './draft-permission-rule';
import type { PermissionRegistry } from './permission-registry';
import type { PermissionRuleRepository } from './ports/permission-rule.repository';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';

/** A pattern the caller is weighing, tested beside the persisted rules — not stored. */
export type EvaluationDraft = RuleDraft;

/** "What would happen if this call ran?" — the question (plan 15, B-14). */
export interface EvaluatePermissionCommand {
  readonly userId: UserId;

  /** Which engine is asking — the rules of that engine and the canonical ones both count. */
  readonly engine: string;
  readonly kind: ToolKind;
  readonly subject: ToolSubject;

  /** A raw folder, resolved against the allowlist exactly as creating a `project` rule is. */
  readonly folder?: string | null;

  /** The mode to test under — ignored, and read from the session instead, when `sessionId` is live. */
  readonly mode?: PermissionMode | null;

  /** A live session of the caller's own — adds its `session` rules and its current mode (S-108). */
  readonly sessionId?: SessionId | null;

  readonly draft?: EvaluationDraft | null;
}

export type EvaluationOutcome = 'allow' | 'deny' | 'ask';

/** Why the outcome is what it is — the vocabulary "por que meu allow não valeu" answers with. */
export type EvaluationReason = DecisionReason;

/** What the engine decides before any rule of ours is even read (plan 15, D-12). */
export interface EvaluationCaveat {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface PermissionEvaluation {
  readonly outcome: EvaluationOutcome;
  readonly answeringRule: Rule | null;
  /** Every rule that matched, including the one that answered — "why my `allow` did not win". */
  readonly matching: readonly Rule[];
  readonly reasons: readonly EvaluationReason[];
  readonly caveats: readonly EvaluationCaveat[];
}

/**
 * Testing a command without running it, and without leaving a trace of it: the same precedence the
 * live flow uses — the rules first, the mode second — read straight from the repository, never a
 * copy of {@link import('./permission-auto-answer').PermissionAutoAnswer}'s own decision (plan 15,
 * B-14).
 *
 * A caveat is the one honest limit on the answer: an engine may refuse or accept something before a
 * single rule of ours is asked (a `deny` in the project's own settings, `acceptEdits`, a read the
 * engine's own CLI approves by itself). Declared by the engine, never guessed here.
 */
export class EvaluatePermissionUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly registry: PermissionRegistry,
    private readonly sessions: SessionRegistry,
    private readonly folders: RuleFolderResolver,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/session').SessionNotFoundError} `sessionId` names no live session
   * @throws {import('@domain/session').SessionForbiddenError} `sessionId` is somebody else's
   * @throws whatever `RuleFolderResolver` refuses a raw `folder` with
   * @throws {import('@domain/permission').PermissionRulePatternInvalidError} a draft outside the
   *   grammar
   */
  async execute(command: EvaluatePermissionCommand): Promise<PermissionEvaluation> {
    const now = this.clock.now();
    const live =
      command.sessionId == null ? null : this.sessions.require(command.sessionId, command.userId);
    const folder =
      command.folder != null
        ? (await this.folders.resolve(command.folder, command.userId)).value
        : (live?.session.workspace.value ?? null);
    const mode: PermissionMode = live?.session.permissionMode ?? command.mode ?? 'ask';
    const rules = await this.rulesFor(command, folder, now);

    const question: RuleQuestion = {
      subject: {
        userId: command.userId,
        // No `session` rule is ever in `rules` when there is no live session, so this id never
        // matches one — only a syntactically valid placeholder, for a type every rule needs.
        sessionId: command.sessionId ?? NO_LIVE_SESSION,
        projectPath: folder,
      },
      tool: {
        kind: command.kind,
        subject: command.subject,
        origin: { engine: command.engine, native: command.kind },
      },
      permissionMode: mode,
      now,
    };

    const decided = decideOutcome(rules, question, mode);

    return { ...decided, caveats: caveatsOf(command.engine, mode) };
  }

  /** Persisted, plus the session's own (if live) and the draft (if any) — never a copy. */
  private async rulesFor(
    command: EvaluatePermissionCommand,
    folder: string | null,
    now: Date,
  ): Promise<readonly Rule[]> {
    const persisted = await this.rules.findApplicable(command.userId, folder, now);
    const sessionRules = command.sessionId == null ? [] : this.registry.rulesOf(command.sessionId);
    const draftRule =
      command.draft == null
        ? null
        : draftPermissionRule(command.draft, command.userId, folder, now);

    return [...persisted, ...sessionRules, ...(draftRule === null ? [] : [draftRule])];
  }
}

/** The one caveat this build can honestly declare, until an engine's own adapter exposes its own. */
function caveatsOf(engine: string, mode: PermissionMode): readonly EvaluationCaveat[] {
  const caveats: EvaluationCaveat[] = [
    { messageKey: 'permission.evaluateCaveat.engineMayDecideFirst', params: { engine } },
  ];

  if (mode === 'acceptEdits') {
    caveats.push({ messageKey: 'permission.evaluateCaveat.acceptEdits', params: {} });
  }

  return caveats;
}

const NO_LIVE_SESSION = SessionId.create('0'.repeat(26));
