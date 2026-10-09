import { Module } from '@nestjs/common';

import { BUNDLED_CLI_VERSION, bundledCliVersion } from '@adapter/outbound/claude/cli-version';
import { QUERY_FACTORY, realQueryFactory } from '@adapter/outbound/claude/query.factory';

/**
 * The Agent SDK itself — the factory of every `query()` and the version of the binary it spawns —,
 * for the two modules that open one: `session`, and `claude-config` for the probe and the test of
 * the connection (plan 13). One provider, so a test that replaces the SDK replaces it everywhere.
 */
@Module({
  providers: [
    { provide: QUERY_FACTORY, useValue: realQueryFactory },
    { provide: BUNDLED_CLI_VERSION, useFactory: () => bundledCliVersion() },
  ],
  exports: [QUERY_FACTORY, BUNDLED_CLI_VERSION],
})
export class ClaudeSdkModule {}
