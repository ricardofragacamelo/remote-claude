import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CheckModelUseCase,
  ClearFolderDefaultsUseCase,
  ReadAccountUseCase,
  ReadDefaultsUseCase,
  ReadInstallationUseCase,
  ReadModelsUseCase,
  SaveDefaultsUseCase,
} from '@application/claude-config';
import type {
  AccountView,
  DefaultsView,
  InstallationView,
  ModelCheckOutcome,
  ModelsView,
} from '@application/claude-config';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import {
  accountQuerySchema,
  defaultsOf,
  folderDefaultsSchema,
  folderQuerySchema,
  modelCheckSchema,
  requiredFolderQuerySchema,
  userDefaultsSchema,
} from './claude-config.dto';
import type { FolderDefaultsBody, FolderQueryDto, UserDefaultsBody } from './claude-config.dto';

/**
 * `/claude/*` — the account, the installation, the models and the defaults (plan 13, F1). The rest
 * of the module's routes — MCP servers, plugins, skills, the project — arrive with F2 and F3.
 *
 * Every route is Bearer and scoped by who asks; a folder clears the allowlist before anything else.
 * The answers are views of the domain, never a token, a credential path nor a secret. See
 * docs/architecture/backend/03-modules.md#as-rotas-http-do-claude-config.
 */
@Controller('claude')
@UseGuards(BearerAuthGuard)
export class ClaudeConfigController {
  constructor(
    @Inject(ReadAccountUseCase) private readonly account: ReadAccountUseCase,
    @Inject(ReadInstallationUseCase) private readonly installation: ReadInstallationUseCase,
    @Inject(CheckModelUseCase) private readonly modelCheck: CheckModelUseCase,
    @Inject(ReadModelsUseCase) private readonly models: ReadModelsUseCase,
    @Inject(ReadDefaultsUseCase) private readonly readDefaults: ReadDefaultsUseCase,
    @Inject(SaveDefaultsUseCase) private readonly saveDefaults: SaveDefaultsUseCase,
    @Inject(ClearFolderDefaultsUseCase) private readonly clearDefaults: ClearFolderDefaultsUseCase,
  ) {}

  @Get('account')
  readAccount(
    @Query(new ZodPipe(accountQuerySchema)) query: { refresh?: 'true' | 'false' },
    @CurrentUser() userId: UserId,
  ): Promise<AccountView> {
    return this.account.execute(userId, query.refresh === 'true');
  }

  @Get('installation')
  readInstallation(@CurrentUser() userId: UserId): Promise<InstallationView> {
    return this.installation.execute(userId);
  }

  @Post('diagnostics/model-check')
  @HttpCode(200)
  checkModel(
    @Body(new ZodPipe(modelCheckSchema)) body: { model?: string },
    @CurrentUser() userId: UserId,
  ): Promise<ModelCheckOutcome> {
    return this.modelCheck.execute(userId, body.model ?? null);
  }

  @Get('models')
  readModels(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<ModelsView> {
    return this.models.execute(userId, query.folder ?? null);
  }

  @Get('defaults')
  read(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsView> {
    return this.readDefaults.execute(userId, query.folder ?? null);
  }

  @Put('defaults')
  saveUser(
    @Body(new ZodPipe(userDefaultsSchema)) body: UserDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsView> {
    return this.saveDefaults.execute(userId, null, defaultsOf(body));
  }

  @Put('defaults/folder')
  saveFolder(
    @Body(new ZodPipe(folderDefaultsSchema)) body: FolderDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsView> {
    return this.saveDefaults.execute(userId, body.folder, defaultsOf(body));
  }

  @Delete('defaults/folder')
  @HttpCode(204)
  async clearFolder(
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.clearDefaults.execute(userId, query.folder);
  }
}
