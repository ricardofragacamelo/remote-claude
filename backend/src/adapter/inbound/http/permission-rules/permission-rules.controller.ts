import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type {
  PermissionRuleBatchPayload,
  PermissionRuleEvaluationPayload,
  PermissionRuleExportPayload,
  PermissionRuleHistoryPayload,
  PermissionRuleImportPreviewPayload,
  PermissionRuleImportResultPayload,
  PermissionRuleInvocationPagePayload,
  PermissionRuleListPayload,
  PermissionRulePayload,
  PermissionRulePreviewPayload,
  PermissionRuleSimulationPayload,
  PermissionRuleSummaryPayload,
  PermissionRuleTemplatesPayload,
} from '@remote-claude/contracts';

import {
  ChangePermissionRuleExpiryUseCase,
  DescribePermissionRuleUseCase,
  EvaluatePermissionUseCase,
  ExportPermissionRulesUseCase,
  GrantPermissionRuleUseCase,
  ImportPermissionRulesUseCase,
  ListPermissionRulesUseCase,
  ListRuleHistoryUseCase,
  ListRuleInvocationsUseCase,
  ListRuleTemplatesUseCase,
  PreviewPermissionRuleUseCase,
  PreviewRuleImportUseCase,
  RestorePermissionRulesUseCase,
  RevokePermissionRuleUseCase,
  RevokePermissionRulesUseCase,
  SimulatePermissionRulesUseCase,
  SummarizePermissionRulesUseCase,
  decodeRuleCursor,
} from '@application/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import type { Clock } from '@domain/shared';
import { ToolClassifiers } from '@application/engine';
import { CLOCK } from '@application/shared';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { ZodPipe } from '@shared/validation/zod.pipe';
import type { AppConfig } from '@infra/config/environment';
import { APP_CONFIG } from '@infra/config/environment';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  evaluatePermissionSchema,
  grantPermissionRuleSchema,
  importRulesSchema,
  listPermissionRulesQuerySchema,
  patchRuleExpirySchema,
  previewPermissionRuleSchema,
  previewRuleImportSchema,
  ruleIdsSchema,
  ruleInvocationsQuerySchema,
  simulatePermissionRulesSchema,
  summarizePermissionRulesQuerySchema,
  toEvaluationDto,
  toListFilter,
  toPermissionRuleBatchDto,
  toListedPermissionRuleItemDto,
  toPermissionRuleDto,
  toPermissionRuleListPageDto,
  toPermissionRulePreviewDto,
  toPermissionRuleSummaryDto,
  toRuleExportDto,
  toRuleHistoryDto,
  toRuleImportPreviewDto,
  toRuleImportResultDto,
  toRuleInvocationPageDto,
  toRuleTemplatesDto,
  toSimulationDto,
  toToolSubject,
  patternFieldsOf,
} from './permission-rules.dto';
import type {
  EvaluatePermissionBody,
  GrantPermissionRuleBody,
  ImportRulesBody,
  ListPermissionRulesQuery,
  PatchRuleExpiryBody,
  PreviewPermissionRuleBody,
  PreviewRuleImportBody,
  RuleIdsBody,
  RuleInvocationsQuery,
  SimulatePermissionRulesBody,
  SummarizePermissionRulesQuery,
} from './permission-rules.dto';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_INVOCATIONS_LIMIT = 50;

/**
 * The rules that outlive a session: what somebody authorised in advance, and taking it back.
 *
 * Each outcome has its own status, and each is something a screen does differently. `201` is a
 * rule that stands — the one just granted, or the equivalent one that was already active. `400` is
 * a pattern outside the canonical grammar (an engine's own grammar included), `422` a lifetime past
 * the ceiling or a rule for a question or a plan. A rule the migration switched off is listed, with
 * why, and can be revoked like any other; it is never switched back on (plan 28, B-33). On revocation, `404` is a rule
 * that does not exist and `403` somebody else's, which stays exactly as it was
 * ([D-10](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * One rule is also readable by id, in **any** state — the revoked one included. It is how the trail
 * leads to the rule that answered, after it was taken back
 * ([D-18](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * Only `project` and `always` are here. A `session` rule lives and dies with its session, and is
 * granted from the approval card.
 */
