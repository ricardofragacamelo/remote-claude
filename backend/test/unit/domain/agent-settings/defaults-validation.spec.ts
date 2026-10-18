import { describe, expect, it } from 'vitest';

import {
  AgentSettingsInputInvalidError,
  DefaultModeNotAllowedError,
  ModelNotAvailableError,
  needsCatalogue,
  NO_DEFAULTS,
  validateDefaults,
} from '@domain/agent-settings';
import type { AgentDefaults } from '@domain/agent-settings';
import type { InstallationModel } from '@domain/session';

const model = (
  value: string,
  levels: InstallationModel['supportedEffortLevels'] = [],
): InstallationModel => ({
  value,
  resolvedModel: value === 'sonnet' ? 'claude-sonnet-5' : null,
  displayName: value,
  description: '',
  supportedEffortLevels: levels,
});

const MODELS = [
  model('default', ['low', 'high']),
  model('sonnet', ['low', 'medium', 'high']),
  model('haiku'),
];

const set = (values: Partial<AgentDefaults>): AgentDefaults => ({ ...NO_DEFAULTS, ...values });

describe('what a default may set — plan 13, B-14', () => {
  it('needs the catalogue only for what names a model or an effort', () => {
    expect(needsCatalogue(set({ permissionMode: 'readOnly', thinking: 'off' }))).toBe(false);
    expect(needsCatalogue(set({ effort: 'low' }))).toBe(true);
    expect(needsCatalogue(set({ fallbackModel: 'haiku' }))).toBe(true);
  });

  it('accepts what the installation offers, by value or by the id an alias resolves to', () => {
    expect(() => {
      validateDefaults(
        set({ model: 'claude-sonnet-5', effort: 'medium', fallbackModel: 'haiku' }),
        MODELS,
      );
    }).not.toThrow();
  });

  it('refuses bypassPermissions as a default — S-40', () => {
    expect(() => {
      validateDefaults({ ...NO_DEFAULTS, permissionMode: 'bypassPermissions' } as never, MODELS);
    }).toThrow(DefaultModeNotAllowedError);
  });

  it('refuses a model or a fallback the installation does not offer — S-39', () => {
    expect(() => {
      validateDefaults(set({ model: 'gone' }), MODELS);
    }).toThrow(ModelNotAvailableError);
    expect(() => {
      validateDefaults(set({ fallbackModel: 'gone' }), MODELS);
    }).toThrow(ModelNotAvailableError);
  });

  it('refuses an effort the model does not take, against the default entry when no model is set — S-41', () => {
    expect(() => {
      validateDefaults(set({ model: 'haiku', effort: 'low' }), MODELS);
    }).toThrow(AgentSettingsInputInvalidError);
    expect(() => {
      validateDefaults(set({ effort: 'medium' }), MODELS);
    }).toThrow(/effortUnsupported/);
    expect(() => {
      validateDefaults(set({ effort: 'high' }), MODELS);
    }).not.toThrow();
  });

  it('refuses a fallback equal to the main model — S-41', () => {
    expect(() => {
      validateDefaults(set({ model: 'sonnet', fallbackModel: 'sonnet' }), MODELS);
    }).toThrow(/fallbackSameAsModel/);
  });
});
