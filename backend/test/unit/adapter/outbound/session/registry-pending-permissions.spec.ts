import { describe, expect, it } from 'vitest';

import { PermissionRegistry } from '@application/permission';
import { RegistryPendingPermissions } from '@adapter/outbound/session/registry-pending-permissions';
import { PermissionRequest } from '@domain/permission';
import { SessionId } from '@domain/session';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
} from '../../../../support/builders/permission.builder';
import { claudeTool } from '../../../../support/builders/tool.builder';

const OTHER_SESSION = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1');
const WRITE = { file_path: '/srv/projects/app/a.ts', content: 'x' };

/** A request of [sessionId] about the call [toolUseId]. */
function requestOf(
  id: string,
  toolUseId: string | null,
  sessionId: SessionId = PERMISSION_SESSION,
): PermissionRequest {
  return PermissionRequest.open({
    id,
    sessionId,
    userId: PERMISSION_OWNER,
    projectPath: null,
    toolUseId,
    toolName: 'Write',
    input: WRITE,
    tool: claudeTool('Write', WRITE),
    riskHint: 'write',
    requestedAt: PERMISSION_NOW,
    expiresAt: PERMISSION_NOW,
  });
}

/** `session` asking `permission` about the questions a session waits on — plan 08 B-07, plan 28 B-17. */
describe('RegistryPendingPermissions', () => {
  it('counts the questions each session is waiting on', () => {
    const registry = new PermissionRegistry();
    registry.add(requestOf('r1', 'toolu-1'));
    registry.add(requestOf('r2', 'toolu-2'));
    registry.add(requestOf('r3', 'toolu-3', OTHER_SESSION));
    const pending = new RegistryPendingPermissions(registry);

    expect(pending.countFor(PERMISSION_SESSION)).toBe(2);
    expect(pending.countFor(OTHER_SESSION)).toBe(1);
  });

  it('hands over the call a pending question is about, by its tool call id', () => {
    const registry = new PermissionRegistry();
    registry.add(requestOf('r1', 'toolu-1'));
    const pending = new RegistryPendingPermissions(registry);

    expect(pending.toolOf(PERMISSION_SESSION, 'toolu-1')).toEqual(claudeTool('Write', WRITE));
  });

  it('knows no call of another session, of a call nobody asked about, or of one settled', () => {
    const registry = new PermissionRegistry();
    const settled = requestOf('r2', 'toolu-2');
    registry.add(requestOf('r1', 'toolu-1', OTHER_SESSION));
    registry.add(requestOf('r3', null));
    registry.add(settled);
    settled.resolve(PermissionRequest.expiry(PERMISSION_NOW));
    const pending = new RegistryPendingPermissions(registry);

    expect(pending.toolOf(PERMISSION_SESSION, 'toolu-1')).toBeNull();
    expect(pending.toolOf(PERMISSION_SESSION, 'toolu-none')).toBeNull();
    expect(pending.toolOf(PERMISSION_SESSION, 'toolu-2')).toBeNull();
  });
});
