import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import type {
  McpServer,
  McpServerListPayload,
  McpServerPreviewPayload,
} from '@remote-claude/contracts';
import {
  CreateMcpServerUseCase,
  DeleteMcpServerUseCase,
  ListMcpServersUseCase,
  PreviewMcpServerUseCase,
  SetMcpServerEnabledUseCase,
  UpdateMcpServerUseCase,
} from '@application/mcp';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { OmitFromLog } from '@shared/logging/omit-from-log.decorator';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  engineParamSchema,
  fieldsOf,
  mcpServerFieldsSchema,
  setEnabledSchema,
  toMcpServerDto,
  toMcpServerListDto,
  toPreviewDto,
} from './mcp-servers.dto';
import type { McpServerFieldsBody, SetEnabledBody } from './mcp-servers.dto';

/**
 * `/engines/:engine/mcp-servers…` — the store of MCP servers, for whichever engine carries the
 * `mcp` capability (plan 13, B-19; plan 28, F1). An engine not enabled, or enabled without the
 * capability, answers `404` for every route here — the same refusal as a name nobody registered.
 *
 * Every write is a second step in disguise: the screen calls `preview` first, with the exact
 * fields it is about to send, and shows the description that comes back before the person
 * confirms — the same text the write itself records (B-18, S-68).
 *
 * | Status | When |
 * |---|---|
 * | `200` / `201` | the answer |
 * | `204` | `DELETE`, always — the row is gone, with nothing left to return |
 * | `400` | a malformed body — every field in `details[]` |
 * | `401` | no bearer, or an invalid one |
 * | `403` | somebody else's server |
 * | `404` | an engine without the capability, or a server that does not exist |
 * | `409` | the name is already taken in that scope |
 * | `422` | the configuration breaks a rule of B-18 |
 * | `503` | the config carries a secret and the key file is unusable — nothing is written |
 */
@Controller('engines/:engine/mcp-servers')
@UseGuards(BearerAuthGuard)
export class McpServersController {
  constructor(
    @Inject(ListMcpServersUseCase) private readonly list: ListMcpServersUseCase,
    @Inject(PreviewMcpServerUseCase) private readonly preview: PreviewMcpServerUseCase,
    @Inject(CreateMcpServerUseCase) private readonly create: CreateMcpServerUseCase,
    @Inject(UpdateMcpServerUseCase) private readonly update: UpdateMcpServerUseCase,
    @Inject(SetMcpServerEnabledUseCase) private readonly setEnabled: SetMcpServerEnabledUseCase,
    @Inject(DeleteMcpServerUseCase) private readonly deleteServer: DeleteMcpServerUseCase,
  ) {}

  @Get()
  async read(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @CurrentUser() userId: UserId,
  ): Promise<McpServerListPayload> {
    return toMcpServerListDto(await this.list.execute(userId, engine));
  }

  @Post('preview')
  @OmitFromLog('env', 'headers')
  previewOf(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Body(new ZodPipe(mcpServerFieldsSchema)) body: McpServerFieldsBody,
  ): McpServerPreviewPayload {
    return toPreviewDto(this.preview.execute(engine, fieldsOf(body)));
  }

  @Post()
  @HttpCode(201)
  @OmitFromLog('env', 'headers')
  async add(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Body(new ZodPipe(mcpServerFieldsSchema)) body: McpServerFieldsBody,
    @CurrentUser() userId: UserId,
  ): Promise<McpServer> {
    return toMcpServerDto(await this.create.execute(userId, engine, fieldsOf(body)));
  }

  @Put(':id')
  @OmitFromLog('env', 'headers')
  async change(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Param('id') id: string,
    @Body(new ZodPipe(mcpServerFieldsSchema)) body: McpServerFieldsBody,
    @CurrentUser() userId: UserId,
  ): Promise<McpServer> {
    return toMcpServerDto(await this.update.execute(userId, engine, id, fieldsOf(body)));
  }

  @Patch(':id')
  async toggle(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Param('id') id: string,
    @Body(new ZodPipe(setEnabledSchema)) body: SetEnabledBody,
    @CurrentUser() userId: UserId,
  ): Promise<McpServer> {
    return toMcpServerDto(await this.setEnabled.execute(userId, engine, id, body.enabled));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Param('id') id: string,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.deleteServer.execute(userId, engine, id);
  }
}
