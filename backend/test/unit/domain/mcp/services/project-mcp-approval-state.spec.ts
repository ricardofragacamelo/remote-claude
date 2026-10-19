import { describe, expect, it } from 'vitest';

import { projectMcpApprovalStateOf } from '@domain/mcp';

describe('where an entry of a project MCP file stands — plan 13, B-24, S-100', () => {
  it('is pending with no decision at all', () => {
    expect(projectMcpApprovalStateOf('digest-1', null)).toBe('pending');
  });

  it('is approved when the decision is approved at the current digest', () => {
    expect(
      projectMcpApprovalStateOf('digest-1', { decision: 'approved', digest: 'digest-1' }),
    ).toBe('approved');
  });

  it('is changed when approved at a digest that is no longer the current one — S-103', () => {
    expect(
      projectMcpApprovalStateOf('digest-2', { decision: 'approved', digest: 'digest-1' }),
    ).toBe('changed');
  });

  it('is rejected regardless of the current digest — a rejection never widens, so nothing reopens it', () => {
    expect(
      projectMcpApprovalStateOf('digest-1', { decision: 'rejected', digest: 'digest-1' }),
    ).toBe('rejected');
    expect(
      projectMcpApprovalStateOf('digest-2', { decision: 'rejected', digest: 'digest-1' }),
    ).toBe('rejected');
  });
});
