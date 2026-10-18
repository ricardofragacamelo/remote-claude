import { describe, expect, it } from 'vitest';

import {
  PluginMarketplaceNotAllowedError,
  PluginNotFoundError,
  PluginPathInvalidError,
  PluginSourceUnavailableError,
  SkillNameInvalidError,
} from '@domain/engines/claude';
import { httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

describe('the errors of Claude’s extension — plan 13, S-12; plan 28, B-37', () => {
  it.each([
    [new PluginNotFoundError('p1'), 404, 'engines.claude.error.pluginNotFound', { pluginId: 'p1' }],
    [
      new PluginPathInvalidError('noManifest'),
      422,
      'engines.claude.error.pluginPathInvalid',
      { reason: 'noManifest' },
    ],
    [
      new PluginMarketplaceNotAllowedError('x'),
      403,
      'engines.claude.error.pluginMarketplaceNotAllowed',
      { marketplace: 'x' },
    ],
    [
      new PluginSourceUnavailableError('x'),
      502,
      'engines.claude.error.pluginSourceUnavailable',
      { marketplace: 'x' },
    ],
    [
      new SkillNameInvalidError('Bad Name'),
      400,
      'engines.claude.error.skillNameInvalid',
      { name: 'Bad Name' },
    ],
  ])('%s answers %i with its key and parameters', (error, status, messageKey, params) => {
    expect(httpStatusFor(error.code)).toBe(status);
    expect(error.messageKey).toBe(messageKey);
    expect(error.params).toEqual(params);
    expect(toErrorEnvelope(error, 't').error.httpEquivalent).toBe(status);
  });
});
