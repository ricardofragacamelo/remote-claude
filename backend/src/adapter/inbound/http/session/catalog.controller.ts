import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { ReadCatalogUseCase } from '@application/session';
import type { InstallationCatalog } from '@application/session';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { listLiveSessionsSchema } from './live-sessions.dto';
import type { ListLiveSessionsQueryDto } from './live-sessions.dto';

/**
 * What a folder's installation offers the composer before a session exists — plan 08, B-50, D-13:
 * its slash commands and skills, as the menu shows them, its models, and the ceilings of the
 * context and of the attachments.
 *
 * From the catalogue by the version of the CLI and the folder; without it, a query that only asks
 * is opened once and closed — logged by the adapter of the CLI, as every question to it is. The
 * folder travels as a query parameter, as for `GET /sessions`; both edges are logged by the
 * interceptor, like every route.
 *
 * | Status | When |
 * |---|---|
 * | `200` | the catalogue |
 * | `400` | no `workspacePath`, or a relative one |
 * | `403` / `404` / `422` | as `GET /sessions` refuses the folder |
 * | `429` | no slot for the query — the machine runs as many sessions as it holds |
 * | `502` / `504` | the CLI failed to answer, or did not in time — the composer goes on without it |
 */
@Controller('catalog')
@UseGuards(BearerAuthGuard)
export class CatalogController {
  constructor(@Inject(ReadCatalogUseCase) private readonly catalog: ReadCatalogUseCase) {}

  @Get()
  read(
    @Query(new ZodPipe(listLiveSessionsSchema)) query: ListLiveSessionsQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<InstallationCatalog> {
    return this.catalog.execute(query.workspacePath, userId);
  }
}
