import { Module } from '@nestjs/common';

import { BUNDLED_CLI_VERSION } from '@adapter/outbound/engines/claude/cli-version';
import { CLAUDE_CONVERSATION_IDS } from '@adapter/outbound/engines/claude/claude-conversation';
import {
  CLAUDE_INSTALLATION,
  readClaudeInstallation,
} from '@adapter/outbound/engines/claude/claude-installation';
import type { ClaudeInstallation } from '@adapter/outbound/engines/claude/claude-installation';
import { QUERY_FACTORY, realQueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { UuidGenerator } from '@shared/ids/uuid-generator';

/**
 * The engine `claude`, composed (ADR-025): the Agent SDK itself — the factory of every `query()`, the
 * version of the binary it spawns and the ids of new conversations —, for the modules that open one:
 * `session`, and the extension's installation for the probe and the test of the connection (plan
 * 13). One provider, so a test that replaces the SDK replaces it everywhere.
 *
 * This folder is the composition: the one place of the core allowed to import the extension.
 */
@Module({
  providers: [
    { provide: QUERY_FACTORY, useValue: realQueryFactory },
    // Read once: the CLI the SDK spawns and the SDK itself, from the files that pin them.
    { provide: CLAUDE_INSTALLATION, useFactory: () => readClaudeInstallation() },
    {
      provide: BUNDLED_CLI_VERSION,
      inject: [CLAUDE_INSTALLATION],
      useFactory: (installation: ClaudeInstallation) => installation.cli.version,
    },
    { provide: CLAUDE_CONVERSATION_IDS, useClass: UuidGenerator },
  ],
  exports: [QUERY_FACTORY, CLAUDE_INSTALLATION, BUNDLED_CLI_VERSION, CLAUDE_CONVERSATION_IDS],
})
export class ClaudeEngineModule {}
