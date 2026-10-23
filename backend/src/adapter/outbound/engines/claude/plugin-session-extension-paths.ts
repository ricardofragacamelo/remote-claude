import { Inject, Injectable } from '@nestjs/common';

import { PLUGIN_REPOSITORY } from '@application/engines/claude';
import type { PluginRepository } from '@application/engines/claude';
import type {
  SessionExtensionPathsRequest,
  SessionExtensionPathsSource,
} from '@application/session';
import { MARKETPLACE_ALLOWLIST_SOURCE } from '@application/workspace';
import type { MarketplaceAllowlistSource } from '@application/workspace';
import { CLAUDE_ENGINE } from './claude-engine';

/**
 * `session` asking the Claude extension which plugin directories a new session opens with (plan 13,
 * B-27, B-47) — implements the core's own {@link SessionExtensionPathsSource}, the same shape
 * {@link import('./project-mcp-file.reader').ClaudeProjectMcpFileReader} already has for
 * `ProjectMcpServersSource`: the core declares a neutral port, and this engine's adapter is what
 * answers it — no registry needed, since (unlike MCP, a capability several engines could carry)
 * plugins exist only here, and a request for any other engine simply gets nothing back.
 *
 * Only an *enabled* plugin's path is handed over — never a disabled one, and never gated on whether
 * its manifest still matches what was approved (B-27, D-65): a plugin whose manifest changed loads
 * with whatever is on disk right now, same as an untouched one — disabling or removing it is the
 * only control a user has today, until a re-approval action exists to give "changed" a narrower
 * meaning (the same kind of half-built edge D-41 and D-45 already left for B-24 and B-22).
 *
 * A **marketplace** plugin is left out of this list the moment its own marketplace is no longer
 * declared in the allowlist file (plan 13, B-47; S-213) — checked fresh on every call, against the
 * very same `MarketplaceAllowlistSource` a `SIGHUP` reload updates, so a marketplace removed from
 * the file stops composing into any *new* session from that reload onward, with no event to listen
 * for: this is simply what the list already answers on the next ask.
 */
@Injectable()
export class ClaudePluginSessionExtensionPaths implements SessionExtensionPathsSource {
  constructor(
    @Inject(PLUGIN_REPOSITORY) private readonly plugins: PluginRepository,
    @Inject(MARKETPLACE_ALLOWLIST_SOURCE) private readonly marketplaces: MarketplaceAllowlistSource,
  ) {}

  async pathsFor(request: SessionExtensionPathsRequest): Promise<readonly string[]> {
    if (request.engine !== CLAUDE_ENGINE) {
      return [];
    }

    const stored = await this.plugins.listFor(request.userId);
    return stored
      .filter((plugin) => plugin.enabled)
      .filter(
        (plugin) =>
          plugin.origin !== 'marketplace' ||
          (plugin.marketplace !== null && this.marketplaces.find(plugin.marketplace) !== null),
      )
      .map((plugin) => plugin.path);
  }
}
