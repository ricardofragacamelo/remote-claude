import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { QueryAuditTrailUseCase } from '@application/audit';
import type { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { auditTrailQuerySchema, DEFAULT_PAGE_SIZE, toAuditTrailPageDto } from './audit.dto';
import type { AuditTrailPageDto, AuditTrailQuery } from './audit.dto';

/**
 * The trail, read: "what ran on my machine, and who let it?"
 *
 * One route, and three answers with a meaning each. `200` is a page — possibly empty, which is an
 * answer too. `400` is a query this server cannot run: a malformed cursor, a period that ends
 * before it starts, a page size out of bounds. `403` is a session that is somebody else's
 * ([D-17](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 *
 * `audit` stays write-only to every other module. This controller and the reader behind it are the
 * read side, outside the flow, and nothing inside the flow is wired to them.
 */
@Controller('audit-entries')
@UseGuards(BearerAuthGuard)
export class AuditController {
  constructor(@Inject(QueryAuditTrailUseCase) private readonly query: QueryAuditTrailUseCase) {}

  /** The caller's trail, newest first, one page at a time. */
  @Get()
  async read(
    @Query(new ZodPipe(auditTrailQuerySchema)) query: AuditTrailQuery,
    @CurrentUser() userId: UserId,
  ): Promise<AuditTrailPageDto> {
    const page = await this.query.execute({
      userId,
      sessionId: query.sessionId === undefined ? null : SessionId.create(query.sessionId),
      toolName: query.toolName ?? null,
      decision: query.decision ?? null,
      from: query.from === undefined ? null : new Date(query.from),
      to: query.to === undefined ? null : new Date(query.to),
      before: query.cursor === undefined ? null : Number(query.cursor),
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
    });

    return toAuditTrailPageDto(page);
  }
}
