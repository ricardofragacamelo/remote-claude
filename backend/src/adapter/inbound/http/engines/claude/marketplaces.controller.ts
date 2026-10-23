import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';

import type {
  ClaudePluginMarketplaceCatalogPayload,
  ClaudePluginMarketplaceListPayload,
} from '@remote-claude/contracts';
import {
  ListMarketplacePluginsUseCase,
  ListMarketplacesUseCase,
} from '@application/engines/claude';
import { BearerAuthGuard } from '../../auth/bearer.guard';
import { toMarketplaceCatalogDto, toMarketplaceListDto } from './plugins.dto';

/**
 * `/engines/claude/plugins/marketplaces…` — browsing the marketplaces this installation declares
 * (plan 13, B-47) and what each one's own catalogue lists. A separate controller from
 * `PluginsController`, registered before it in `ClaudeSettingsModule`'s `controllers`, so
 * `GET …/marketplaces` and `GET …/marketplaces/:name` are never shadowed by `PluginsController`'s
 * `:id` routes.
 *
 * Nothing here writes: installing is `POST /engines/claude/plugins/marketplace`, on
 * `PluginsController`, where every other write to the plugin store already lives.
 *
 * | Status | When |
 * |---|---|
 * | `200` | both routes |
 * | `401` | no bearer, or an invalid one |
 * | `403` | the name does not match a marketplace this installation declares |
 * | `502` | the marketplace's own source could not be reached or read |
 */
@Controller('engines/claude/plugins/marketplaces')
@UseGuards(BearerAuthGuard)
export class MarketplacesController {
  constructor(
    @Inject(ListMarketplacesUseCase) private readonly list: ListMarketplacesUseCase,
    @Inject(ListMarketplacePluginsUseCase)
    private readonly catalogOf: ListMarketplacePluginsUseCase,
  ) {}

  @Get()
  read(): ClaudePluginMarketplaceListPayload {
    return toMarketplaceListDto(this.list.execute());
  }

  @Get(':name')
  async readOne(@Param('name') name: string): Promise<ClaudePluginMarketplaceCatalogPayload> {
    return toMarketplaceCatalogDto(await this.catalogOf.execute(name));
  }
}
