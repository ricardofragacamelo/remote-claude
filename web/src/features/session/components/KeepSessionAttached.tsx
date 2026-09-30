import { useLiveSessionAttachment } from '../hooks/useLiveSessionAttachment';

export interface KeepSessionAttachedProps {
  readonly sessionId: string;
}

/**
 * Keeps a session's conversation arriving while nothing on screen shows it — a folder tab that is
 * not the active one. Renders nothing.
 */
export function KeepSessionAttached({ sessionId }: KeepSessionAttachedProps): null {
  useLiveSessionAttachment(sessionId);
  return null;
}
