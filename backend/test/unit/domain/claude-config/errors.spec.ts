import { describe, expect, it } from 'vitest';

import {
  ClaudeConfigForbiddenError,
  ClaudeConfigInputInvalidError,
  DefaultModeNotAllowedError,
  McpApprovalStaleError,
  McpServerConfigInvalidError,
  McpServerNameTakenError,
  McpServerNotFoundError,
  ModelNotAvailableError,
  PluginMarketplaceNotAllowedError,
  PluginNotFoundError,
  PluginPathInvalidError,
  PluginSourceUnavailableError,
  SecretStoreUnavailableError,
} from '@domain/claude-config';
import { httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

describe('the errors of claude-config — S-12', () => {
  it.each([
    [
      new McpServerNotFoundError('s1'),
      404,
      'claudeConfig.error.mcpServerNotFound',
      { serverId: 's1' },
    ],
    [
      new McpServerNameTakenError('gh'),
      409,
      'claudeConfig.error.mcpServerNameTaken',
      { name: 'gh' },
    ],
    [
      new McpServerConfigInvalidError('doubleUnderscore', 'name'),
      422,
      'claudeConfig.error.mcpServerConfigInvalid',
      { rule: 'doubleUnderscore', field: 'name' },
    ],
    [
      new McpApprovalStaleError('/r', 'gh'),
      409,
      'claudeConfig.error.mcpApprovalStale',
      { folder: '/r', name: 'gh' },
    ],
    [new ModelNotAvailableError('m'), 422, 'claudeConfig.error.modelNotAvailable', { model: 'm' }],
    [
      new DefaultModeNotAllowedError('bypassPermissions'),
      422,
      'claudeConfig.error.defaultModeNotAllowed',
      { mode: 'bypassPermissions' },
    ],
    [new PluginNotFoundError('p1'), 404, 'claudeConfig.error.pluginNotFound', { pluginId: 'p1' }],
    [
      new PluginPathInvalidError('noManifest'),
      422,
      'claudeConfig.error.pluginPathInvalid',
      { reason: 'noManifest' },
    ],
    [
      new PluginMarketplaceNotAllowedError('x'),
      403,
      'claudeConfig.error.pluginMarketplaceNotAllowed',
      { marketplace: 'x' },
    ],
    [
      new PluginSourceUnavailableError('x'),
      502,
      'claudeConfig.error.pluginSourceUnavailable',
      { marketplace: 'x' },
    ],
    [new ClaudeConfigForbiddenError('server s1'), 403, 'claudeConfig.error.forbidden', {}],
    [new SecretStoreUnavailableError(), 503, 'claudeConfig.error.secretStoreUnavailable', {}],
    [
      new ClaudeConfigInputInvalidError('effortUnsupported', { model: 'm', level: 'max' }),
      400,
      'claudeConfig.error.effortUnsupported',
      { model: 'm', level: 'max' },
    ],
    [
      new ClaudeConfigInputInvalidError('fallbackSameAsModel', { model: 'm' }),
      400,
      'claudeConfig.error.fallbackSameAsModel',
      { model: 'm' },
    ],
    [
      new ClaudeConfigInputInvalidError('skillNameInvalid'),
      400,
      'claudeConfig.error.skillNameInvalid',
      {},
    ],
  ])('%s answers %i with its key and parameters', (error, status, messageKey, params) => {
    expect(httpStatusFor(error.code)).toBe(status);
    expect(error.messageKey).toBe(messageKey);
    expect(error.params).toEqual(params);
    expect(toErrorEnvelope(error, 't').error.httpEquivalent).toBe(status);
  });

  it('never echoes the id of somebody else’s thing back', () => {
    expect(new ClaudeConfigForbiddenError('server s1').params).toEqual({});
  });
});
