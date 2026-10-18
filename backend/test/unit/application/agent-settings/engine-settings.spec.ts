import { describe, expect, it } from 'vitest';

import { EngineSettings } from '@application/agent-settings';
import { EngineSettingsNotFoundError } from '@domain/agent-settings';
import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import {
  FakeEngineModelCatalog,
  FakeEngineSessionDefaults,
} from '../../../support/fakes/engine-model-catalog';

const USER = UserId.create('auth|42');
const FOLDER = WorkspacePath.create('/srv/repo');

describe('the engines whose settings this installation keeps — plan 28, B-36', () => {
  it('lists the engines in the order they were registered', () => {
    const settings = new EngineSettings([
      new FakeEngineModelCatalog('claude'),
      new FakeEngineModelCatalog('codex'),
    ]);

    expect(settings.engines).toEqual(['claude', 'codex']);
  });

  it('answers the catalogue of an engine registered', () => {
    const catalog = new FakeEngineModelCatalog('claude');
    const settings = new EngineSettings([catalog]);

    expect(settings.catalog('claude')).toBe(catalog);
  });

  it('refuses an engine not registered', () => {
    const settings = new EngineSettings([new FakeEngineModelCatalog('claude')]);

    expect(() => {
      settings.catalog('codex');
    }).toThrow(EngineSettingsNotFoundError);
  });

  it('answers nothing for an engine with no extension of its own', async () => {
    const settings = new EngineSettings([new FakeEngineModelCatalog('claude')]);

    await expect(settings.optionsFor('claude', USER, FOLDER)).resolves.toEqual({
      outputStyle: null,
      stale: [],
    });
  });

  it('asks the extension registered for the engine', async () => {
    const extension = new FakeEngineSessionDefaults('claude', {
      outputStyle: 'Concise',
      stale: ['outputStyle'],
    });
    const settings = new EngineSettings([new FakeEngineModelCatalog('claude')], [extension]);

    await expect(settings.optionsFor('claude', USER, FOLDER)).resolves.toEqual({
      outputStyle: 'Concise',
      stale: ['outputStyle'],
    });
    expect(extension.calls).toBe(1);
  });
});
