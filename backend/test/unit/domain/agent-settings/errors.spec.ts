import { describe, expect, it } from 'vitest';

import {
  AgentSettingsForbiddenError,
  AgentSettingsInputInvalidError,
  DefaultModeNotAllowedError,
  EngineSettingsNotFoundError,
  ModelNotAvailableError,
} from '@domain/agent-settings';
import { httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

describe('the errors of the defaults of a session — S-12; plan 28, B-36', () => {
  it.each([
    [new ModelNotAvailableError('m'), 422, 'agentSettings.error.modelNotAvailable', { model: 'm' }],
    [
      new DefaultModeNotAllowedError('bypassPermissions'),
      422,
      'agentSettings.error.defaultModeNotAllowed',
      { mode: 'bypassPermissions' },
    ],
    [new AgentSettingsForbiddenError('server s1'), 403, 'agentSettings.error.forbidden', {}],
    [
      new AgentSettingsInputInvalidError('effortUnsupported', { model: 'm', level: 'max' }),
      400,
      'agentSettings.error.effortUnsupported',
      { model: 'm', level: 'max' },
    ],
    [
      new AgentSettingsInputInvalidError('fallbackSameAsModel', { model: 'm' }),
      400,
      'agentSettings.error.fallbackSameAsModel',
      { model: 'm' },
    ],
    [new EngineSettingsNotFoundError('gone'), 404, 'common.error.notFound', { engine: 'gone' }],
  ])('%s answers %i with its key and parameters', (error, status, messageKey, params) => {
    expect(httpStatusFor(error.code)).toBe(status);
    expect(error.messageKey).toBe(messageKey);
    expect(error.params).toEqual(params);
    expect(toErrorEnvelope(error, 't').error.httpEquivalent).toBe(status);
  });

  it('never echoes the id of somebody else’s thing back', () => {
    expect(new AgentSettingsForbiddenError('server s1').params).toEqual({});
  });
});
