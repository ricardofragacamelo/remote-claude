import { describe, expect, it } from 'vitest';

import {
  McpApprovalStaleError,
  McpServerConfigInvalidError,
  McpServerNameTakenError,
  McpServerNotFoundError,
  SecretStoreUnavailableError,
} from '@domain/mcp';
import { httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';

describe('the errors of MCP — S-12; plan 28, B-36', () => {
  it.each([
    [new McpServerNotFoundError('s1'), 404, 'mcp.error.serverNotFound', { serverId: 's1' }],
    [new McpServerNameTakenError('gh'), 409, 'mcp.error.serverNameTaken', { name: 'gh' }],
    [
      new McpServerConfigInvalidError('doubleUnderscore', 'name'),
      422,
      'mcp.error.serverConfigInvalid',
      { rule: 'doubleUnderscore', field: 'name' },
    ],
    [
      new McpApprovalStaleError('/r', 'gh'),
      409,
      'mcp.error.approvalStale',
      { folder: '/r', name: 'gh' },
    ],
    [new SecretStoreUnavailableError(), 503, 'mcp.error.secretStoreUnavailable', {}],
  ])('%s answers %i with its key and parameters', (error, status, messageKey, params) => {
    expect(httpStatusFor(error.code)).toBe(status);
    expect(error.messageKey).toBe(messageKey);
    expect(error.params).toEqual(params);
    expect(toErrorEnvelope(error, 't').error.httpEquivalent).toBe(status);
  });
});