@Controller('permission-rules')
@UseGuards(BearerAuthGuard)
export class PermissionRulesController {
  constructor(
    @Inject(ListPermissionRulesUseCase) private readonly list: ListPermissionRulesUseCase,
    @Inject(SummarizePermissionRulesUseCase)
    private readonly summarize: SummarizePermissionRulesUseCase,
    @Inject(ListRuleInvocationsUseCase)
    private readonly ruleInvocations: ListRuleInvocationsUseCase,
    @Inject(ListRuleHistoryUseCase) private readonly ruleHistory: ListRuleHistoryUseCase,
    @Inject(DescribePermissionRuleUseCase) private readonly describe: DescribePermissionRuleUseCase,
    @Inject(GrantPermissionRuleUseCase) private readonly grant: GrantPermissionRuleUseCase,
    @Inject(RevokePermissionRuleUseCase) private readonly revoke: RevokePermissionRuleUseCase,
    @Inject(RevokePermissionRulesUseCase)
    private readonly revokeBatch: RevokePermissionRulesUseCase,
    @Inject(RestorePermissionRulesUseCase) private readonly restore: RestorePermissionRulesUseCase,
    @Inject(ChangePermissionRuleExpiryUseCase)
    private readonly changeExpiry: ChangePermissionRuleExpiryUseCase,
    @Inject(EvaluatePermissionUseCase) private readonly evaluate: EvaluatePermissionUseCase,
    @Inject(PreviewPermissionRuleUseCase) private readonly preview: PreviewPermissionRuleUseCase,
    @Inject(SimulatePermissionRulesUseCase)
    private readonly simulate: SimulatePermissionRulesUseCase,
    @Inject(ListRuleTemplatesUseCase) private readonly templates: ListRuleTemplatesUseCase,
    @Inject(ExportPermissionRulesUseCase)
    private readonly exportRules: ExportPermissionRulesUseCase,
    @Inject(PreviewRuleImportUseCase) private readonly previewImport: PreviewRuleImportUseCase,
    @Inject(ImportPermissionRulesUseCase)
    private readonly importRules: ImportPermissionRulesUseCase,
    @Inject(ToolClassifiers) private readonly classifiers: ToolClassifiers,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * The caller's rules, one page at a time — newest first with no filter, expired ones included
   * and marked, revoked and disabled ones gone unless asked for (S-01, S-02; plan 15, B-10).
   */
  @Get()
  async read(
    @Query(new ZodPipe(listPermissionRulesQuerySchema)) query: ListPermissionRulesQuery,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleListPayload> {
    const cursor = this.decodedCursor(query.cursor);
    const { items, nextCursor } = await this.list.search({
      userId,
      filter: toListFilter(query),
      sort: query.sort ?? 'grantedAt',
      order: query.order ?? 'desc',
      cursor,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    });

    return toPermissionRuleListPageDto(items, nextCursor, this.config.audit.retentionDays);
  }

  /** Counts over the same predicate the listing reads — for the tabs and the nav badge (B-10). */
  @Get('summary')
  async readSummary(
    @Query(new ZodPipe(summarizePermissionRulesQuerySchema)) query: SummarizePermissionRulesQuery,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleSummaryPayload> {
    return toPermissionRuleSummaryDto(await this.summarize.execute(userId, toListFilter(query)));
  }

  /**
   * The catalog of pre-built rule bundles — the same for every caller, canonical, with the reach
   * and the breadth already read ([15 · B-17]). Declared ahead of `:ruleId`, like `summary`: a
   * literal path, never a rule id.
   */
  @Get('templates')
  readTemplates(): PermissionRuleTemplatesPayload {
    return toRuleTemplatesDto(this.templates.execute());
  }

  /**
   * The caller's own rules, in the file a screen offers to download — same filters as the listing,
   * none of its paging ([15 · B-18]). Declared ahead of `:ruleId`, like `templates`.
   */
  @Get('export')
  async readExport(
    @Query(new ZodPipe(summarizePermissionRulesQuerySchema)) query: SummarizePermissionRulesQuery,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleExportPayload> {
    return toRuleExportDto(await this.exportRules.execute(userId, toListFilter(query)));
  }

  /**
   * One rule, whatever its state: `active`, `expired`, or `revoked` with the moment it was.
   * `404` when there is no such rule, `403` when it is somebody else's.
   */
  @Get(':ruleId')
  async readOne(
    @Param('ruleId') ruleId: string,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRulePayload> {
    const described = await this.describe.execute(userId, ruleId);

    return toListedPermissionRuleItemDto(described, this.config.audit.retentionDays);
  }

  /** The invocations a rule answered — "14 usos" opens to these same lines (B-11, S-61, S-62). */
  @Get(':ruleId/invocations')
  async readInvocations(
    @Param('ruleId') ruleId: string,
    @Query(new ZodPipe(ruleInvocationsQuerySchema)) query: RuleInvocationsQuery,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleInvocationPagePayload> {
    return toRuleInvocationPageDto(
      await this.ruleInvocations.execute(
        userId,
        ruleId,
        query.cursor ?? null,
        query.limit ?? DEFAULT_INVOCATIONS_LIMIT,
      ),
    );
  }

  /** The events of one rule — granted, validity changed, revoked, restored (B-11). */
  @Get(':ruleId/history')
  async readHistory(
    @Param('ruleId') ruleId: string,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleHistoryPayload> {
    return toRuleHistoryDto(await this.ruleHistory.execute(userId, ruleId));
  }

  /**
   * Granting a rule explicitly. Idempotent: the same active rule twice is the one rule.
   *
   * `201` on both, as with a device registration: the second call is not "nothing happened", it
   * is "this rule stands", and a client branching on the difference would be branching on nothing.
   */
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(grantPermissionRuleSchema)) body: GrantPermissionRuleBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRulePayload> {
    const rule = await this.grant.execute({
      userId,
      ...patternFieldsOf(body),
      // Raw: resolved against the allowlist inside the grant routine, never trusted blindly — this
      // path came from outside, unlike the card's own, already-resolved session workspace (D-10).
      projectPath: body.projectPath === undefined ? null : { raw: body.projectPath },
      expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
      acknowledgeBroad: body.acknowledgeBroad ?? false,
      grantedVia: 'request',
      templateId: body.templateId ?? null,
    });

    return this.described(rule);
  }

  /**
   * Taking a rule back, with effect on the very next request of every session.
   *
   * `DELETE` on the rule, and the row stays: the history points at the rule that answered, and
   * that has to lead somewhere after it was revoked. Revoking twice answers the same, twice. The
   * batch of one ([15 · D-06]) — `POST /permission-rules/revoke` is the same implementation.
   */
  @Delete(':ruleId')
  @HttpCode(200)
  async remove(
    @Param('ruleId') ruleId: string,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRulePayload> {
    return this.described(await this.revoke.execute(userId, ruleId));
  }

  /**
   * Shortening or extending the one thing a rule ever has edited under its own id (plan 15, D-01).
   * Requires `If-Match`: a `PATCH` with no precondition could overwrite a change nobody saw yet.
   */
  @Patch(':ruleId')
  async changeExpiryRoute(
    @Param('ruleId') ruleId: string,
    @Body(new ZodPipe(patchRuleExpirySchema)) body: PatchRuleExpiryBody,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRulePayload> {
    return this.described(
      await this.changeExpiry.execute(userId, ruleId, new Date(body.expiresAt), ifMatch ?? null),
    );
  }

  /** Revoking a lot in one call, atomic in both halves ([15 · D-06]). */
  @Post('revoke')
  @HttpCode(200)
  async revokeBatchRoute(
    @Body(new ZodPipe(ruleIdsSchema)) body: RuleIdsBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleBatchPayload> {
    return toPermissionRuleBatchDto(
      await this.revokeBatch.execute(userId, body.ids),
      this.clock.now(),
    );
  }

  /** Undoing a revocation, while the window is still open ([15 · D-11]). */
  @Post('restore')
  @HttpCode(201)
  async restoreRoute(
    @Body(new ZodPipe(ruleIdsSchema)) body: RuleIdsBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleBatchPayload> {
    return toPermissionRuleBatchDto(await this.restore.execute(userId, body.ids), this.clock.now());
  }

  /**
   * Testing a command without running it — the same precedence a live session uses, with no
   * effect of any kind ([15 · B-14]).
   */
  @Post('evaluate')
  @HttpCode(200)
  async evaluateRoute(
    @Body(new ZodPipe(evaluatePermissionSchema)) body: EvaluatePermissionBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleEvaluationPayload> {
    return toEvaluationDto(
      await this.evaluate.execute({
        userId,
        engine: body.engine,
        kind: body.kind,
        subject: toToolSubject(body.subject),
        folder: body.folder ?? null,
        mode: body.mode ?? null,
        sessionId: body.sessionId === undefined ? null : SessionId.create(body.sessionId),
        draft:
          body.draft === undefined
            ? null
            : {
                pattern: body.draft.pattern,
                decision: body.draft.decision,
                engine: body.draft.engine ?? null,
              },
      }),
    );
  }

  /**
   * What a pattern nobody has granted yet would reach, and what it would mean against the
   * caller's active rules — before a single byte is written ([15 · B-15]).
   */
  @Post('preview')
  @HttpCode(200)
  async previewRoute(
    @Body(new ZodPipe(previewPermissionRuleSchema)) body: PreviewPermissionRuleBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRulePreviewPayload> {
    return toPermissionRulePreviewDto(
      await this.preview.execute({
        userId,
        ...patternFieldsOf(body),
        projectPath: body.projectPath ?? null,
      }),
    );
  }

  /**
   * What the last invocations would have become under rules being weighed, before granting or
   * revoking a single one ([15 · B-16]). Read only — nothing is stored, no event, no push.
   */
  @Post('simulate')
  @HttpCode(200)
  async simulateRoute(
    @Body(new ZodPipe(simulatePermissionRulesSchema)) body: SimulatePermissionRulesBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleSimulationPayload> {
    return toSimulationDto(
      await this.simulate.execute({
        userId,
        folder: body.folder ?? null,
        ...(body.add === undefined
          ? {}
          : {
              add: body.add.map((draft) => ({
                pattern: draft.pattern,
                decision: draft.decision,
                engine: draft.engine ?? null,
              })),
            }),
        ...(body.remove === undefined ? {} : { remove: body.remove }),
        ...(body.limit === undefined ? {} : { limit: body.limit }),
      }),
      this.classifiers,
    );
  }

  /**
   * What an import file would do, item by item, before a single byte of it is written
   * ([15 · B-18], D-17).
   */
  @Post('import/preview')
  @HttpCode(200)
  async previewImportRoute(
    @Body(new ZodPipe(previewRuleImportSchema)) body: PreviewRuleImportBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleImportPreviewPayload> {
    return toRuleImportPreviewDto(await this.previewImport.execute(userId, body.file));
  }

  /**
   * Writing the lot a preview showed, revalidated first — an item that would now be refused fails
   * the whole call, nothing written ([15 · B-18], D-17).
   */
  @Post('import')
  @HttpCode(200)
  async importRoute(
    @Body(new ZodPipe(importRulesSchema)) body: ImportRulesBody,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleImportResultPayload> {
    const result = await this.importRules.execute({
      userId,
      file: body.file,
      digest: body.digest,
      accept: body.accept,
      acknowledgeBroad: body.acknowledgeBroad ?? [],
      folderMap: body.folderMap ?? {},
      expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
    });

    return toRuleImportResultDto(result, this.clock.now());
  }

  private described(rule: PermissionRule): PermissionRulePayload {
    return toPermissionRuleDto({ rule, status: rule.statusAt(this.clock.now()) });
  }

  /** @throws {InputValidationError} a `cursor` this server never emitted (S-48) */
  private decodedCursor(raw: string | undefined): ReturnType<typeof decodeRuleCursor> {
    if (raw === undefined) {
      return null;
    }

    const cursor = decodeRuleCursor(raw);

    if (cursor === null) {
      throw new InputValidationError([{ field: 'cursor', rule: 'invalidCursor' }]);
    }

    return cursor;
  }
}
