import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import type {
  ProjectMcpServerApprovalPayload,
  ProjectMcpServerListPayload,
} from '@remote-claude/contracts';
import {
  ApproveProjectMcpServerUseCase,
  ListProjectMcpServersUseCase,
  RejectProjectMcpServerUseCase,
} from '@application/mcp';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { engineParamSchema } from './mcp-servers.dto';
import {
  approveProjectMcpServerSchema,
  projectFolderQuerySchema,
  rejectProjectMcpServerQuerySchema,
  toProjectMcpServerDto,
  toProjectMcpServerListDto,
} from './project-mcp-approvals.dto';
import type {
  ApproveProjectMcpServerBody,
  ProjectFolderQuery,
  RejectProjectMcpServerQuery,
} from './project-mcp-approvals.dto';

/**
 * `/engines/:engine/project-mcp-approvals` — our approval of the servers a project's own MCP file
 * declares (plan 13, B-24; D-11). An engine not enabled, or enabled without the `mcp` capability,
 * answers `404` for every route here.
 *
 * | Status | When |
 * |---|---|
 * | `200` | `GET`, `PUT` |
 * | `204` | `DELETE`, always |
 * | `400` | a malformed engine, folder, name or digest — every field in `details[]` |
 * | `401` | no bearer, or an invalid one |
 * | `403` / `404` | the folder's own refusals — `WORKSPACE_NOT_ALLOWED`/`FORBIDDEN`, or an engine
 *   without the capability |
 * | `409` | `MCP_APPROVAL_STALE` — the entry is gone, or its digest changed since it was shown |
 */
@Controller('engines/:engine/project-mcp-approvals')
@UseGuards(BearerAuthGuard)
export class ProjectMcpApprovalsController {
  constructor(
    @Inject(ListProjectMcpServersUseCase) private readonly list: ListProjectMcpServersUseCase,
    @Inject(ApproveProjectMcpServerUseCase)
    private readonly approve: ApproveProjectMcpServerUseCase,
    @Inject(RejectProjectMcpServerUseCase) private readonly reject: RejectProjectMcpServerUseCase,
  ) {}

  @Get()
  async read(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Query(new ZodPipe(projectFolderQuerySchema)) query: ProjectFolderQuery,
    @CurrentUser() userId: UserId,
  ): Promise<ProjectMcpServerListPayload> {
    return toProjectMcpServerListDto(await this.list.execute(userId, engine, query.folder));
  }

  @Put()
  async approveOne(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Body(new ZodPipe(approveProjectMcpServerSchema)) body: ApproveProjectMcpServerBody,
    @CurrentUser() userId: UserId,
  ): Promise<ProjectMcpServerApprovalPayload> {
    return toProjectMcpServerDto(
      await this.approve.execute(userId, engine, body.folder, body.name, body.digest),
    );
  }

  @Delete()
  @HttpCode(204)
  async rejectOne(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Query(new ZodPipe(rejectProjectMcpServerQuerySchema)) query: RejectProjectMcpServerQuery,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.reject.execute(userId, engine, query.folder, query.name);
  }
}
