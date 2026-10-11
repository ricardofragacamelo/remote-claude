import { describe, expect, it } from 'vitest';
import type { ValueProvider } from '@nestjs/common';

import { CLAUDE_CONFIG_FILES } from '@adapter/outbound/engines/claude/security-contract';
import { SensitiveFiles } from '@domain/files';
import {
  ENGINE_SENSITIVE_FILES,
  engineRegistryOf,
  engineSensitiveFileProviders,
  sensitiveFilesOf,
} from '@infra/modules/engines';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { StubEngine } from '../../../support/fakes/stub-engine';

/** An engine registered whose adapter could not prove that it isolates its own approvals. */
function unsafeEngine(): StubEngine {
  const engine = new StubEngine('test-engine');
  engine.security = {
    configFiles: ['.test-engine/config.json'],
    assert: () => ({ holds: false, unmet: ['noSelfApproval'] }),
  };
  return engine;
}

describe('the registry the composition builds — plan 28, B-35, S-102', () => {
  it('says at warn which engine failed its assertion, and which clauses, and boots with the others', async () => {
    const recording = new RecordingLogger();
    const registry = engineRegistryOf(
      [new StubEngine('claude'), unsafeEngine()],
      { enabled: [], default: null },
      recording.logger,
    );

    expect(recording.withOp('engine.security.assert')).toEqual([
      expect.objectContaining({
        level: 'warn',
        engine: 'test-engine',
        unmet: ['noSelfApproval'],
      }),
    ]);
    expect(registry.default.engine.value).toBe('claude');
    expect((await registry.describeAll()).map((each) => each.state)).toEqual([
      'available',
      'unavailable',
    ]);
  });

  it('says nothing when every assertion holds', () => {
    const recording = new RecordingLogger();

    engineRegistryOf([new StubEngine('claude')], { enabled: [], default: null }, recording.logger);

    expect(recording.withOp('engine.security.assert')).toEqual([]);
  });

  it('still refuses a configuration nobody can run — S-28', () => {
    expect(() =>
      engineRegistryOf(
        [new StubEngine('claude')],
        { enabled: ['codex'], default: null },
        new RecordingLogger().logger,
      ),
    ).toThrow('no adapter registers: codex');
  });
});

describe('the sensitive files the composition hands over — plan 28, B-35, S-103', () => {
  it('are the configuration files of every registered engine, each once', () => {
    const files = sensitiveFilesOf([
      new StubEngine('claude').security,
      unsafeEngine().security,
      { configFiles: ['.stub/config.json'], assert: () => ({ holds: true }) },
    ]);

    expect(files.files).toEqual(['.stub/config.json', '.test-engine/config.json']);
    expect(files.touchedBy('.test-engine')).toBe(true);
  });

  it('are, in the product, the files the engine of Claude declares — the same three as before', () => {
    const provided = engineSensitiveFileProviders.find(
      (provider) => (provider as ValueProvider).provide === ENGINE_SENSITIVE_FILES,
    ) as ValueProvider<SensitiveFiles>;

    expect(provided.useValue).toBeInstanceOf(SensitiveFiles);
    expect(provided.useValue.files).toEqual([...CLAUDE_CONFIG_FILES]);
    expect(provided.useValue.files).toEqual([
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.mcp.json',
    ]);
  });
});
