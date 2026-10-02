import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { QueryAuditEventsUseCase } from '@application/audit';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { DEFAULT_PAGE_SIZE } from './audit.dto';
import { auditEventsQuerySchema, toAuditEventPageDto } from './audit-events.dto';
import type { AuditEventPageDto, AuditEventsQuery } from './audit-events.dto';

/**
 * The account facts, read — the devices approved and revoked, the rules granted, the conversations
 * resumed, the undos, and from plan 07 the person's writes to their files (B-17).
 *
 * `200` is a page, possibly empty; `400` a query this server cannot run — a malformed cursor or a
 * page size out of bounds (S-122). The redesign of the screen is plan 12's, which absorbs this read
 * rather than writing another ([07 · D-13](../../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha)).
 */
@Controller('audit-events')
@UseGuards(BearerAuthGuard)
export class AuditEventsController {
  constructor(@Inject(QueryAuditEventsUseCase) private readonly query: QueryAuditEventsUseCase) {}

  /** The caller's facts, newest first, one page at a time. */
  @Get()
  async read(
    @Query(new ZodPipe(auditEventsQuerySchema)) query: AuditEventsQuery,
    @CurrentUser() userId: UserId,
  ): Promise<AuditEventPageDto> {
    return toAuditEventPageDto(
      await this.query.execute({
        userId,
        kindPrefix: query.kind ?? null,
        before: query.cursor === undefined ? null : Number(query.cursor),
        limit: query.limit ?? DEFAULT_PAGE_SIZE,
      }),
    );
  }
}
