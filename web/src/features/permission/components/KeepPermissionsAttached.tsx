import { usePermissionAttachment } from '../hooks/usePermissionAttachment';

export interface KeepPermissionsAttachedProps {
  readonly sessionId: string;
}

/**
 * Keeps a session's questions arriving while nothing on screen shows its queue — a folder tab that
 * is not the active one. Renders nothing: the question waits in the queue for the tab to come back.
 */
export function KeepPermissionsAttached({ sessionId }: KeepPermissionsAttachedProps): null {
  usePermissionAttachment(sessionId);
  return null;
}
