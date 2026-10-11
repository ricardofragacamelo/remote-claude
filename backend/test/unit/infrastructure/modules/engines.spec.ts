import { describe, expect, it } from 'vitest';

import type { FactoryProvider, ValueProvider } from '@nestjs/common';

import { ToolClassifiers } from '@application/engine';
import type { EngineToolClassifier } from '@application/engine';
import { EngineId } from '@domain/engine';
import type { AppConfig } from '@infra/config/environment';
import { enabledEngines, engineToolClassifierProviders } from '@infra/modules/engines';
import { CLAUDE_TOOL_CLASSIFIER } from '@infra/modules/engines/claude.providers';

const claude = { engine: EngineId.create('claude') };
const other = { engine: EngineId.create('test-engine') };

describe('the engines the configuration enables — plan 28, S-28', () => {
  it('enables every registered engine when the list is empty, the first by default', () => {
    expect(enabledEngines([claude, other], { enabled: [], default: null })).toEqual({
      enabled: [claude, other],
      defaultEngine: 'claude',
    });
  });

  it('enables the engines named, in their order, and the default named', () => {
    expect(
      enabledEngines([claude, other], { enabled: ['test-engine'], default: 'test-engine' }),
    ).toEqual({ enabled: [other], defaultEngine: 'test-engine' });
  });

  it('refuses the boot with an engine no adapter registers', () => {
    expect(() => enabledEngines([claude], { enabled: ['codex'], default: null })).toThrow(
      'no adapter registers: codex',
    );
    expect(() => enabledEngines([claude], { enabled: [], default: 'codex' })).toThrow(
      'no adapter registers: codex',
    );
  });

  it('refuses a default that is not one of the engines enabled', () => {
    expect(() =>
      enabledEngines([claude, other], { enabled: ['claude'], default: 'test-engine' }),
    ).toThrow('is not one of RC_ENGINES_ENABLED');
  });
});

describe('the classifiers the composition hands over — plan 28, D-31', () => {
  const claudeClassifier = (
    engineToolClassifierProviders.find(
      (provider) => (provider as ValueProvider).provide === CLAUDE_TOOL_CLASSIFIER,
    ) as ValueProvider<EngineToolClassifier>
  ).useValue;
  const registry = engineToolClassifierProviders.find(
    (provider) => (provider as FactoryProvider).provide === ToolClassifiers,
  ) as FactoryProvider<ToolClassifiers>;
  const build = (engines: AppConfig['engines']) =>
    registry.useFactory({ engines } as AppConfig, claudeClassifier) as ToolClassifiers;

  it('registers the classifier of Claude, which reads a call of its own', () => {
    expect(claudeClassifier.engine).toBe('claude');
    expect(claudeClassifier.classify('Bash', { command: 'ls' }, '').kind).toBe('shell');
  });

  it('routes a record with no engine to the default one enabled', () => {
    const classifiers = build({ enabled: [], default: null });

    expect(classifiers.classify(null, 'Read', { file_path: '/a' }).kind).toBe('file.read');
  });

  it('refuses the boot with a default no classifier registers, as the other registries do', () => {
    expect(() => build({ enabled: [], default: 'codex' })).toThrow('no adapter registers: codex');
  });
});
