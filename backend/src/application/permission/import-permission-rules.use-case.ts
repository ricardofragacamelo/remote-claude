import {
  PermissionRule,
  PermissionRuleImportInvalidError,
  PermissionRuleImportRejectedError,
} from '@domain/permission';
import type { ImportRejection } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { Clock, IdGenerator } from '@domain/shared';
import type { RecordAuditEventUseCase } from '@application/audit';
import type { GrantPermissionRuleCommand } from './commands/grant-permission-rule.command';
import type { GrantPermissionRuleUseCase } from './grant-permission-rule.use-case';
import { parseImportFile, structuralFieldsOf } from './rule-export-file';

/** One item of the file, applying it (plan 15, B-18, D-17). */
export interface ImportRuleCommand {
  readonly userId: UserId;
  /** The exact bytes the preview was shown — the apply reads it again, never the preview's own copy. */
  readonly file: string;
  /** The `digest` the preview answered with (S-143). */
  readonly digest: string;
  /** Indices of `file`'s `rules`, in the order to apply them. */
  readonly accept: readonly number[];
  /** Indices (a subset of `accept`) whose `broad` breadth the caller has seen and accepted. */
  readonly acknowledgeBroad: readonly number[];
  /** Maps a `project` item's own `projectPath` to a real folder of this machine. */
  readonly folderMap: Readonly<Record<string, string>>;
  /** Overrides the default/ceiling validity for the whole lot — the file's own is always ignored. */
  readonly expiresAt?: Date | null;
}

export interface RuleImportCounts {
  readonly created: number;
  readonly existing: number;
}

export interface RuleImportResult {
  readonly counts: RuleImportCounts;
  /** Every accepted item's rule, in `accept`'s order — created this call, or already active. */
  readonly rules: readonly PermissionRule[];
}

/**
 * `POST /permission-rules/import` — writing the lot a preview already showed, revalidated first
 * ([15 · D-17]).
 *
 * Two passes, never interleaved: every accepted item is checked again, in full — the same checks
 * {@link GrantPermissionRuleUseCase.execute} runs — **before** a single one is written; one that
 * would now be refused fails the whole call, nothing created (S-142). Only once every item of the
 * lot passes does the write pass run, item by item through the grant routine itself, each one
 * audited on its own; a failure there (not a validation one — a write that fails) leaves whatever
 * already landed standing, audited, and the call still answers an error (S-149). Granting the same
 * file twice creates nothing the second time — the grant routine's own idempotency, not a check of
 * this one's (S-145); two calls for the same file at once answer the same way, for the same reason
 * (S-146).
 */
export class ImportPermissionRulesUseCase {
  constructor(
    private readonly grant: GrantPermissionRuleUseCase,
    private readonly trail: RecordAuditEventUseCase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleImportTooLargeError} over 256 KB or 500 rules
   * @throws {import('@domain/permission').PermissionRuleImportUnsupportedError} not this file at all
   * @throws {PermissionRuleImportInvalidError} the `digest` is stale, or an index is out of range
   * @throws {import('@domain/permission').PermissionRuleImportRejectedError} an accepted item that
   *   revalidation refuses — nothing is written
   */
  async execute(command: ImportRuleCommand): Promise<RuleImportResult> {
    const parsed = parseImportFile(command.file);

    if (parsed.digest !== command.digest) {
      throw new PermissionRuleImportInvalidError('digest');
    }

    this.assertIndices(command, parsed.items.length);

    // `assertIndices` already proved every `index` is within `parsed.items` — never `undefined`.
    const commands = command.accept.map((index) =>
      this.commandOf(command, parsed.items[index]!, index),
    );

    await this.revalidate(commands);

    return this.write(command.userId, commands);
  }

  /** Every `accept`/`acknowledgeBroad` index names an item the file actually has. */
  private assertIndices(command: ImportRuleCommand, itemCount: number): void {
    const inRange = (index: number): boolean => index >= 0 && index < itemCount;

    if (!command.accept.every(inRange) || !command.acknowledgeBroad.every(inRange)) {
      throw new PermissionRuleImportInvalidError('index');
    }
  }

  /** The command an accepted item becomes — `grantedVia: 'import'`, the file's own validity ignored. */
  private commandOf(
    command: ImportRuleCommand,
    item: Readonly<Record<string, unknown>>,
    index: number,
  ): GrantPermissionRuleCommand {
    const fields = structuralFieldsOf(item);

    return {
      userId: command.userId,
      pattern: fields.pattern,
      engine: fields.engine,
      decision: fields.decision,
      scope: fields.scope,
      // `structuralFieldsOf` never leaves `projectPath` null when `scope` is `project`.
      projectPath:
        fields.scope === 'project'
          ? { raw: command.folderMap[fields.projectPath!] ?? fields.projectPath! }
          : null,
      expiresAt: command.expiresAt ?? null,
      acknowledgeBroad: command.acknowledgeBroad.includes(index),
      grantedVia: 'import',
    };
  }

  /**
   * @throws {import('@domain/permission').PermissionRuleImportRejectedError} any command the grant
   *   routine would refuse today — every one is checked, so the lot's rejections are reported at
   *   once (S-142)
   */
  private async revalidate(commands: readonly GrantPermissionRuleCommand[]): Promise<void> {
    const rejections: ImportRejection[] = [];

    for (const [index, command] of commands.entries()) {
      try {
        await this.grant.validate(command);
      } catch (error) {
        rejections.push({ index, code: codeOf(error) });
      }
    }

    if (rejections.length > 0) {
      throw new PermissionRuleImportRejectedError(rejections);
    }
  }

  /**
   * The write pass — sequential, on purpose: a failure here stops the loop with whatever already
   * landed standing, never rolled back (S-149).
   */
  private async write(
    userId: UserId,
    commands: readonly GrantPermissionRuleCommand[],
  ): Promise<RuleImportResult> {
    const rules: PermissionRule[] = [];
    let created = 0;

    for (const command of commands) {
      const grant = await this.grant.grantWithResult(command);

      rules.push(grant.rule);
      created += grant.created ? 1 : 0;
    }

    await this.trail.execute({
      userId,
      kind: 'permission.rulesImported',
      subjectId: this.ids.next(),
      subjectLabel: `${String(rules.length)} rule(s)`,
      details: { count: rules.length, created, existing: rules.length - created },
      at: this.clock.now(),
    });

    return { counts: { created, existing: rules.length - created }, rules };
  }
}

/** The code a rejection reports — the domain's own, or `INVALID_INPUT` for anything else thrown. */
function codeOf(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'INVALID_INPUT';
}
