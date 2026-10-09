import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NodeInstallationFacts,
  PATH_CLI_TTL_MS,
  versionInOutput,
} from '@adapter/outbound/claude/installation-facts.adapter';
import {
  toInstallationAccount,
  toInstallationAgent,
  toSessionInitialization,
} from '@adapter/outbound/claude/initialization-mapping';
import { loadInitialization } from '../../../../fakes/agent-sdk/fixture';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

/** A clock a test moves by hand. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let at = 1_000;
  return {
    now: () => at,
    advance: (ms) => {
      at += ms;
    },
  };
}

describe('what the installation is made of — plan 13, B-11', () => {
  it('reads the version out of what `claude --version` printed', () => {
    expect(versionInOutput('2.1.226 (Claude Code)\n')).toBe('2.1.226');
    expect(versionInOutput('claude, some build')).toBeNull();
  });

  it('reads the `claude` on PATH once in a while, and says when there is none — S-27', async () => {
    const time = clock();
    let asked = 0;
    const facts = new NodeInstallationFacts(
      new RecordingLogger().logger,
      () => {
        asked += 1;
        return Promise.resolve('2.0.1 (Claude Code)');
      },
      {},
      time.now,
    );

    expect(await facts.pathCli()).toEqual({ version: '2.0.1', reason: null });
    expect(await facts.pathCli()).toEqual({ version: '2.0.1', reason: null });
    expect(asked).toBe(1);

    time.advance(PATH_CLI_TTL_MS);
    await facts.pathCli();
    expect(asked).toBe(2);
    expect(facts.bundledCli.version).toEqual(expect.any(String));
    expect(facts.agentSdk.version).toEqual(expect.any(String));
  });

  it('says not installed when nothing answers, and unreadable when it answers nonsense', async () => {
    const logger = new RecordingLogger();
    const absent = new NodeInstallationFacts(
      logger.logger,
      () => Promise.reject(new Error('ENOENT')),
      {},
    );
    const garbled = new NodeInstallationFacts(logger.logger, () => Promise.resolve('what?'), {});

    expect(await absent.pathCli()).toEqual({ version: null, reason: 'notInstalled' });
    expect(await garbled.pathCli()).toEqual({ version: null, reason: 'unreadable' });
    expect(logger.withOp('claude.installation')).toHaveLength(1);
  });

  it('reads an empty CLAUDE_CONFIG_DIR as absent, and names the directory in effect — S-28', () => {
    const logger = new RecordingLogger().logger;
    const run = () => Promise.resolve('');
    const home = path.join(os.homedir(), '.claude');

    expect(new NodeInstallationFacts(logger, run, { CLAUDE_CONFIG_DIR: '' }).configDir).toEqual({
      path: home,
      fromEnvironment: false,
    });
    expect(new NodeInstallationFacts(logger, run, { CLAUDE_CONFIG_DIR: '   ' }).configDir).toEqual({
      path: home,
      fromEnvironment: false,
    });
    expect(
      new NodeInstallationFacts(logger, run, { CLAUDE_CONFIG_DIR: '/srv/claude' }).configDir,
    ).toEqual({
      path: '/srv/claude',
      fromEnvironment: true,
    });
  });
});

describe('the initialisation, in our words — plan 13, D-05, D-07', () => {
  it('maps the recorded initialisation: commands, agents, models, styles and the account', () => {
    const { initialization } = loadInitialization();

    const mapped = toSessionInitialization(initialization);

    expect(mapped.models.map((model) => model.value)).toEqual(
      initialization.models.map((model) => model.value),
    );
    expect(mapped.outputStyles).toEqual(initialization.available_output_styles);
    expect(mapped.commands).toHaveLength(initialization.commands.length);
    expect(mapped.account.email).toBe('person@example.com');
  });

  it('keeps of the credential only the names of its sources, and reads empty as nothing', () => {
    expect(
      toInstallationAccount({
        email: '',
        organization: 'Example',
        subscriptionType: 'max',
        apiProvider: 'firstParty',
        tokenSource: 'claude.ai',
        apiKeySource: 'none',
      }),
    ).toEqual({
      email: null,
      organization: 'Example',
      plan: 'max',
      provider: 'firstParty',
      tokenSource: 'claude.ai',
      apiKeySource: 'none',
    });
    expect(toInstallationAccount(undefined)).toEqual({
      email: null,
      organization: null,
      plan: null,
      provider: null,
      tokenSource: null,
      apiKeySource: null,
    });
  });

  it('maps a subagent, with no model when it names none', () => {
    expect(toInstallationAgent({ name: 'writer', description: 'writes' })).toEqual({
      name: 'writer',
      description: 'writes',
      model: null,
    });
  });
});
