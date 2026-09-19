import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { ListWorkspacesUseCase, ResolveWorkspaceUseCase } from '@application/workspace';
import type { UserId } from '@domain/auth';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { resolveWorkspaceSchema, toWorkspaceDto } from './workspace.dto';
import type { ResolvedWorkspaceDto, ResolveWorkspaceDto, WorkspaceListDto } from './workspace.dto';

/**
 * The directories this installation will let Claude run in.
 *
 * Both routes read the allowlist and neither walks the disk. `resolve` touches exactly one path,
 * which is not a scan: a listing that stats a tree per request would be the most expensive thing
 * the endpoint does, and a way to learn what is on a machine without opening anything.
 */
@Controller('workspaces')
@UseGuards(BearerAuthGuard)
export class WorkspaceController {
  constructor(
    @Inject(ListWorkspacesUseCase) private readonly list: ListWorkspacesUseCase,
    @Inject(ResolveWorkspaceUseCase) private readonly resolve: ResolveWorkspaceUseCase,
  ) {}

  /** The roots this caller may use. Only theirs: a root of somebody else is not listed at all. */
  @Get()
  async read(@CurrentUser() userId: UserId): Promise<WorkspaceListDto> {
    return { workspaces: (await this.list.execute(userId)).map(toWorkspaceDto) };
  }

  /**
   * Whether a path may be opened, and what it really is.
   *
   * Every refusal is a different status, and each one is load-bearing: `400` for a path that is
   * not a path, `403` for one outside every root, `404` for one that is not there or is not the
   * caller's, `422` for a file. See docs/architecture/shared/04-errors-and-http.md.
   */
  @Get('resolve')
  async check(
    @Query(new ZodPipe(resolveWorkspaceSchema)) query: ResolveWorkspaceDto,
    @CurrentUser() userId: UserId,
  ): Promise<ResolvedWorkspaceDto> {
    const resolved = await this.resolve.execute(query.path, userId);

    return { path: resolved.path.value, root: toWorkspaceDto(resolved.workspace) };
  }
}
