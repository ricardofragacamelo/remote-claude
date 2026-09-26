import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  DescribePermissionRuleUseCase,
  GrantPermissionRuleUseCase,
  ListPermissionRulesUseCase,
  RevokePermissionRuleUseCase,
} from '@application/permission';
import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import type { Clock } from '@domain/shared';
import { CLOCK } from '@application/shared';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { grantPermissionRuleSchema, toPermissionRuleDto } from './permission-rules.dto';
import type {
  GrantPermissionRuleBody,
  PermissionRuleDto,
  PermissionRuleListDto,
} from './permission-rules.dto';

/**
 * The rules that outlive a session: what somebody authorised in advance, and taking it back.
 *
 * Each outcome has its own status, and each is something a screen does differently. `201` is a
 * rule that stands — the one just granted, or the equivalent one that was already active. `400` is
 * a pattern outside the grammar, `422` a lifetime past the ceiling. On revocation, `404` is a rule
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
    @Inject(DescribePermissionRuleUseCase) private readonly describe: DescribePermissionRuleUseCase,
    @Inject(GrantPermissionRuleUseCase) private readonly grant: GrantPermissionRuleUseCase,
    @Inject(RevokePermissionRuleUseCase) private readonly revoke: RevokePermissionRuleUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The caller's rules, newest first — expired ones included and marked, revoked ones gone. */
  @Get()
  async read(@CurrentUser() userId: UserId): Promise<PermissionRuleListDto> {
    return { rules: (await this.list.execute(userId)).map(toPermissionRuleDto) };
  }

  /**
   * One rule, whatever its state: `active`, `expired`, or `revoked` with the moment it was.
   * `404` when there is no such rule, `403` when it is somebody else's.
   */
  @Get(':ruleId')
  async readOne(
    @Param('ruleId') ruleId: string,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleDto> {
    return toPermissionRuleDto(await this.describe.execute(userId, ruleId));
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
  ): Promise<PermissionRuleDto> {
    const rule = await this.grant.execute({
      userId,
      pattern: body.pattern,
      decision: body.decision,
      scope: body.scope,
      // Normalised the way a session's workspace is, or a rule for `/srv/app/` would never reach
      // a session opened in `/srv/app`.
      projectPath:
        body.projectPath === undefined ? null : WorkspacePath.create(body.projectPath).value,
      expiresAt: body.expiresAt === undefined ? null : new Date(body.expiresAt),
    });

    return this.described(rule);
  }

  /**
   * Taking a rule back, with effect on the very next request of every session.
   *
   * `DELETE` on the rule, and the row stays: the history points at the rule that answered, and
   * that has to lead somewhere after it was revoked. Revoking twice answers the same, twice.
   */
  @Delete(':ruleId')
  @HttpCode(200)
  async remove(
    @Param('ruleId') ruleId: string,
    @CurrentUser() userId: UserId,
  ): Promise<PermissionRuleDto> {
    return this.described(await this.revoke.execute(userId, ruleId));
  }

  private described(rule: PermissionRule): PermissionRuleDto {
    return toPermissionRuleDto({ rule, status: rule.statusAt(this.clock.now()) });
  }
}
